import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export { hashPasscode, verifyPasscode } from "@workspace/db";

const COOKIE_NAME = "courtiq_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function sessionSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a random string of at least 32 characters.",
    );
  }
  return secret;
}

/* -------------------------------------------------------------------------- */
/* Session cookie                                                              */
/* -------------------------------------------------------------------------- */

type SessionPayload = { teamId: number; exp: number };

function sign(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

/** Produce a tamper-evident cookie value: `<base64url payload>.<hmac>`. */
export function createSessionToken(teamId: number): string {
  const payload: SessionPayload = { teamId, exp: Date.now() + SESSION_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/** Return the team id from a cookie, or null if it is missing, forged, or stale. */
export function readSessionToken(token: string | undefined): number | null {
  if (!token) return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = Buffer.from(sign(encoded));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf-8"),
    ) as SessionPayload;

    if (typeof payload.teamId !== "number") return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;

    return payload.teamId;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, teamId: number): void {
  res.cookie(COOKIE_NAME, createSessionToken(teamId), {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function teamIdFromRequest(req: Request): number | null {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return readSessionToken(cookies?.[COOKIE_NAME]);
}

/* -------------------------------------------------------------------------- */
/* Middleware                                                                  */
/* -------------------------------------------------------------------------- */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      teamId?: number;
    }
  }
}

/**
 * Gate every route that touches team data.
 *
 * Without this the API is world-writable, which is how the previous version
 * let anyone with the URL zero out a season.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const teamId = teamIdFromRequest(req);
  if (teamId === null) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  req.teamId = teamId;
  next();
}
