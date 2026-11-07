import type { StatLine } from "@workspace/api-client-react";

/**
 * The derived metrics a coach actually makes decisions on.
 *
 * The raw counters answer "what happened". These answer "who is reliable",
 * which is the question the roster sheet was always trying to answer and the
 * reason CourtIQ exists.
 */

/** Attack attempts that produced a terminal swing, tips included. */
export function totalAttacks(s: StatLine): number {
  return s.hittingAttempts;
}

/**
 * Hitting efficiency: (kills - errors) / attempts.
 *
 * The standard volleyball measure. Runs from -1.000 to 1.000, and unlike a raw
 * kill count it punishes a player who swings hard and misses.
 */
export function hittingEfficiency(s: StatLine): number | null {
  if (s.hittingAttempts <= 0) return null;
  return (s.hitsIn - s.hittingErrors) / s.hittingAttempts;
}

/** Kill percentage: how often a swing ends the rally in your favour. */
export function killPercentage(s: StatLine): number | null {
  if (s.hittingAttempts <= 0) return null;
  return s.hitsIn / s.hittingAttempts;
}

/** Error rate: how often a swing ends the rally against you. */
export function errorRate(s: StatLine): number | null {
  if (s.hittingAttempts <= 0) return null;
  return (s.hittingErrors + s.hitsOut) / s.hittingAttempts;
}

export function totalPasses(s: StatLine): number {
  return s.pass0 + s.pass1 + s.pass2 + s.pass3;
}

/**
 * Passing average on the standard 0-3 scale.
 *
 * Roughly: below 1.8 the offence is scrambling, above 2.3 the setter has
 * options. This is the number that decides who receives serve.
 */
export function passingAverage(s: StatLine): number | null {
  const attempts = totalPasses(s);
  if (attempts <= 0) return null;
  return (s.pass1 + s.pass2 * 2 + s.pass3 * 3) / attempts;
}

export function totalServes(s: StatLine): number {
  return s.aces + s.servingNeutral + s.servingErrors;
}

/** Serves that stayed in play, ace or not. Missing serves is the cardinal sin. */
export function serveSuccessRate(s: StatLine): number | null {
  const attempts = totalServes(s);
  if (attempts <= 0) return null;
  return (s.aces + s.servingNeutral) / attempts;
}

export function aceRate(s: StatLine): number | null {
  const attempts = totalServes(s);
  if (attempts <= 0) return null;
  return s.aces / attempts;
}

export function totalDigs(s: StatLine): number {
  return s.digsPositive + s.digsNegative;
}

export function digSuccessRate(s: StatLine): number | null {
  const attempts = totalDigs(s);
  if (attempts <= 0) return null;
  return s.digsPositive / attempts;
}

/**
 * A single reliability score, 0 to 100.
 *
 * A blend of the four things that decide whether a player helps the team win a
 * rally: hitting efficiency, passing, serving, and defence. Only the areas a
 * player has actually attempted are counted, so a libero who never swings is
 * not penalised for it. Deliberately coarse. It is a conversation starter for a
 * coach, not a verdict.
 */
export function reliabilityScore(s: StatLine): number | null {
  const parts: Array<{ value: number; weight: number }> = [];

  const eff = hittingEfficiency(s);
  if (eff !== null) {
    // -0.2 and worse scores 0; +0.4 and better scores 1.
    parts.push({
      value: clamp01((eff + 0.2) / 0.6),
      weight: Math.min(s.hittingAttempts, 30),
    });
  }

  const pass = passingAverage(s);
  if (pass !== null) {
    // 1.0 scores 0; 2.8 and better scores 1.
    parts.push({
      value: clamp01((pass - 1) / 1.8),
      weight: Math.min(totalPasses(s), 30),
    });
  }

  const serve = serveSuccessRate(s);
  if (serve !== null) {
    // 0.6 in-play scores 0; 1.0 scores 1, with aces as a bonus on top.
    const bonus = (aceRate(s) ?? 0) * 0.5;
    parts.push({
      value: clamp01((serve - 0.6) / 0.4 + bonus),
      weight: Math.min(totalServes(s), 30),
    });
  }

  const dig = digSuccessRate(s);
  if (dig !== null) {
    parts.push({ value: clamp01(dig), weight: Math.min(totalDigs(s), 20) });
  }

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight <= 0) return null;

  const weighted = parts.reduce((sum, p) => sum + p.value * p.weight, 0);
  return Math.round((weighted / totalWeight) * 100);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** How much data is behind a player's numbers. Thin samples deserve a caveat. */
export function sampleSize(s: StatLine): number {
  return (
    s.hittingAttempts + totalPasses(s) + totalServes(s) + totalDigs(s) + s.blocks
  );
}

export function sumStatLines(lines: StatLine[]): StatLine {
  const keys = Object.keys(EMPTY_STAT_LINE) as Array<keyof StatLine>;
  const total = { ...EMPTY_STAT_LINE };
  for (const line of lines) {
    for (const key of keys) total[key] += line[key];
  }
  return total;
}

export const EMPTY_STAT_LINE: StatLine = {
  hittingAttempts: 0,
  hitsIn: 0,
  hitsOut: 0,
  hittingErrors: 0,
  tips: 0,
  blocks: 0,
  blockingErrors: 0,
  pass0: 0,
  pass1: 0,
  pass2: 0,
  pass3: 0,
  aces: 0,
  servingNeutral: 0,
  servingErrors: 0,
  digsPositive: 0,
  digsNegative: 0,
};
