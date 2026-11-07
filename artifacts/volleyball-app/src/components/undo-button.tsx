import { Undo2 } from "lucide-react";
import { useUndo } from "@/hooks/use-undo";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Undoes the last stat change.
 *
 * Always rendered, disabled when there is nothing to undo, so its position on
 * screen never moves. A button that appears and disappears is a button you
 * cannot hit without looking.
 */
export function UndoButton({ className }: { className?: string }) {
  const { canUndo, isUndoing, lastLabel, undo } = useUndo();
  const { toast } = useToast();

  const handleClick = async () => {
    const label = lastLabel;
    try {
      await undo();
      if (label) toast({ title: "Undone", description: label });
    } catch {
      toast({ title: "Could not undo that", variant: "destructive" });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canUndo}
      title={lastLabel ? `Undo ${lastLabel}` : "Nothing to undo"}
      className={cn(
        "flex items-center gap-2 h-10 px-4 rounded-xl border font-display text-sm uppercase tracking-wider transition",
        canUndo
          ? "bg-secondary border-white/10 text-white hover:bg-secondary/80 active:scale-95"
          : "bg-secondary/40 border-transparent text-muted-foreground/50 cursor-not-allowed",
        className,
      )}
    >
      <Undo2 className={cn("w-4 h-4", isUndoing && "animate-spin")} />
      <span className="max-w-40 truncate">
        {isUndoing ? "Undoing..." : lastLabel ? `Undo ${lastLabel}` : "Undo"}
      </span>
    </button>
  );
}
