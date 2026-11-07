import { Router, type IRouter } from "express";
import {
  CreateSessionBody,
  CreateSessionResponse,
  GetSessionsResponse,
  DeleteSessionResponse,
  UpdateSessionBody,
  UpdateSessionResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import {
  createSession,
  deleteSession,
  findSession,
  listSessions,
  sessionStatRowCount,
  toSessionSummary,
  updateSession,
} from "../lib/store";

const router: IRouter = Router();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

router.get("/sessions", requireAuth, async (req, res) => {
  const sessions = await listSessions(req.teamId!);
  res.json(
    GetSessionsResponse.parse({ sessions: sessions.map(toSessionSummary) }),
  );
});

router.post("/sessions", requireAuth, async (req, res) => {
  const body = CreateSessionBody.parse(req.body);

  const session = await createSession({
    teamId: req.teamId!,
    kind: body.kind,
    label: body.label.trim() || (body.kind === "game" ? "Game" : "Practice"),
    occurredOn: body.occurredOn?.slice(0, 10) || today(),
    opponent: body.opponent,
    notes: body.notes,
  });

  res.json(CreateSessionResponse.parse({ session: toSessionSummary(session) }));
});

router.patch("/sessions/:sessionId", requireAuth, async (req, res) => {
  const raw = req.params["sessionId"];
  const sessionId = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    res.status(400).json({ error: "sessionId must be a positive integer" });
    return;
  }

  const body = UpdateSessionBody.parse(req.body);

  const patch: Parameters<typeof updateSession>[2] = {};
  if (body.kind !== undefined) patch.kind = body.kind;
  if (body.label !== undefined) {
    const label = body.label.trim();
    if (!label) {
      res.status(400).json({ error: "A session needs a name" });
      return;
    }
    patch.label = label;
  }
  if (body.occurredOn !== undefined) patch.occurredOn = body.occurredOn.slice(0, 10);
  if (body.opponent !== undefined) patch.opponent = body.opponent;
  if (body.notes !== undefined) patch.notes = body.notes;

  const session = await updateSession(req.teamId!, sessionId, patch);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json(UpdateSessionResponse.parse({ session: toSessionSummary(session) }));
});

router.delete("/sessions/:sessionId", requireAuth, async (req, res) => {
  const raw = req.params["sessionId"];
  const sessionId = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    res.status(400).json({ error: "sessionId must be a positive integer" });
    return;
  }

  const session = await findSession(req.teamId!, sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // Deleting cascades to every stat line in the session, so a session holding
  // real numbers has to be cleared deliberately first. One tap should never be
  // able to take a practice with it.
  const rows = await sessionStatRowCount(sessionId);
  if (rows > 0) {
    res.status(409).json({
      error: "This session still has stats. Clear it from the stats table first.",
    });
    return;
  }

  const deleted = await deleteSession(req.teamId!, sessionId);
  if (!deleted) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json(DeleteSessionResponse.parse({ session: toSessionSummary(deleted) }));
});

export default router;
