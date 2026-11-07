import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type UndoEntry = {
  /** Shown on the undo button, e.g. "Aidan Kills +1". */
  label: string;
  /** Reverses the change. Should be idempotent enough to survive a double tap. */
  run: () => Promise<unknown>;
};

type UndoValue = {
  lastLabel: string | null;
  depth: number;
  canUndo: boolean;
  isUndoing: boolean;
  push: (entry: UndoEntry) => void;
  undo: () => Promise<void>;
  clear: () => void;
};

const UndoContext = createContext<UndoValue | null>(null);

/** How many steps back a coach can walk. Deep enough for a bad rally. */
const MAX_DEPTH = 25;

/**
 * A stack of inverse actions rather than a snapshot history.
 *
 * Stat tracking during a rally is fast and error-prone: a tap lands on the
 * wrong player and the number is wrong with no way back. Every mutation
 * registers how to reverse itself, so undo is a real API call in the opposite
 * direction and works across page navigation.
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<UndoEntry[]>([]);
  const [isUndoing, setIsUndoing] = useState(false);

  const push = useCallback((entry: UndoEntry) => {
    setStack((current) => [...current, entry].slice(-MAX_DEPTH));
  }, []);

  const clear = useCallback(() => setStack([]), []);

  const undo = useCallback(async () => {
    let entry: UndoEntry | undefined;

    setStack((current) => {
      entry = current[current.length - 1];
      return entry ? current.slice(0, -1) : current;
    });

    // setStack's updater runs synchronously, so `entry` is populated by here.
    if (!entry) return;

    setIsUndoing(true);
    try {
      await entry.run();
    } finally {
      setIsUndoing(false);
    }
  }, []);

  const value = useMemo<UndoValue>(
    () => ({
      lastLabel: stack.length > 0 ? stack[stack.length - 1]!.label : null,
      depth: stack.length,
      canUndo: stack.length > 0 && !isUndoing,
      isUndoing,
      push,
      undo,
      clear,
    }),
    [stack, isUndoing, push, undo, clear],
  );

  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
}

export function useUndo(): UndoValue {
  const context = useContext(UndoContext);
  if (!context) throw new Error("useUndo must be used inside an UndoProvider");
  return context;
}
