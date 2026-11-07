import { Router, type IRouter } from "express";
import { GetAuthStatusResponse, LoginBody, LoginResponse, LogoutResponse } from "@workspace/api-zod";
import {
  clearSessionCookie,
  setSessionCookie,
  teamIdFromRequest,
  verifyPasscode,
} from "../lib/auth";
import { findTeamById, listTeams } from "../lib/store";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function teamSummary(team: { id: number; slug: string; name: string; school: string | null }) {
  return {
    id: team.id,
    slug: team.slug,
    name: team.name,
    ...(team.school !== null ? { school: team.school } : {}),
  };
}

router.get("/auth/me", async (req, res) => {
  const teamId = teamIdFromRequest(req);
  if (teamId === null) {
    res.json(GetAuthStatusResponse.parse({ authenticated: false }));
    return;
  }

  const team = await findTeamById(teamId);
  if (!team) {
    clearSessionCookie(res);
    res.json(GetAuthStatusResponse.parse({ authenticated: false }));
    return;
  }

  res.json(
    GetAuthStatusResponse.parse({ authenticated: true, team: teamSummary(team) }),
  );
});

router.post("/auth/login", async (req, res) => {
  const body = LoginBody.parse(req.body);

  // One passcode unlocks one team. The passcode is the only thing typed, so
  // it is checked against every team; the seed refuses duplicate passcodes,
  // which is what makes this lookup unambiguous.
  const teams = await listTeams();
  if (teams.length === 0) {
    logger.error("No team rows found; run the seed script");
    res.status(401).json({ error: "Incorrect passcode" });
    return;
  }

  const team = teams.find((candidate) =>
    verifyPasscode(body.passcode, candidate.passcodeHash),
  );
  if (!team) {
    // Deliberately vague: never reveal which teams exist.
    res.status(401).json({ error: "Incorrect passcode" });
    return;
  }

  setSessionCookie(res, team.id);
  res.json(LoginResponse.parse({ authenticated: true, team: teamSummary(team) }));
});

router.post("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json(LogoutResponse.parse({ authenticated: false }));
});

export default router;
