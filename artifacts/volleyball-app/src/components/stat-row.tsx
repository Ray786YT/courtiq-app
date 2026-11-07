import { useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetStatsQueryKey,
  useUpdateStat,
  type PlayerStats,
  type StatsResponse,
} from "@workspace/api-client-react";
import { useUpdateStatMutation } from "@/hooks/use-stats-mutations";
import { useUndo } from "@/hooks/use-undo";
import { useToast } from "@/hooks/use-toast";

interface StatRowProps {
  sessionId: number;
  playerId: number;
  playerName: string;
  statKey: string;
  label: string;
  value: number;
}

/**
 * One stat with - and + buttons.
 *
 * Every tap counts, even while the previous one is still saving. Taps pile up
 * in `unsent`, and one request at a time sends the whole pile as a single
 * delta. The number on screen is the saved value plus everything still on its
 * way, so the coach sees each tap land instantly.
 *
 * Requests from one row never overlap, so each response is the newest saved
 * value and can be written straight into the cache.
 */
export function StatRow({
  sessionId,
  playerId,
  playerName,
  statKey,
  label,
  value,
}: StatRowProps) {
  const queryClient = useQueryClient();
  const { mutateAsync: sendDelta } = useUpdateStat();
  // Undo goes through the invalidating mutation so every view refreshes after it.
  const { mutateAsync: undoDelta } = useUpdateStatMutation();
  const { push } = useUndo();
  const { toast } = useToast();

  const [unsent, setUnsent] = useState(0);
  const [inFlight, setInFlight] = useState(0);
  const unsentRef = useRef(0);
  const sendingRef = useRef(false);

  const shown = Math.max(0, value + inFlight + unsent);

  const writeToCache = (entry: PlayerStats) => {
    queryClient.setQueryData<StatsResponse>(
      getGetStatsQueryKey({ sessionId }),
      (old) =>
        old && {
          ...old,
          players: old.players.map((row) =>
            row.player.id === entry.player.id ? { ...row, stats: entry.stats } : row,
          ),
        },
    );
  };

  const refreshEverything = () => {
    const statsPrefix = getGetStatsQueryKey()[0];
    void queryClient.invalidateQueries({
      predicate: (query) => {
        const first = query.queryKey[0];
        return (
          typeof first === "string" &&
          (first === statsPrefix || first.startsWith("/api/players"))
        );
      },
    });
  };

  const flush = async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;

    try {
      while (unsentRef.current !== 0) {
        const delta = unsentRef.current;
        unsentRef.current = 0;
        setUnsent(0);
        setInFlight(delta);

        try {
          const result = await sendDelta({
            data: { sessionId, playerId, stat: statKey, delta },
          });
          writeToCache(result.entry);
          // Register the exact inverse, so undo is a real call in the opposite
          // direction rather than a guess at what the number used to be.
          push({
            label: `${playerName} ${label} ${delta > 0 ? "+" : ""}${delta}`,
            run: () =>
              undoDelta({ data: { sessionId, playerId, stat: statKey, delta: -delta } }),
          });
        } catch (error) {
          toast({
            title: "Failed to update stat",
            description:
              (error as Error)?.message || "An unexpected error occurred.",
            variant: "destructive",
          });
        } finally {
          setInFlight(0);
        }
      }
    } finally {
      sendingRef.current = false;
      // Pull in season totals, player pages, and anything other phones changed.
      refreshEverything();
    }
  };

  const handleUpdate = (delta: number) => {
    if (delta < 0 && shown <= 0) return;
    unsentRef.current += delta;
    setUnsent(unsentRef.current);
    void flush();
  };

  return (
    <div className="flex items-center justify-between p-4 bg-card/60 backdrop-blur-sm rounded-2xl border border-border/50 shadow-sm mb-3 relative overflow-hidden group hover:border-primary/30 transition-colors">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/0 to-transparent group-hover:via-primary/5 transition-colors duration-500 pointer-events-none" />

      <div className="font-display text-lg uppercase tracking-wider text-foreground w-28 shrink-0">
        {label}
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => handleUpdate(-1)}
          disabled={shown <= 0}
          className="h-14 w-16 flex items-center justify-center bg-secondary hover:bg-secondary/80 active:bg-secondary/60 text-muted-foreground rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label={`Decrease ${label}`}
        >
          <Minus className="w-8 h-8" />
        </button>

        <div className="w-16 text-center">
          <motion.div
            key={shown}
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="font-display font-bold text-4xl text-foreground drop-shadow-md"
          >
            {shown}
          </motion.div>
        </div>

        <button
          onClick={() => handleUpdate(1)}
          className="h-14 w-16 flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 rounded-xl shadow-[0_0_15px_rgba(245,184,0,0.3)] transition-all"
          aria-label={`Increase ${label}`}
        >
          <Plus className="w-8 h-8" />
        </button>
      </div>
    </div>
  );
}
