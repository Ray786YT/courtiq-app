import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useGetSessions, type SessionSummary } from "@workspace/api-client-react";

const STORAGE_KEY = "courtiq.activeSessionId";

/**
 * Which practice or game the tracker is currently writing into.
 *
 * Kept in localStorage so a coach who reloads mid-practice lands back on the
 * same session instead of silently recording into the wrong one. Reads and
 * writes are guarded because storage throws in private browsing on some
 * browsers.
 */
function readStored(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(id: number | null): void {
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // Storage unavailable. The session still works for this page view.
  }
}

type ActiveSessionValue = {
  sessions: SessionSummary[];
  activeSession: SessionSummary | null;
  activeSessionId: number | null;
  setActiveSessionId: (id: number | null) => void;
  isLoading: boolean;
};

const ActiveSessionContext = createContext<ActiveSessionValue | null>(null);

export function ActiveSessionProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useGetSessions();
  const [activeSessionId, setActiveSessionIdState] = useState<number | null>(
    () => readStored(),
  );

  const sessions = useMemo(() => data?.sessions ?? [], [data]);

  const setActiveSessionId = useCallback((id: number | null) => {
    setActiveSessionIdState(id);
    writeStored(id);
  }, []);

  // If the stored session was deleted or belongs to another team, fall back to
  // the most recent one rather than writing into nothing.
  useEffect(() => {
    if (isLoading || sessions.length === 0) return;
    const stillExists = sessions.some((s) => s.id === activeSessionId);
    if (!stillExists) setActiveSessionId(sessions[0]!.id);
  }, [isLoading, sessions, activeSessionId, setActiveSessionId]);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? null;

  const value: ActiveSessionValue = {
    sessions,
    activeSession,
    activeSessionId: activeSession?.id ?? null,
    setActiveSessionId,
    isLoading,
  };

  return (
    <ActiveSessionContext.Provider value={value}>
      {children}
    </ActiveSessionContext.Provider>
  );
}

export function useActiveSession(): ActiveSessionValue {
  const context = useContext(ActiveSessionContext);
  if (!context) {
    throw new Error("useActiveSession must be used inside an ActiveSessionProvider");
  }
  return context;
}
