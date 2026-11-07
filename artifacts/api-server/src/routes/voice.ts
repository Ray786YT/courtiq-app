import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { isStatField, STAT_FIELDS, STAT_FIELD_LABELS, type StatField } from "@workspace/db";
import { ProcessVoiceBody, ProcessVoiceResponse } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import {
  applyDelta,
  findSession,
  listPlayers,
  sessionTotals,
} from "../lib/store";
import { logger } from "../lib/logger";

const MODEL = process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-5";
const MAX_TRANSCRIPT_CHARS = 8_000;

/**
 * Pull the change list out of whatever the model returned.
 *
 * Accepts a bare JSON array, a fenced code block, or an object wrapping the
 * array under a common key. Falls back to scanning for the first array literal
 * in the text. Any shape it cannot read yields an empty list rather than an
 * error, because a missed recording should never take the endpoint down.
 */
function extractChanges(text: string): ParsedChange[] {
  if (!text) return [];

  const candidates: string[] = [];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  candidates.push(text);

  const bracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (bracket !== -1 && lastBracket > bracket) {
    candidates.push(text.slice(bracket, lastBracket + 1));
  }

  for (const candidate of candidates) {
    let value: unknown;
    try {
      value = JSON.parse(candidate);
    } catch {
      continue;
    }

    if (Array.isArray(value)) return value as ParsedChange[];

    if (value && typeof value === "object") {
      for (const key of ["changes", "updates", "stats", "results"]) {
        const inner = (value as Record<string, unknown>)[key];
        if (Array.isArray(inner)) return inner as ParsedChange[];
      }
    }
  }

  return [];
}

const router: IRouter = Router();

type ParsedChange = { player: string; stat: string; delta: number };

function buildSystemPrompt(playerNames: string[]): string {
  const statList = STAT_FIELDS.map(
    (field) => `- ${field}: ${STAT_FIELD_LABELS[field]}`,
  ).join("\n");

  return `You convert a coach's spoken practice or game summary into volleyball stat changes.

Roster (use these names exactly, spelled exactly as written):
${playerNames.map((name) => `- ${name}`).join("\n")}

Valid stat fields:
${statList}

Return ONLY a JSON array, no prose and no code fence:
[{ "player": "Name", "stat": "statFieldName", "delta": 1 }]

Rules:
- One entry per distinct stat change. Three kills is a single entry with delta 3, not three entries.
- delta is negative only when the coach is correcting or taking something away.
- Match spoken names to the roster phonetically. "Aiden" means "Aidan", "Ayan" means "Ayaan".
- If a name is not on the roster, skip it rather than guessing at a different player.
- Every swing is a hittingAttempts. A kill is also a hitsIn, an error is also a hittingErrors.
  So a kill adds to BOTH hittingAttempts and hitsIn, unless the coach clearly states the
  attempt count separately, in which case use their number for hittingAttempts.
- Speech-to-text writes numbers as words. "two" is 2, "a couple" is 2, "a few" is 3.
- Be generous about phrasing. Coaches do not speak in stat names.

Worked examples:

"Aidan had three hitting attempts and they were all successful"
[{"player":"Aidan","stat":"hittingAttempts","delta":3},{"player":"Aidan","stat":"hitsIn","delta":3}]

"Ethan got two kills and Aidan had one ace"
[{"player":"Ethan","stat":"hittingAttempts","delta":2},{"player":"Ethan","stat":"hitsIn","delta":2},{"player":"Aidan","stat":"aces","delta":1}]

"Nathan shanked two passes"
[{"player":"Nathan","stat":"pass0","delta":2}]

"Michael missed his serve twice"
[{"player":"Michael","stat":"servingErrors","delta":2}]

"scrap that last one for Omar, he only had one block"
[{"player":"Omar","stat":"blocks","delta":-1}]

Return [] when the transcript contains no stat changes.`;
}

router.post("/voice", requireAuth, async (req, res) => {
  const body = ProcessVoiceBody.parse(req.body);

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    res.status(503).json({ error: "Voice parsing is not configured on this server" });
    return;
  }

  const session = await findSession(req.teamId!, body.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const transcript = body.transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS);
  if (!transcript) {
    res.json(ProcessVoiceResponse.parse({ changes: [], updated: [], unmatched: [] }));
    return;
  }

  const players = await listPlayers(req.teamId!);

  // Only the roster names go to the model, not every player's full stat line.
  // The old version sent the entire database on every recording.
  const byLowerName = new Map(players.map((p) => [p.name.toLowerCase(), p]));

  const client = new Anthropic({ apiKey });

  let parsed: ParsedChange[] = [];
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: buildSystemPrompt(players.map((p) => p.name)),
      messages: [{ role: "user", content: `Transcript: ${transcript}` }],
    });

    // Read every text block, not just the first one. Current models can put a
    // thinking block at content[0], and taking content[0] blindly meant the
    // parser silently saw nothing and reported "no changes found" for a
    // perfectly good recording.
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    parsed = extractChanges(text);
  } catch (error) {
    logger.error({ err: error }, "Voice parsing failed");
    res.status(502).json({ error: "Could not parse that recording. Try again." });
    return;
  }

  const changes: Array<{
    playerId: number;
    playerName: string;
    stat: StatField;
    delta: number;
  }> = [];
  const unmatched: string[] = [];

  for (const change of parsed) {
    if (typeof change?.player !== "string" || typeof change?.stat !== "string") continue;

    const delta = Math.trunc(Number(change.delta));
    if (!Number.isFinite(delta) || delta === 0) continue;

    if (!isStatField(change.stat)) continue;

    const player = byLowerName.get(change.player.trim().toLowerCase());
    if (!player) {
      if (!unmatched.includes(change.player)) unmatched.push(change.player);
      continue;
    }

    changes.push({
      playerId: player.id,
      playerName: player.name,
      stat: change.stat,
      delta,
    });
  }

  const touched = new Set<number>();
  for (const change of changes) {
    await applyDelta({
      sessionId: body.sessionId,
      playerId: change.playerId,
      stat: change.stat,
      delta: change.delta,
    });
    touched.add(change.playerId);
  }

  const all = await sessionTotals(req.teamId!, body.sessionId);
  const updated = all.filter((entry) => touched.has(entry.player.id));

  res.json(ProcessVoiceResponse.parse({ changes, updated, unmatched }));
});

export default router;
