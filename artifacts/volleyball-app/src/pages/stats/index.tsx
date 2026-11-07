import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useGetStats, type PlayerStats } from "@workspace/api-client-react";
import { useSetStatMutation, useResetSessionStatsMutation } from "@/hooks/use-stats-mutations";
import { useUndo } from "@/hooks/use-undo";
import { UndoButton } from "@/components/undo-button";
import { useActiveSession } from "@/hooks/use-active-session";
import { Download, AlertTriangle, Trash2, Medal, ChevronRight, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn, formatAverage, formatPercent } from "@/lib/utils";
import { POSITION_LABEL, POSITION_SHORT, groupByPosition, isAttacker, rateHitting } from "@/lib/positions";
import {
  hittingEfficiency,
  passingAverage,
  reliabilityScore,
  sampleSize,
  serveSuccessRate,
} from "@/lib/analytics";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Raw counters. Editable, because sometimes a tap lands on the wrong row. */
const RAW_COLUMNS = [
  { key: "hittingAttempts", label: "Att" },
  { key: "hitsIn", label: "Kill" },
  { key: "hittingErrors", label: "Err" },
  { key: "hitsOut", label: "Out" },
  { key: "tips", label: "Tip" },
  { key: "blocks", label: "Blk" },
  { key: "pass3", label: "P3" },
  { key: "pass2", label: "P2" },
  { key: "pass1", label: "P1" },
  { key: "pass0", label: "P0" },
  { key: "aces", label: "Ace" },
  { key: "digsPositive", label: "Dig" },
] as const;

type Scope = "season" | "session";

export default function StatsTablePage() {
  const { activeSessionId, activeSession } = useActiveSession();
  const [scope, setScope] = useState<Scope>("season");

  const showingSession = scope === "session" && activeSessionId !== null;

  const { data, isLoading } = useGetStats(
    showingSession ? { sessionId: activeSessionId } : undefined,
  );

  const { mutate: setStat, mutateAsync: setStatAsync } = useSetStatMutation();
  const { push: pushUndo } = useUndo();
  const { mutate: resetSession, isPending: isResetting } = useResetSessionStatsMutation();
  const { toast } = useToast();

  const [editingCell, setEditingCell] = useState<{
    playerId: number;
    stat: string;
    previous: number;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  const entries = useMemo(() => data?.players ?? [], [data]);

  /**
   * Ranked within position, never across the roster.
   *
   * A middle swinging at quick sets and an outside swinging into a double block
   * are not doing the same job, and one combined list is topped by middles every
   * time. Grouping is what makes the number mean something to a coach.
   */
  const hittingGroups = useMemo(() => {
    const attackers = entries.filter(
      (entry) => isAttacker(entry.player.position) && entry.stats.hittingAttempts >= 3,
    );
    return groupByPosition(attackers).map((group) => ({
      ...group,
      entries: [...group.entries].sort(
        (a, b) => (hittingEfficiency(b.stats) ?? -1) - (hittingEfficiency(a.stats) ?? -1),
      ),
    }));
  }, [entries]);

  /** Players who have attempted swings but have no position recorded yet. */
  const unpositionedAttackers = useMemo(
    () =>
      entries.filter(
        (entry) => entry.player.position === undefined && entry.stats.hittingAttempts >= 3,
      ),
    [entries],
  );

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground mt-20 font-display text-xl tracking-widest uppercase">
        Loading stats...
      </div>
    );
  }

  const handleCellClick = (playerId: number, statKey: string, value: number) => {
    // Season totals are a sum across sessions, so there is no single row to
    // write back to. Editing is only meaningful inside one session.
    if (!showingSession) {
      toast({
        title: "Switch to a session to edit",
        description: "Season figures add up every practice and game, so they are read-only.",
      });
      return;
    }
    setEditingCell({ playerId, stat: statKey, previous: value });
    setEditValue(String(value));
  };

  const handleCellSave = () => {
    if (editingCell && editValue !== "" && activeSessionId !== null) {
      const value = parseInt(editValue, 10);
      const { playerId, stat, previous } = editingCell;

      if (!Number.isNaN(value) && value !== previous) {
        const player = entries.find((e) => e.player.id === playerId)?.player;
        setStat(
          { data: { sessionId: activeSessionId, playerId, stat, value } },
          {
            onSuccess: () => {
              // A direct edit has no natural inverse, so the old value is
              // captured before the write and restored on undo.
              pushUndo({
                label: `${player?.name ?? "player"} ${stat} → ${previous}`,
                run: () =>
                  setStatAsync({
                    data: { sessionId: activeSessionId, playerId, stat, value: previous },
                  }),
              });
            },
            onError: () => toast({ title: "Failed to save", variant: "destructive" }),
          },
        );
      }
    }
    setEditingCell(null);
  };

  const exportCSV = () => {
    if (entries.length === 0) return;

    const header = [
      "player",
      ...RAW_COLUMNS.map((c) => c.key),
      "hittingEfficiency",
      "passingAverage",
      "serveSuccessRate",
    ];

    const rows = entries.map((entry) => {
      const eff = hittingEfficiency(entry.stats);
      const pass = passingAverage(entry.stats);
      const serve = serveSuccessRate(entry.stats);
      return [
        entry.player.name,
        ...RAW_COLUMNS.map((c) => entry.stats[c.key]),
        eff === null ? "" : eff.toFixed(3),
        pass === null ? "" : pass.toFixed(2),
        serve === null ? "" : serve.toFixed(3),
      ].join(",");
    });

    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `courtiq_${scope}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({ title: "Export complete", description: "CSV downloaded." });
  };

  const confirmReset = () => {
    if (activeSessionId === null) return;
    resetSession(
      { data: { sessionId: activeSessionId } },
      {
        onSuccess: () =>
          toast({
            title: "Session cleared",
            description: `${activeSession?.label ?? "This session"} is back to zero. Other sessions are untouched.`,
          }),
        onError: () => toast({ title: "Reset failed", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-[100vw] overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 pt-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-display text-white mb-1">TEAM MATRIX</h1>
          <p className="text-muted-foreground text-sm">
            {showingSession
              ? `${activeSession?.label ?? "Session"} only. Tap any cell to edit.`
              : "Season to date, summed across every practice and game."}
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <UndoButton />
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 text-white rounded-lg font-bold text-sm tracking-wide transition-colors"
          >
            <Download className="w-4 h-4" />
            EXPORT CSV
          </button>

          {showingSession && (
            <Dialog>
              <DialogTrigger asChild>
                <button className="flex items-center gap-2 px-4 py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 rounded-lg font-bold text-sm tracking-wide transition-colors">
                  <Trash2 className="w-4 h-4" />
                  CLEAR SESSION
                </button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-display text-destructive flex items-center gap-2">
                    <AlertTriangle /> CLEAR THIS SESSION
                  </DialogTitle>
                  <DialogDescription className="text-base">
                    This zeroes every stat in{" "}
                    <span className="text-white font-bold">
                      {activeSession?.label ?? "this session"}
                    </span>
                    . Your other practices and games, and your season totals from them, are not
                    affected.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="mt-6">
                  <button
                    onClick={confirmReset}
                    disabled={isResetting}
                    className="w-full py-3 bg-destructive text-white rounded-xl font-bold uppercase tracking-widest hover:bg-destructive/90 transition-colors"
                  >
                    {isResetting ? "Clearing..." : "Clear this session"}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Scope toggle */}
      <div className="inline-flex bg-secondary/60 p-1 rounded-xl mb-8 border border-white/5">
        {(["season", "session"] as const).map((option) => (
          <button
            key={option}
            onClick={() => setScope(option)}
            disabled={option === "session" && activeSessionId === null}
            className={cn(
              "px-5 py-2 rounded-lg font-display text-sm uppercase tracking-widest transition disabled:opacity-40",
              scope === option
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-white",
            )}
          >
            {option === "season" ? "Season" : "This session"}
          </button>
        ))}
      </div>

      {(hittingGroups.length > 0 || unpositionedAttackers.length > 0) && (
        <div className="mb-8">
          <h2 className="font-display text-xl text-primary flex items-center gap-2 mb-1">
            <Medal className="w-5 h-5" /> BEST HITTERS BY POSITION
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Ranked inside each position, not across the roster. A middle hits at the net off quick
            sets; an outside swings from the pin into a double block. Comparing them directly makes
            middles look better than they are.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {hittingGroups.map((group) => (
              <div
                key={group.position}
                className="bg-gradient-to-b from-primary/10 to-transparent border border-primary/20 rounded-2xl p-4"
              >
                <h3 className="font-display text-sm uppercase tracking-widest text-primary mb-3">
                  {group.position === "UNSET" ? "No position" : POSITION_LABEL[group.position]}
                </h3>
                <div className="space-y-2">
                  {group.entries.slice(0, 3).map((entry, index) => {
                    const eff = hittingEfficiency(entry.stats);
                    const verdict = rateHitting(eff, entry.player.position);
                    return (
                      <div
                        key={entry.player.id}
                        className="flex justify-between items-center bg-background/50 rounded-xl px-3 py-2 border border-white/5"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="font-display text-lg text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="font-bold text-white truncate">{entry.player.name}</span>
                        </span>
                        <span
                          className={cn(
                            "font-display text-xl shrink-0",
                            verdict === "strong"
                              ? "text-primary"
                              : verdict === "below"
                                ? "text-destructive"
                                : "text-white/85",
                          )}
                        >
                          {formatAverage(eff ?? 0)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {unpositionedAttackers.length > 0 && (
            <div className="mt-4 flex items-start gap-3 bg-secondary/40 border border-white/5 rounded-2xl p-4">
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                {unpositionedAttackers.map((e) => e.player.name).join(", ")}{" "}
                {unpositionedAttackers.length === 1 ? "has" : "have"} recorded swings but no
                position yet, so {unpositionedAttackers.length === 1 ? "they are" : "they are"} left
                out of these rankings. Set positions on the{" "}
                <Link href="/roster" className="text-primary underline underline-offset-2">
                  roster page
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      )}

      {/* Efficiency panel: the numbers a coach actually decides on */}
      <div className="mb-8">
        <h2 className="font-display text-xl text-white mb-1">PERFORMANCE</h2>
        <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />
          Rates, not counts. A dash means not enough attempts to say anything yet.
        </p>
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse min-w-max">
              <thead>
                <tr className="bg-secondary/50 text-muted-foreground font-display tracking-widest uppercase text-xs">
                  <th className="sticky left-0 z-20 bg-secondary/90 backdrop-blur px-4 py-3 border-b border-border/50">
                    Player
                  </th>
                  <th className="px-3 py-3 text-center border-b border-border/50">Pos</th>
                  <th className="px-4 py-3 text-center border-b border-border/50">Hit Eff</th>
                  <th className="px-4 py-3 text-center border-b border-border/50">Pass Avg</th>
                  <th className="px-4 py-3 text-center border-b border-border/50">Serve In</th>
                  <th className="px-4 py-3 text-center border-b border-border/50">Score</th>
                  <th className="px-2 py-3 border-b border-border/50" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {entries.map((entry) => (
                  <EfficiencyRow key={entry.player.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Raw counters */}
      <h2 className="font-display text-xl text-white mb-4">RAW COUNTS</h2>
      <div className="bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse min-w-max">
            <thead>
              <tr className="bg-secondary/50">
                <th className="sticky left-0 z-20 bg-secondary/90 backdrop-blur px-4 py-4 font-display tracking-widest text-muted-foreground uppercase border-b border-border/50 shadow-[4px_0_12px_rgba(0,0,0,0.2)]">
                  Player
                </th>
                {RAW_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-4 font-display tracking-widest text-muted-foreground uppercase text-center border-b border-border/50 whitespace-nowrap"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {entries.map((entry) => (
                <tr key={entry.player.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="sticky left-0 z-10 bg-card group-hover:bg-[#1a2333] px-4 py-3 font-medium text-white shadow-[4px_0_12px_rgba(0,0,0,0.1)] transition-colors whitespace-nowrap">
                    {entry.player.jerseyNumber !== undefined && (
                      <span className="text-muted-foreground text-xs mr-2">
                        #{entry.player.jerseyNumber}
                      </span>
                    )}
                    {entry.player.name}
                  </td>

                  {RAW_COLUMNS.map((col) => {
                    const isEditing =
                      editingCell?.playerId === entry.player.id && editingCell?.stat === col.key;
                    const value = entry.stats[col.key];

                    return (
                      <td
                        key={col.key}
                        className={cn(
                          "px-1 py-1 text-center border-l border-border/10",
                          showingSession ? "cursor-pointer" : "cursor-default",
                        )}
                        onClick={() => !isEditing && handleCellClick(entry.player.id, col.key, value)}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            type="number"
                            aria-label={`${entry.player.name} ${col.label}`}
                            className="w-12 h-10 bg-primary/20 border border-primary text-white text-center font-bold rounded focus:outline-none focus:ring-2 focus:ring-primary"
                            value={editValue}
                            onChange={(event) => setEditValue(event.target.value)}
                            onBlur={handleCellSave}
                            onKeyDown={(event) => event.key === "Enter" && handleCellSave()}
                          />
                        ) : (
                          <div
                            className={cn(
                              "w-12 h-10 mx-auto flex items-center justify-center font-display text-xl rounded transition-colors",
                              value === 0 ? "text-white/25" : "text-white/85",
                              showingSession && "hover:bg-white/10",
                            )}
                          >
                            {value}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EfficiencyRow({ entry }: { entry: PlayerStats }) {
  const eff = hittingEfficiency(entry.stats);
  const pass = passingAverage(entry.stats);
  const serve = serveSuccessRate(entry.stats);
  const score = reliabilityScore(entry.stats);
  const thin = sampleSize(entry.stats) < 10;
  const verdict = rateHitting(eff, entry.player.position);

  return (
    <tr className="hover:bg-white/[0.02] transition-colors group">
      <td className="sticky left-0 z-10 bg-card group-hover:bg-[#1a2333] px-4 py-3 font-medium text-white transition-colors whitespace-nowrap">
        {entry.player.name}
        {thin && (
          <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            thin data
          </span>
        )}
      </td>
      <td className="px-3 py-3 text-center">
        {entry.player.position ? (
          <span className="text-[10px] font-display uppercase tracking-widest px-2 py-1 rounded-md bg-secondary text-muted-foreground">
            {POSITION_SHORT[entry.player.position]}
          </span>
        ) : (
          <span className="text-white/25">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-center font-display text-lg">
        <span
          className={cn(
            eff === null
              ? "text-white/25"
              : verdict === "strong"
                ? "text-primary"
                : verdict === "below" || eff < 0
                  ? "text-destructive"
                  : "text-white/85",
          )}
          title={
            entry.player.position
              ? `Rated against other ${POSITION_LABEL[entry.player.position]}s`
              : "Set a position to rate this properly"
          }
        >
          {eff === null ? "—" : formatAverage(eff)}
        </span>
      </td>
      <td className="px-4 py-3 text-center font-display text-lg text-white/85">
        {pass === null ? <span className="text-white/25">—</span> : pass.toFixed(2)}
      </td>
      <td className="px-4 py-3 text-center font-display text-lg text-white/85">
        {serve === null ? <span className="text-white/25">—</span> : formatPercent(serve)}
      </td>
      <td className="px-4 py-3 text-center">
        {score === null ? (
          <span className="text-white/25 font-display text-lg">—</span>
        ) : (
          <span className="inline-flex items-center justify-center min-w-11 px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 font-display text-lg text-primary">
            {score}
          </span>
        )}
      </td>
      <td className="px-2 py-3">
        <Link
          href={`/players/${entry.player.id}`}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition"
          aria-label={`Open ${entry.player.name}`}
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      </td>
    </tr>
  );
}
