import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;

/**
 * Hash a team passcode for storage. Format: `scrypt$<saltHex>$<keyHex>`.
 *
 * Lives beside the schema because it defines the shape of a stored column, and
 * because both the API server and the seed script need it.
 */
export function hashPasscode(passcode: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(passcode.normalize("NFKC"), salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Constant-time comparison of a passcode against a stored hash. */
export function verifyPasscode(passcode: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const salt = Buffer.from(parts[1]!, "hex");
  const expected = Buffer.from(parts[2]!, "hex");
  if (expected.length !== SCRYPT_KEYLEN) return false;

  const actual = scryptSync(passcode.normalize("NFKC"), salt, SCRYPT_KEYLEN);
  return timingSafeEqual(actual, expected);
}
