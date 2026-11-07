import { useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useGetAuthStatus, useLogin } from "@workspace/api-client-react";

/**
 * Everything behind this component requires the team passcode.
 *
 * The gate is not decoration: the API rejects unauthenticated requests on its
 * own. This is the front door, not the lock.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { data, isLoading } = useGetAuthStatus();
  const queryClient = useQueryClient();
  const { mutate: login, isPending } = useLogin();

  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (data?.authenticated) {
    return <>{children}</>;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    login(
      { data: { passcode } },
      {
        onSuccess: () => {
          setPasscode("");
          void queryClient.invalidateQueries();
        },
        onError: () => setError("That passcode did not work."),
      },
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-6">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display text-4xl text-white tracking-wide">COURT<span className="text-primary">IQ</span></h1>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            Team stats are private. Enter your team passcode to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            <input
              autoFocus
              type="password"
              inputMode="text"
              autoComplete="current-password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              placeholder="Team passcode"
              aria-label="Team passcode"
              className="w-full h-14 pl-12 pr-4 bg-card border border-border rounded-2xl text-white placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive text-center">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending || passcode.length === 0}
            className="w-full h-14 bg-primary text-primary-foreground rounded-2xl font-display text-lg uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 active:scale-[0.99] transition"
          >
            {isPending ? "Checking..." : "Enter"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground/70 mt-8 leading-relaxed">
          Player names and stats are only visible to people with this passcode.
        </p>
      </div>
    </div>
  );
}
