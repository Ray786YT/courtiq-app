import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPlayers,
  useCreatePlayer,
  useUpdatePlayer,
  useDeactivatePlayer,
  getGetPlayersQueryKey,
  type Player,
  type Position,
} from "@workspace/api-client-react";
import {
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  UserMinus,
  Check,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { POSITIONS, POSITION_LABEL, POSITION_SHORT } from "@/lib/positions";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function RosterPage() {
  const { data, isLoading } = useGetPlayers();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getGetPlayersQueryKey() });
    void queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/"),
    });
  };

  const { mutate: createPlayer, isPending: isCreating } = useCreatePlayer();
  const { mutate: updatePlayer } = useUpdatePlayer();
  const { mutate: deactivatePlayer } = useDeactivatePlayer();

  const [newName, setNewName] = useState("");
  const [newJersey, setNewJersey] = useState("");
  const [newPosition, setNewPosition] = useState<Position | "">("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Player | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const players = data?.players ?? [];
  const active = players.filter((p) => p.active);
  const inactive = players.filter((p) => !p.active);

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;

    const jersey = newJersey.trim() === "" ? undefined : Number(newJersey);
    if (jersey !== undefined && (!Number.isInteger(jersey) || jersey < 0)) {
      toast({ title: "Jersey number must be a whole number", variant: "destructive" });
      return;
    }

    createPlayer(
      {
        data: {
          name,
          ...(jersey !== undefined ? { jerseyNumber: jersey } : {}),
          ...(newPosition ? { position: newPosition } : {}),
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setNewName("");
          setNewJersey("");
          setNewPosition("");
          toast({ title: `${name} added` });
        },
        onError: (error) => {
          toast({
            title: error.status === 409 ? `${name} is already on the roster` : "Could not add that player",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleRemove = (player: Player) => {
    deactivatePlayer(
      { playerId: player.id },
      {
        onSuccess: () => {
          invalidate();
          setConfirmRemove(null);
          toast({
            title: `${player.name} removed`,
            description: "Their stats are kept in the team history.",
          });
        },
        onError: () => toast({ title: "Could not remove that player", variant: "destructive" }),
      },
    );
  };

  const handleRestore = (player: Player) => {
    updatePlayer(
      { playerId: player.id, data: { active: true } },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: `${player.name} is back on the roster` });
        },
      },
    );
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8">
      <div className="mb-6 pt-2">
        <h1 className="font-display text-3xl md:text-4xl text-white">ROSTER</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {active.length} active {active.length === 1 ? "player" : "players"}. Positions matter:
          they keep hitting comparisons within the same job.
        </p>
      </div>

      {/* Add */}
      <form
        onSubmit={handleAdd}
        className="bg-card border border-border/50 rounded-2xl p-4 mb-8 space-y-3"
      >
        <div className="flex gap-2">
          <input
            value={newJersey}
            onChange={(e) => setNewJersey(e.target.value)}
            placeholder="#"
            inputMode="numeric"
            aria-label="Jersey number"
            className="w-16 h-12 px-2 bg-background border border-border rounded-xl text-white text-center placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Player name"
            aria-label="Player name"
            className="flex-1 min-w-0 h-12 px-3 bg-background border border-border rounded-xl text-white placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {POSITIONS.map((position) => (
            <button
              key={position}
              type="button"
              onClick={() => setNewPosition(newPosition === position ? "" : position)}
              className={cn(
                "px-3 h-9 rounded-lg text-xs font-display uppercase tracking-wider border transition",
                newPosition === position
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-muted-foreground border-transparent hover:text-white",
              )}
            >
              {POSITION_LABEL[position]}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={isCreating || !newName.trim()}
          className="w-full h-12 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl font-display uppercase tracking-widest disabled:opacity-40 hover:bg-primary/90 transition"
        >
          <Plus className="w-5 h-5" />
          Add player
        </button>
      </form>

      {/* Active roster */}
      <div className="space-y-2 mb-10">
        {active.map((player) =>
          editingId === player.id ? (
            <PlayerEditor
              key={player.id}
              player={player}
              onCancel={() => setEditingId(null)}
              onSave={(patch) =>
                updatePlayer(
                  { playerId: player.id, data: patch },
                  {
                    onSuccess: () => {
                      invalidate();
                      setEditingId(null);
                    },
                    onError: (error) =>
                      toast({
                        title:
                          error.status === 409
                            ? "Another player already has that name"
                            : "Could not save",
                        variant: "destructive",
                      }),
                  },
                )
              }
            />
          ) : (
            <div
              key={player.id}
              className="flex items-center gap-3 bg-card border border-border/50 rounded-2xl px-4 py-3"
            >
              <span className="w-10 shrink-0 text-center font-display text-xl text-muted-foreground">
                {player.jerseyNumber ?? "—"}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-white font-medium truncate">{player.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {player.position ? POSITION_LABEL[player.position] : "No position set"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setEditingId(player.id)}
                aria-label={`Edit ${player.name}`}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(player)}
                aria-label={`Remove ${player.name}`}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
              >
                <UserMinus className="w-4 h-4" />
              </button>
            </div>
          ),
        )}
      </div>

      {/* Removed players */}
      {inactive.length > 0 && (
        <section>
          <h2 className="font-display text-lg text-muted-foreground mb-1">NO LONGER ON THE TEAM</h2>
          <p className="text-xs text-muted-foreground/70 mb-3">
            Their stats stay in the season history. Add them back any time.
          </p>
          <div className="space-y-2">
            {inactive.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-3 bg-card/40 border border-border/30 rounded-2xl px-4 py-3"
              >
                <span className="w-10 shrink-0 text-center font-display text-lg text-muted-foreground/50">
                  {player.jerseyNumber ?? "—"}
                </span>
                <span className="flex-1 min-w-0 text-muted-foreground truncate">{player.name}</span>
                <button
                  type="button"
                  onClick={() => handleRestore(player)}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-display uppercase tracking-wider text-muted-foreground hover:text-primary hover:bg-primary/10 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restore
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <Dialog open={confirmRemove !== null} onOpenChange={(open) => !open && setConfirmRemove(null)}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-white">
              Remove {confirmRemove?.name}?
            </DialogTitle>
            <DialogDescription className="text-base">
              They stop appearing in the tracker, but every stat they earned stays in the season
              history. You can add them back later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 gap-2">
            <button
              onClick={() => setConfirmRemove(null)}
              className="flex-1 py-3 bg-secondary text-white rounded-xl font-display uppercase tracking-widest hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
            <button
              onClick={() => confirmRemove && handleRemove(confirmRemove)}
              className="flex-1 py-3 bg-destructive text-white rounded-xl font-display uppercase tracking-widest hover:bg-destructive/90 transition"
            >
              Remove
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlayerEditor({
  player,
  onSave,
  onCancel,
}: {
  player: Player;
  onSave: (patch: { name?: string; jerseyNumber?: number | null; position?: Position }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(player.name);
  const [jersey, setJersey] = useState(
    player.jerseyNumber === undefined ? "" : String(player.jerseyNumber),
  );
  const [position, setPosition] = useState<Position | "">(player.position ?? "");

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      name: trimmed,
      jerseyNumber: jersey.trim() === "" ? null : Number(jersey),
      ...(position ? { position } : {}),
    });
  };

  return (
    <div className="bg-card border border-primary/40 rounded-2xl p-4 space-y-3">
      <div className="flex gap-2">
        <input
          value={jersey}
          onChange={(e) => setJersey(e.target.value)}
          inputMode="numeric"
          aria-label="Jersey number"
          className="w-16 h-11 px-2 bg-background border border-border rounded-xl text-white text-center focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Player name"
          className="flex-1 min-w-0 h-11 px-3 bg-background border border-border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {POSITIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setPosition(option)}
            className={cn(
              "px-3 h-8 rounded-lg text-xs font-display uppercase tracking-wider border transition",
              position === option
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary text-muted-foreground border-transparent hover:text-white",
            )}
          >
            {POSITION_SHORT[option]}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 h-11 flex items-center justify-center gap-2 bg-secondary text-muted-foreground rounded-xl font-display uppercase tracking-wider hover:text-white transition"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
        <button
          onClick={save}
          className="flex-1 h-11 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl font-display uppercase tracking-wider hover:bg-primary/90 transition"
        >
          <Check className="w-4 h-4" />
          Save
        </button>
      </div>
    </div>
  );
}
