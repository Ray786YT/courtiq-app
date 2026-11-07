import { Router, type IRouter } from "express";
import { isStatField } from "@workspace/db";
import {
  GetPlayerHistoryResponse,
  GetStatsResponse,
  ResetSessionStatsBody,
  ResetSessionStatsResponse,
  SetStatBody,
  SetStatResponse,
  UpdateStatBody,
  UpdateStatResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import {
  applyDelta,
  findPlayer,
  findSession,
  playerHistory,
  resetSession,
  seasonTotals,
  sessionTotals,
  setStatValue,
  sumStatLines,
  toPublicPlayer,
} from "../lib/store";

const router: IRouter = Router();

router.get("/players/:playerId/history", requireAuth, async (req, res) => {
  const playerId = Number(req.params["playerId"]);
  if (!Number.isInteger(playerId)) {
    res.status(400).json({ error: "playerId must be an integer" });
    return;
  }

  const player = await findPlayer(req.teamId!, playerId);
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const entries = await playerHistory(req.teamId!, playerId);

  res.json(
    GetPlayerHistoryResponse.parse({
      player: toPublicPlayer(player),
      total: sumStatLines(entries.map((entry) => entry.stats)),
      entries,
    }),
  );
});

router.get("/stats", requireAuth, async (req, res) => {
  const rawSessionId = req.query["sessionId"];

  if (rawSessionId === undefined || rawSessionId === "") {
    const players = await seasonTotals(req.teamId!);
    res.json(GetStatsResponse.parse({ scope: "season", players }));
    return;
  }

  const sessionId = Number(rawSessionId);
  if (!Number.isInteger(sessionId)) {
    res.status(400).json({ error: "sessionId must be an integer" });
    return;
  }

  const session = await findSession(req.teamId!, sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const players = await sessionTotals(req.teamId!, sessionId);
  res.json(GetStatsResponse.parse({ scope: "session", sessionId, players }));
});

/** Shared guard: the session and the player must both belong to the caller's team. */
async function resolveTarget(
  teamId: number,
  sessionId: number,
  playerId: number,
) {
  const [session, player] = await Promise.all([
    findSession(teamId, sessionId),
    findPlayer(teamId, playerId),
  ]);
  if (!session) return { error: "Session not found" as const };
  if (!player) return { error: "Player not found" as const };
  return { session, player };
}

router.post("/stats/update", requireAuth, async (req, res) => {
  const body = UpdateStatBody.parse(req.body);

  if (!isStatField(body.stat)) {
    res.status(400).json({ error: `Unknown stat: ${body.stat}` });
    return;
  }

  const target = await resolveTarget(req.teamId!, body.sessionId, body.playerId);
  if ("error" in target) {
    res.status(404).json({ error: target.error });
    return;
  }

  const stats = await applyDelta({
    sessionId: body.sessionId,
    playerId: body.playerId,
    stat: body.stat,
    delta: body.delta,
  });

  res.json(
    UpdateStatResponse.parse({
      entry: { player: toPublicPlayer(target.player), stats },
    }),
  );
});

router.post("/stats/set", requireAuth, async (req, res) => {
  const body = SetStatBody.parse(req.body);

  if (!isStatField(body.stat)) {
    res.status(400).json({ error: `Unknown stat: ${body.stat}` });
    return;
  }

  const target = await resolveTarget(req.teamId!, body.sessionId, body.playerId);
  if ("error" in target) {
    res.status(404).json({ error: target.error });
    return;
  }

  const stats = await setStatValue({
    sessionId: body.sessionId,
    playerId: body.playerId,
    stat: body.stat,
    value: body.value,
  });

  res.json(
    SetStatResponse.parse({
      entry: { player: toPublicPlayer(target.player), stats },
    }),
  );
});

router.post("/stats/reset", requireAuth, async (req, res) => {
  const body = ResetSessionStatsBody.parse(req.body);

  const session = await findSession(req.teamId!, body.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  await resetSession(body.sessionId);

  const players = await sessionTotals(req.teamId!, body.sessionId);
  res.json(
    ResetSessionStatsResponse.parse({
      scope: "session",
      sessionId: body.sessionId,
      players,
    }),
  );
});

export default router;
