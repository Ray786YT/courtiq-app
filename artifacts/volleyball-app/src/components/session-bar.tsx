import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, ChevronDown, Pencil, Plus, Swords, Trash2, Dumbbell, X } from "lucide-react";
import {
  useCreateSession,
  useUpdateSession,
  useDeleteSession,
  getGetSessionsQueryKey,
  type CreateSessionRequestKind,
  type SessionSummary,
} from "@workspace/api-client-react";
import { useActiveSession } from "@/hooks/use-active-session";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Picks which practice or game the tracker writes into, and creates new ones.
 *
 * Sitting this at the top of every page is deliberate. The single most costly
 * mistake in a session-based tracker is recording a game into last week's
 * practice, so the current target is always on screen.
 */
export function SessionBar() {
  const { sessions, activeSession, setActiveSessionId, isLoading } = useActiveSession();
  const { mutate: createSession, isPending } = useCreateSession();
  const { mutate: updateSession } = useUpdateSession();
  const { mutate: deleteSession } = useDeleteSession();

  const removeSession = (session: SessionSummary) => {
    deleteSession(
      { sessionId: session.id },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: getGetSessionsQueryKey() });
          toast({ title: `Deleted "${session.label}"` });
        },
        onError: (error) =>
          toast({
            title:
              error.status === 409
                ? "That session still has stats"
                : "Could not delete that session",
            description:
              error.status === 409
                ? "Clear it from the stats table first, then delete it."
                : undefined,
            variant: "destructive",
          }),
      },
    );
  };
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const startRename = (session: SessionSummary) => {
    setRenamingId(session.id);
    setRenameValue(session.label);
  };

  const commitRename = (session: SessionSummary) => {
    const label = renameValue.trim();
    setRenamingId(null);
    if (!label || label === session.label) return;

    updateSession(
      { sessionId: session.id, data: { label } },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: getGetSessionsQueryKey() });
          toast({ title: `Renamed to "${label}"` });
        },
        onError: () => toast({ title: "Could not rename that session", variant: "destructive" }),
      },
    );
  };
  const [kind, setKind] = useState<CreateSessionRequestKind>("practice");
  const [label, setLabel] = useState("");
  const [opponent, setOpponent] = useState("");
  const [occurredOn, setOccurredOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();

    const fallback =
      kind === "game"
        ? opponent.trim()
          ? `vs ${opponent.trim()}`
          : "Game"
        : "Practice";

    createSession(
      {
        data: {
          kind,
          label: label.trim() || fallback,
          occurredOn,
          ...(opponent.trim() ? { opponent: opponent.trim() } : {}),
        },
      },
      {
        onSuccess: async (response) => {
          await queryClient.invalidateQueries({ queryKey: getGetSessionsQueryKey() });
          setActiveSessionId(response.session.id);
          setOpen(false);
          setLabel("");
          setOpponent("");
          toast({ title: `${response.session.label} started` });
        },
        onError: () => toast({ title: "Could not create that session", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="sticky top-0 z-40 bg-background/85 backdrop-blur-lg border-b border-border/60">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setPickerOpen((value) => !value)}
          disabled={isLoading || sessions.length === 0}
          className="flex-1 min-w-0 flex items-center gap-3 text-left disabled:opacity-60"
        >
          <span className="shrink-0 w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            {activeSession?.kind === "game" ? (
              <Swords className="w-4 h-4 text-primary" />
            ) : (
              <Dumbbell className="w-4 h-4 text-primary" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] uppercase tracking-widest text-muted-foreground font-display">
              Recording into
            </span>
            <span className="flex items-center gap-1.5 text-white font-bold truncate">
              {activeSession?.label ?? (isLoading ? "Loading..." : "No session yet")}
              {sessions.length > 0 && (
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform shrink-0",
                    pickerOpen && "rotate-180",
                  )}
                />
              )}
            </span>
          </span>
        </button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="shrink-0 h-10 px-4 flex items-center gap-2 bg-primary text-primary-foreground rounded-xl font-display text-sm uppercase tracking-wider hover:bg-primary/90 active:scale-95 transition"
            >
              <Plus className="w-4 h-4" />
              New
            </button>
          </DialogTrigger>

          <DialogContent className="bg-card border-border sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl text-white">
                New session
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-2">
                {(["practice", "game"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setKind(option)}
                    className={cn(
                      "h-12 rounded-xl font-display uppercase tracking-wider text-sm transition border",
                      kind === option
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-transparent hover:text-white",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="text-xs uppercase tracking-widest text-muted-foreground font-display">
                  Date
                </span>
                <input
                  type="date"
                  value={occurredOn}
                  onChange={(event) => setOccurredOn(event.target.value)}
                  className="mt-1 w-full h-12 px-3 bg-background border border-border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>

              {kind === "game" && (
                <label className="block">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground font-display">
                    Opponent
                  </span>
                  <input
                    value={opponent}
                    onChange={(event) => setOpponent(event.target.value)}
                    placeholder="Streetsville"
                    className="mt-1 w-full h-12 px-3 bg-background border border-border rounded-xl text-white placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
              )}

              <label className="block">
                <span className="text-xs uppercase tracking-widest text-muted-foreground font-display">
                  Name <span className="normal-case tracking-normal">(optional)</span>
                </span>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder={kind === "game" ? "vs Streetsville" : "Tuesday practice"}
                  className="mt-1 w-full h-12 px-3 bg-background border border-border rounded-xl text-white placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>

              <button
                type="submit"
                disabled={isPending}
                className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-display uppercase tracking-widest disabled:opacity-50 hover:bg-primary/90 transition"
              >
                {isPending ? "Starting..." : "Start recording"}
              </button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {pickerOpen && sessions.length > 0 && (
        <div className="max-h-72 overflow-y-auto border-t border-border/60 bg-card/60">
          {sessions.map((session) =>
            renamingId === session.id ? (
              <div
                key={session.id}
                className="flex items-center gap-2 px-4 py-3 border-b border-border/30 last:border-b-0 bg-primary/5"
              >
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitRename(session);
                    if (event.key === "Escape") setRenamingId(null);
                  }}
                  aria-label={`Rename ${session.label}`}
                  className="flex-1 min-w-0 h-10 px-3 bg-background border border-primary rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setRenamingId(null)}
                  aria-label="Cancel rename"
                  className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => commitRename(session)}
                  aria-label="Save name"
                  className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                key={session.id}
                className={cn(
                  "w-full flex items-center gap-2 px-4 py-3 border-b border-border/30 last:border-b-0 transition",
                  session.id === activeSession?.id ? "bg-primary/10" : "hover:bg-white/[0.03]",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveSessionId(session.id);
                    setPickerOpen(false);
                  }}
                  className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-white font-medium truncate">{session.label}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <CalendarDays className="w-3 h-3" />
                      {formatDate(session.occurredOn)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-display uppercase tracking-widest px-2 py-1 rounded-md",
                      session.kind === "game"
                        ? "bg-primary/15 text-primary"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {session.kind}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => startRename(session)}
                  aria-label={`Rename ${session.label}`}
                  className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeSession(session)}
                  aria-label={`Delete ${session.label}`}
                  title="Delete this session. Only works when it has no stats."
                  className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
