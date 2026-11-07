/**
 * The sixteen countable stat fields CourtIQ tracks.
 *
 * This is the single source of truth. The database columns, the API contract,
 * the voice parser's allow-list, and the UI columns all derive from this list,
 * so adding a stat means editing one array.
 */
export const STAT_FIELDS = [
  "hittingAttempts",
  "hitsIn",
  "hitsOut",
  "hittingErrors",
  "tips",
  "blocks",
  "blockingErrors",
  "pass0",
  "pass1",
  "pass2",
  "pass3",
  "aces",
  "servingNeutral",
  "servingErrors",
  "digsPositive",
  "digsNegative",
] as const;

export type StatField = (typeof STAT_FIELDS)[number];

export const STAT_FIELD_SET: ReadonlySet<string> = new Set(STAT_FIELDS);

export function isStatField(value: string): value is StatField {
  return STAT_FIELD_SET.has(value);
}

/** Human-readable labels, used by the API docs and the voice parser prompt. */
export const STAT_FIELD_LABELS: Record<StatField, string> = {
  hittingAttempts: "Hitting attempts",
  hitsIn: "Kills (hits in)",
  hitsOut: "Hits out",
  hittingErrors: "Hitting errors",
  tips: "Tips",
  blocks: "Blocks",
  blockingErrors: "Blocking errors",
  pass0: "Pass rated 0",
  pass1: "Pass rated 1",
  pass2: "Pass rated 2",
  pass3: "Pass rated 3",
  aces: "Aces",
  servingNeutral: "Neutral serves",
  servingErrors: "Serving errors",
  digsPositive: "Successful digs",
  digsNegative: "Failed digs",
};

/** An all-zero stat line. */
export function emptyStatLine(): Record<StatField, number> {
  return Object.fromEntries(STAT_FIELDS.map((f) => [f, 0])) as Record<
    StatField,
    number
  >;
}
