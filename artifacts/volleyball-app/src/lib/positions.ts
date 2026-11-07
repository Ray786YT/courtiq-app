import type { Position } from "@workspace/api-client-react";

/**
 * Court positions and why they are not interchangeable.
 *
 * Hitting efficiency is only meaningful against players doing the same job. A
 * middle swings at quick sets right at the net and hits .350+ on a normal
 * night; an outside swings from the pin into a formed double block and .200 is
 * good; a libero never attacks at all. Ranking them in one list produces a
 * leaderboard permanently topped by middles, which is the fastest way to lose a
 * coach's trust in every other number on the page.
 */
export const POSITIONS: Position[] = ["OH", "OPP", "MB", "S", "L", "DS"];

export const POSITION_LABEL: Record<Position, string> = {
  OH: "Outside",
  OPP: "Right side",
  MB: "Middle",
  S: "Setter",
  L: "Libero",
  DS: "Defensive specialist",
};

/** Short form for table cells and badges. */
export const POSITION_SHORT: Record<Position, string> = {
  OH: "OH",
  OPP: "OPP",
  MB: "MB",
  S: "S",
  L: "L",
  DS: "DS",
};

/** Positions expected to attack. Only these belong on a hitting leaderboard. */
export const ATTACKING_POSITIONS: Position[] = ["OH", "OPP", "MB"];

export function isAttacker(position: Position | undefined): boolean {
  return position !== undefined && ATTACKING_POSITIONS.includes(position);
}

/**
 * Typical hitting efficiency for each attacking position, used to say whether a
 * number is good *for that job* rather than good in the abstract. Rough
 * benchmarks from high school and college norms, not precise thresholds.
 */
export const HITTING_BENCHMARK: Partial<Record<Position, { solid: number; strong: number }>> = {
  MB: { solid: 0.25, strong: 0.4 },
  OPP: { solid: 0.15, strong: 0.3 },
  OH: { solid: 0.12, strong: 0.25 },
};

export type EfficiencyVerdict = "strong" | "solid" | "below" | "unrated";

export function rateHitting(
  efficiency: number | null,
  position: Position | undefined,
): EfficiencyVerdict {
  if (efficiency === null) return "unrated";
  const benchmark = position ? HITTING_BENCHMARK[position] : undefined;
  if (!benchmark) return "unrated";
  if (efficiency >= benchmark.strong) return "strong";
  if (efficiency >= benchmark.solid) return "solid";
  return "below";
}

/** Groups a roster by position for like-for-like comparison, attackers first. */
export function groupByPosition<T extends { player: { position?: Position } }>(
  entries: T[],
): Array<{ position: Position | "UNSET"; entries: T[] }> {
  const groups = new Map<Position | "UNSET", T[]>();
  for (const entry of entries) {
    const key = entry.player.position ?? "UNSET";
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  const order: Array<Position | "UNSET"> = [...POSITIONS, "UNSET"];
  return order
    .filter((key) => groups.has(key))
    .map((key) => ({ position: key, entries: groups.get(key)! }));
}
