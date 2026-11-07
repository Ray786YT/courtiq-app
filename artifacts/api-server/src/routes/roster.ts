import { Router, type IRouter } from "express";
import {
  CreatePlayerBody,
  CreatePlayerResponse,
  GetPlayersResponse,
  UpdatePlayerBody,
  UpdatePlayerResponse,
  DeactivatePlayerResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import {
  createPlayer,
  deactivatePlayer,
  findPlayer,
  listPlayers,
  toPublicPlayer,
  updatePlayer,
} from "../lib/store";

const router: IRouter = Router();

/**
 * Postgres reports a unique-index violation as SQLSTATE 23505, but Drizzle
 * wraps driver errors, so the code can sit on the cause rather than the error
 * itself. Walking the chain is what keeps a duplicate name a clean 409 instead
 * of a 500.
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === "object" && (current as { code?: string }).code === "23505") {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function parsePlayerId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get("/players", requireAuth, async (req, res) => {
  const players = await listPlayers(req.teamId!);
  res.json(GetPlayersResponse.parse({ players: players.map(toPublicPlayer) }));
});

router.post("/players", requireAuth, async (req, res) => {
  const body = CreatePlayerBody.parse(req.body);

  const name = body.name.trim();
  if (!name) {
    res.status(400).json({ error: "A player needs a name" });
    return;
  }

  try {
    const player = await createPlayer({
      teamId: req.teamId!,
      name,
      jerseyNumber: body.jerseyNumber,
      position: body.position,
    });
    res.json(CreatePlayerResponse.parse({ player: toPublicPlayer(player) }));
  } catch (error) {
    // The unique index on (team, name) is what keeps a roster from filling up
    // with three players called "Michael" that nobody can tell apart.
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: `${name} is already on the roster` });
      return;
    }
    throw error;
  }
});

router.patch("/players/:playerId", requireAuth, async (req, res) => {
  const playerId = parsePlayerId(req.params["playerId"]);
  if (playerId === null) {
    res.status(400).json({ error: "playerId must be a positive integer" });
    return;
  }

  const body = UpdatePlayerBody.parse(req.body);

  const existing = await findPlayer(req.teamId!, playerId);
  if (!existing) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const patch: Parameters<typeof updatePlayer>[2] = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      res.status(400).json({ error: "A player needs a name" });
      return;
    }
    patch.name = name;
  }
  if (body.jerseyNumber !== undefined) patch.jerseyNumber = body.jerseyNumber;
  if (body.position !== undefined) patch.position = body.position;
  if (body.active !== undefined) patch.active = body.active;

  try {
    const player = await updatePlayer(req.teamId!, playerId, patch);
    if (!player) {
      res.status(404).json({ error: "Player not found" });
      return;
    }
    res.json(UpdatePlayerResponse.parse({ player: toPublicPlayer(player) }));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Another player already has that name" });
      return;
    }
    throw error;
  }
});

router.delete("/players/:playerId", requireAuth, async (req, res) => {
  const playerId = parsePlayerId(req.params["playerId"]);
  if (playerId === null) {
    res.status(400).json({ error: "playerId must be a positive integer" });
    return;
  }

  const player = await deactivatePlayer(req.teamId!, playerId);
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  res.json(DeactivatePlayerResponse.parse({ player: toPublicPlayer(player) }));
});

export default router;
