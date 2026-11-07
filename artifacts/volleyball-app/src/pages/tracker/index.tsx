import { useState, useEffect, useRef } from "react";
import { useGetStats, getGetStatsQueryKey } from "@workspace/api-client-react";
import { Mic, Square, Loader2, RefreshCw, CalendarPlus, TriangleAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProcessVoiceMutation, useUpdateStatMutation } from "@/hooks/use-stats-mutations";
import { useUndo } from "@/hooks/use-undo";
import { UndoButton } from "@/components/undo-button";
import { useActiveSession } from "@/hooks/use-active-session";
import { useToast } from "@/hooks/use-toast";
import { StatRow } from "@/components/stat-row";
import { formatAverage, formatPercent, cn } from "@/lib/utils";
import { POSITION_LABEL } from "@/lib/positions";
import {
  hittingEfficiency,
  passingAverage,
  serveSuccessRate,
} from "@/lib/analytics";

const CATEGORIES = {
  HITTING: [
    { key: "hittingAttempts", label: "Attempts" },
    { key: "hitsIn", label: "Kills (In)" },
    { key: "hittingErrors", label: "Errors" },
    { key: "hitsOut", label: "Out/Block" },
    { key: "tips", label: "Tips" },
  ],
  BLOCKING: [
    { key: "blocks", label: "Blocks" },
    { key: "blockingErrors", label: "Errors" },
  ],
  PASSING: [
    { key: "pass3", label: "Perfect (3)" },
    { key: "pass2", label: "Good (2)" },
    { key: "pass1", label: "Poor (1)" },
    { key: "pass0", label: "Error (0)" },
  ],
  SERVING: [
    { key: "aces", label: "Aces" },
    { key: "servingNeutral", label: "In" },
    { key: "servingErrors", label: "Errors" },
  ],
  DIGS: [
    { key: "digsPositive", label: "Good Dig" },
    { key: "digsNegative", label: "Error" },
  ],
} as const;

type Tab = "MANUAL" | "VOICE";
type Category = keyof typeof CATEGORIES;

export default function TrackerPage() {
  const { activeSessionId, activeSession, isLoading: sessionsLoading } = useActiveSession();

  const statsParams =
    activeSessionId !== null ? { sessionId: activeSessionId } : undefined;

  const { data: statsData, isLoading, error } = useGetStats(statsParams, {
    query: {
      enabled: activeSessionId !== null,
      queryKey: getGetStatsQueryKey(statsParams),
    },
  });

  const { mutate: processVoice, isPending: isProcessingVoice } = useProcessVoiceMutation();
  const { mutateAsync: updateStatAsync } = useUpdateStatMutation();
  const { push: pushUndo } = useUndo();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>("MANUAL");
  const [activeCategory, setActiveCategory] = useState<Category>("HITTING");
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceResult, setVoiceResult] = useState<string | null>(null);
  const [voiceWarning, setVoiceWarning] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // A removed player keeps their history but must not appear in the picker,
  // or a coach will quietly record a practice against someone who left.
  const entries = (statsData?.players ?? []).filter((entry) => entry.player.active);

  useEffect(() => {
    if (entries.length === 0) return;
    const stillOnRoster = entries.some((e) => e.player.id === selectedPlayerId);
    if (!stillOnRoster) setSelectedPlayerId(entries[0]!.player.id);
  }, [entries, selectedPlayerId]);

  useEffect(() => {
    const SpeechRecognition =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let current = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        current += event.results[i][0].transcript;
      }
      setTranscript(current);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      setIsRecording(false);
      toast({
        title: "Microphone Error",
        description: event.error,
        variant: "destructive",
      });
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      try {
        recognition.stop();
      } catch {
        // already stopped
      }
    };
  }, [toast]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      toast({
        title: "Not Supported",
        description: "Voice recognition is not supported in this browser.",
        variant: "destructive",
      });
      return;
    }

    if (activeSessionId === null) {
      toast({
        title: "No session selected",
        description: "Start a practice or game before recording.",
        variant: "destructive",
      });
      return;
    }

    if (!isRecording) {
      setTranscript("");
      setVoiceResult(null);
      setVoiceWarning(null);
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch {
        // start() throws if already running
      }
      return;
    }

    recognitionRef.current.stop();
    setIsRecording(false);

    const spoken = transcript.trim();
    if (!spoken) return;

    setVoiceResult(null);
    processVoice(
      { data: { sessionId: activeSessionId, transcript: spoken } },
      {
        onSuccess: (res) => {
          if (res.changes.length > 0) {
            const summary = res.changes
              .map((c) => `${c.playerName} ${c.delta > 0 ? "+" : ""}${c.delta} ${c.stat}`)
              .join(" • ");
            setVoiceResult(summary);
            toast({ title: "Voice note applied", description: summary });
          } else {
            setVoiceResult("No stat changes found in that recording.");
          }

          if (res.changes.length > 0) {
            // The whole recording undoes as one step. Reversing six taps one at
            // a time after a misheard note is worse than not having undo.
            const applied = res.changes;
            pushUndo({
              label: `voice note (${applied.length} ${applied.length === 1 ? "change" : "changes"})`,
              run: async () => {
                for (const change of applied) {
                  await updateStatAsync({
                    data: {
                      sessionId: activeSessionId,
                      playerId: change.playerId,
                      stat: change.stat,
                      delta: -change.delta,
                    },
                  });
                }
              },
            });
          }

          // Names the parser heard but could not place on the roster. Silently
          // dropping these is how stats quietly go missing.
          setVoiceWarning(
            res.unmatched.length > 0
              ? `Not on the roster, so nothing was recorded for: ${res.unmatched.join(", ")}`
              : null,
          );

          setTranscript("");
        },
        onError: () => {
          toast({
            title: "Processing failed",
            description: "Could not parse that voice note.",
            variant: "destructive",
          });
        },
      },
    );
  };

  if (sessionsLoading || (activeSessionId !== null && isLoading)) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-muted-foreground">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="font-display uppercase tracking-widest text-lg">Loading roster...</p>
      </div>
    );
  }

  if (activeSessionId === null) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
          <CalendarPlus className="w-8 h-8 text-primary" />
        </div>
        <h2 className="font-display text-3xl text-white mb-3">No session yet</h2>
        <p className="text-muted-foreground max-w-sm leading-relaxed">
          Stats belong to a practice or a game. Tap <span className="text-white font-bold">New</span> at
          the top to start one, then everything you record lands there.
        </p>
      </div>
    );
  }

  if (error || !statsData) {
    return (
      <div className="p-6 text-center mt-20">
        <div className="bg-destructive/10 text-destructive p-6 rounded-2xl border border-destructive/20 inline-block">
          <h2 className="font-display text-2xl mb-2">Could not load stats</h2>
          <p>Check your connection and try again.</p>
        </div>
      </div>
    );
  }

  const current = entries.find((e) => e.player.id === selectedPlayerId) ?? entries[0];

  if (!current) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-8 text-center text-muted-foreground">
        <p>No players on this roster yet.</p>
      </div>
    );
  }

  const stats = current.stats;
  const efficiency = hittingEfficiency(stats);
  const passAvg = passingAverage(stats);
  const serveRate = serveSuccessRate(stats);

  return (
    <div className="w-full max-w-xl mx-auto relative">
      <div
        className="absolute top-0 left-0 right-0 h-64 bg-cover bg-center bg-no-repeat opacity-50 z-0 pointer-events-none mix-blend-screen"
        style={{ backgroundImage: `url('${import.meta.env.BASE_URL}images/header-bg.png')` }}
      />
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-transparent to-background z-0 pointer-events-none" />

      <div className="relative z-10 px-4 pt-8 pb-6">
        <div className="mb-6">
          <h1 className="text-4xl md:text-5xl font-display text-transparent bg-clip-text bg-gradient-to-br from-white to-white/70 drop-shadow-sm">
            COURT<span className="text-primary">IQ</span>
          </h1>
          <p className="text-muted-foreground font-display text-lg tracking-widest">
            {activeSession?.label ?? "TRACKER"}
          </p>
        </div>

        <div className="flex justify-end mb-3">
          <UndoButton />
        </div>

        <div className="flex bg-secondary/80 backdrop-blur-md p-1.5 rounded-2xl mb-8 shadow-inner border border-white/5">
          {(["MANUAL", "VOICE"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-3 text-sm font-bold uppercase tracking-wider rounded-xl transition-all",
                activeTab === tab
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "text-muted-foreground hover:text-white",
              )}
            >
              {tab === "MANUAL" ? "Manual Entry" : "Voice Note"}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "MANUAL" ? (
            <motion.div
              key="manual"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-6">
                <label
                  htmlFor="player-select"
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block ml-1"
                >
                  Select Player
                </label>
                <div className="relative">
                  <select
                    id="player-select"
                    className="w-full appearance-none bg-card border-2 border-border text-foreground font-display text-2xl py-4 pl-6 pr-12 rounded-2xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 shadow-sm transition-all"
                    value={current.player.id}
                    onChange={(event) => setSelectedPlayerId(Number(event.target.value))}
                  >
                    {entries.map((entry) => (
                      <option key={entry.player.id} value={entry.player.id}>
                        {entry.player.jerseyNumber !== undefined
                          ? `#${entry.player.jerseyNumber} `
                          : ""}
                        {entry.player.name}
                        {entry.player.position ? ` (${entry.player.position})` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-primary">
                    <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true">
                      <path
                        d="M2 2L8 8L14 2"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="flex overflow-x-auto no-scrollbar gap-2 pb-2 mb-6 -mx-4 px-4 snap-x">
                {(Object.keys(CATEGORIES) as Category[]).map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={cn(
                      "snap-start shrink-0 px-6 py-3 rounded-2xl font-display tracking-widest text-lg transition-all border",
                      activeCategory === category
                        ? "bg-white text-background border-white shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                        : "bg-card/50 text-muted-foreground border-transparent hover:bg-card hover:text-white",
                    )}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="space-y-3 mb-8">
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={activeCategory}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-3"
                  >
                    {CATEGORIES[activeCategory].map((stat) => (
                      <StatRow
                        // A fresh row per player and session, so taps still saving
                        // for one player can never spill onto the next.
                        key={`${activeSessionId}-${current.player.id}-${stat.key}`}
                        sessionId={activeSessionId}
                        playerId={current.player.id}
                        playerName={current.player.name}
                        statKey={stat.key}
                        label={stat.label}
                        value={stats[stat.key as keyof typeof stats]}
                      />
                    ))}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="bg-gradient-to-br from-card to-background rounded-3xl p-6 border border-border/50 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10" />
                <h3 className="font-display text-xl text-white mb-1">THIS SESSION</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  {current.player.name}
                  {current.player.position ? ` · ${POSITION_LABEL[current.player.position]}` : ""}
                  {" · "}
                  {activeSession?.label ?? "this session"}
                </p>
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                  <SummaryStat
                    label="Hit Efficiency"
                    value={efficiency === null ? "—" : formatAverage(efficiency)}
                    accent
                  />
                  <SummaryStat
                    label="Pass Avg"
                    value={passAvg === null ? "—" : passAvg.toFixed(2)}
                  />
                  <SummaryStat
                    label="Blocks"
                    value={String(stats.blocks)}
                  />
                  <SummaryStat
                    label="Serves In"
                    value={serveRate === null ? "—" : formatPercent(serveRate)}
                    accent
                  />
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="voice"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center pt-8"
            >
              <div className="relative mb-12">
                {isRecording && (
                  <>
                    <motion.div
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="absolute inset-0 bg-destructive rounded-full"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], opacity: [0.8, 0, 0.8] }}
                      transition={{ duration: 1.5, delay: 0.2, repeat: Infinity }}
                      className="absolute inset-0 bg-destructive rounded-full"
                    />
                  </>
                )}

                <button
                  onClick={toggleRecording}
                  aria-label={isRecording ? "Stop recording" : "Start recording"}
                  className={cn(
                    "relative z-10 w-40 h-40 rounded-full flex items-center justify-center text-white shadow-2xl transition-all duration-300",
                    isRecording
                      ? "bg-destructive hover:bg-destructive/90 scale-105"
                      : "bg-card border-4 border-border hover:border-primary/50",
                  )}
                >
                  {isRecording ? (
                    <Square className="w-12 h-12" fill="currentColor" />
                  ) : (
                    <Mic className="w-16 h-16 text-primary" />
                  )}
                </button>
              </div>

              <h2 className="font-display text-3xl mb-2 text-center">
                {isRecording ? "LISTENING..." : "TAP TO RECORD"}
              </h2>
              <p className="text-muted-foreground text-center mb-8 px-8">
                Say things like <span className="text-white">"Aidan three kills on five attempts"</span> or{" "}
                <span className="text-white">"Nathan perfect pass"</span>.
              </p>

              <div className="w-full bg-card/50 backdrop-blur-md rounded-2xl p-6 min-h-[160px] border border-border/50 shadow-inner flex flex-col justify-center">
                {isProcessingVoice ? (
                  <div className="flex flex-col items-center text-primary">
                    <RefreshCw className="w-8 h-8 animate-spin mb-3" />
                    <p className="font-display tracking-widest uppercase">Reading your note...</p>
                  </div>
                ) : transcript ? (
                  <p className="text-lg text-white/90 italic text-center font-serif leading-relaxed">
                    &ldquo;{transcript}&rdquo;
                  </p>
                ) : voiceResult ? (
                  <div className="text-center">
                    <div className="inline-block bg-primary/20 text-primary px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-3">
                      Applied
                    </div>
                    <p className="text-lg text-white font-medium">{voiceResult}</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground/50 text-center uppercase tracking-widest text-sm font-bold">
                    Transcript will appear here
                  </p>
                )}
              </div>

              {voiceWarning && (
                <div className="w-full mt-4 flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-2xl p-4">
                  <TriangleAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive leading-relaxed">{voiceWarning}</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className={cn("font-display text-3xl", accent ? "text-primary" : "text-white")}>
        {value}
      </p>
    </div>
  );
}
