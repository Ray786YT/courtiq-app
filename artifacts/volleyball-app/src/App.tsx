import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGate } from "@/components/auth-gate";
import { ActiveSessionProvider } from "@/hooks/use-active-session";
import { UndoProvider } from "@/hooks/use-undo";
import TrackerPage from "@/pages/tracker";
import StatsTablePage from "@/pages/stats";
import PlayerDetailPage from "@/pages/player";
import RosterPage from "@/pages/roster";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 401 means the passcode session expired. Retrying will not fix it.
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 404) return false;
        return failureCount < 2;
      },
      staleTime: 5_000,
    },
  },
});

function Routes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={TrackerPage} />
        <Route path="/stats" component={StatsTablePage} />
        <Route path="/roster" component={RosterPage} />
        <Route path="/players/:playerId" component={PlayerDetailPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthGate>
            <ActiveSessionProvider>
              <UndoProvider>
                <Routes />
              </UndoProvider>
            </ActiveSessionProvider>
          </AuthGate>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
