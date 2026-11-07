import { Link, useLocation } from "wouter";
import { Activity, LayoutGrid, LogOut, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetAuthStatus, useLogout } from "@workspace/api-client-react";
import { SessionBar } from "@/components/session-bar";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Tracker", icon: Activity },
  { href: "/stats", label: "Stats", icon: LayoutGrid },
  { href: "/roster", label: "Roster", icon: Users },
] as const;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { mutate: logout } = useLogout();
  const { data: auth } = useGetAuthStatus();
  const team = auth?.authenticated ? auth.team : undefined;

  const handleLogout = () => {
    logout(undefined, {
      onSuccess: () => {
        queryClient.clear();
      },
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      {team && (
        <div className="bg-card/60 border-b border-border/40 px-4 py-1.5 flex items-center justify-between gap-3">
          <span className="font-display text-xs tracking-wide text-white shrink-0">
            COURT<span className="text-primary">IQ</span>
          </span>
          <span className="min-w-0 text-right text-[11px] text-muted-foreground truncate">
            <span className="text-white font-semibold">{team.name}</span>
            {team.school ? ` · ${team.school}` : ""}
          </span>
        </div>
      )}
      <SessionBar />

      <div className="flex-1 pb-24">{children}</div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-md border-t border-border shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.5)]">
        <div className="max-w-md mx-auto flex justify-around items-center p-2 pb-safe">
          {TABS.map((tab) => {
            const active = location === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex flex-col items-center justify-center w-full py-2 px-4 rounded-xl transition-all duration-300",
                  active
                    ? "text-primary bg-primary/10 shadow-inner"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                )}
              >
                <Icon
                  className={cn(
                    "w-6 h-6 mb-1",
                    active && "drop-shadow-[0_0_8px_rgba(245,184,0,0.8)]",
                  )}
                />
                <span className="text-[10px] font-bold uppercase tracking-wider font-display">
                  {tab.label}
                </span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={handleLogout}
            className="flex flex-col items-center justify-center w-full py-2 px-4 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-300"
          >
            <LogOut className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-wider font-display">
              Sign out
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}
