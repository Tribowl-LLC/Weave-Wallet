import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatePresence } from "framer-motion";

import OfflineBanner from "@/components/OfflineBanner";
import SplashAuth from "@/pages/SplashAuth";
import Home from "@/pages/Home";
import Scan from "@/pages/Scan";
import Confirm from "@/pages/Confirm";
import Settings from "@/pages/Settings";
import Activity from "@/pages/Activity";
import Onboarding from "@/pages/Onboarding";
import Help from "@/pages/Help";
import NotFound from "@/pages/not-found";

import { bootstrapFiberConnection } from "@/lib/fiber/client";

const queryClient = new QueryClient();

function Router() {
  return (
    <AnimatePresence mode="wait">
      <Switch>
        <Route path="/" component={SplashAuth} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/home" component={Home} />
        <Route path="/scan" component={Scan} />
        <Route path="/confirm" component={Confirm} />
        <Route path="/activity" component={Activity} />
        <Route path="/settings" component={Settings} />
        <Route path="/help" component={Help} />
        <Route component={NotFound} />
      </Switch>
    </AnimatePresence>
  );
}

function App() {
  useEffect(() => {
    bootstrapFiberConnection().catch(err => {
      console.error("[fiber] Bootstrap failed:", err);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <OfflineBanner />
        <Toaster theme="dark" position="top-center" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
