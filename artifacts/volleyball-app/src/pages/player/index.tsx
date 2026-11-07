import { Link, useRoute } from "wouter";
import {
  useGetPlayerHistory,
  getGetPlayerHistoryQueryKey,
  type StatLine,
} from "@workspace/api-client-react";
import { ArrowLeft, Dumbbell, Loader2, TrendingUp } from "lucide-react";
import { cn, formatAverage, formatPercent } from "@/lib/utils";
import {
  hittingEfficiency,
  passingAverage,
  reliabilityScore,
  sampleSize,
  serveSuccessRate,
  totalPasses,
  totalServes,
} from "@/lib/analytics";
import { trainingRecommendations } from "@/lib/training";

function formatDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function PlayerDetailPage() {
  const [, params] = useRoute("/players/:playerId");
  const playerId = Number(params?.playerId);

  const { data, isLoading, error } = useGetPlayerHistory(playerId, {
    query: {
      enabled: Number.isInteger(playerId),
      queryKey: getGetPlayerHistoryQueryKey(playerId),
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center mt-16">
        <p className="text-muted-foreground mb-6">That player could not be loaded.</p>
        <Link href="/stats" className="text-primary font-display uppercase tracking-widest">
          Back to stats
        </Link>
      </div>
    );
  }

  const { player, total, entries } = data;
  const recommendations = trainingRecommendations(total);
  const score = reliabilityScore(total);
  const thin = sampleSize(total) < 10;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      <Link
        href="/stats"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Team matrix
      </Link>

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-4xl text-white">{player.name}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {entries.length} {entries.length === 1 ? "session" : "sessions"} recorded
            {thin && " · not much data yet"}
          </p>
        </div>
        {score !== null && (
          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-display mb-1">
              Reliability
            </p>
            <p className="font-display text-5xl text-primary leading-none">{score}</p>
          </div>
        )}
      </div>

      {/* Season headline numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <MetricCard
          label="Hit Eff"
          value={hittingEfficiency(total)}
          format={(v) => formatAverage(v)}
          detail={`${total.hitsIn}K / ${total.hittingErrors}E on ${total.hittingAttempts}`}
        />
        <MetricCard
          label="Pass Avg"
          value={passingAverage(total)}
          format={(v) => v.toFixed(2)}
          detail={`${totalPasses(total)} receptions`}
        />
        <MetricCard
          label="Serve In"
          value={serveSuccessRate(total)}
          format={(v) => formatPercent(v)}
          detail={`${total.aces} aces on ${totalServes(total)}`}
        />
        <MetricCard
          label="Blocks"
          value={total.blocks}
          format={(v) => String(v)}
          detail={`${total.blockingErrors} errors`}
        />
      </div>

      {/* Training recommendations */}
      <section className="mb-10">
        <h2 className="font-display text-xl text-white flex items-center gap-2 mb-1">
          <Dumbbell className="w-5 h-5 text-primary" /> WHAT TO WORK ON
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Generated from the numbers above. Each one names the stat that triggered it.
        </p>

        {recommendations.length === 0 ? (
          <div className="bg-card border border-border/50 rounded-2xl p-6 text-muted-foreground text-sm leading-relaxed">
            Not enough recorded attempts yet to say anything useful. Record a few more sessions and
            this fills in.
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div
                key={rec.area + rec.finding}
                className="bg-card border border-border/50 rounded-2xl p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={cn(
                      "text-[10px] font-display uppercase tracking-widest px-2 py-1 rounded-md",
                      rec.priority >= 70
                        ? "bg-destructive/15 text-destructive"
                        : rec.priority >= 40
                          ? "bg-primary/15 text-primary"
                          : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {rec.area}
                  </span>
                </div>
                <p className="text-white text-sm mb-2 leading-relaxed">{rec.finding}</p>
                <p className="text-muted-foreground text-sm leading-relaxed">{rec.work}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Session history */}
      <section>
        <h2 className="font-display text-xl text-white flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-primary" /> SESSION BY SESSION
        </h2>

        {entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">No sessions recorded yet.</p>
        ) : (
          <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="bg-secondary/50 text-muted-foreground font-display tracking-widest uppercase text-xs">
                    <th className="px-4 py-3 border-b border-border/50">Session</th>
                    <th className="px-4 py-3 text-center border-b border-border/50">Hit Eff</th>
                    <th className="px-4 py-3 text-center border-b border-border/50">Kills</th>
                    <th className="px-4 py-3 text-center border-b border-border/50">Pass</th>
                    <th className="px-4 py-3 text-center border-b border-border/50">Aces</th>
                    <th className="px-4 py-3 text-center border-b border-border/50">Blk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {entries.map((entry) => {
                    const eff = hittingEfficiency(entry.stats);
                    const pass = passingAverage(entry.stats);
                    return (
                      <tr key={entry.session.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="block text-white text-sm">{entry.session.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {formatDate(entry.session.occurredOn)} · {entry.session.kind}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-display text-lg text-white/85">
                          {eff === null ? <span className="text-white/25">—</span> : formatAverage(eff)}
                        </td>
                        <td className="px-4 py-3 text-center font-display text-lg text-white/85">
                          {entry.stats.hitsIn}
                        </td>
                        <td className="px-4 py-3 text-center font-display text-lg text-white/85">
                          {pass === null ? <span className="text-white/25">—</span> : pass.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center font-display text-lg text-white/85">
                          {entry.stats.aces}
                        </td>
                        <td className="px-4 py-3 text-center font-display text-lg text-white/85">
                          {entry.stats.blocks}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  format,
  detail,
}: {
  label: string;
  value: number | null;
  format: (value: number) => string;
  detail: string;
}) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-display mb-1">
        {label}
      </p>
      <p className="font-display text-3xl text-white leading-none mb-1">
        {value === null ? <span className="text-white/25">—</span> : format(value)}
      </p>
      <p className="text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

export type { StatLine };
