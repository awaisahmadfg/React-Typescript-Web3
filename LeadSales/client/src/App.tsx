import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth";
import DashboardPage from "@/pages/dashboard";
import LeadsPage from "@/pages/leads";
import LeadDetailsPage from "@/pages/lead-details";
import ImportPage from "@/pages/import";
import TeamsPage from "@/pages/teams";
import PlansPage from "@/pages/plans";
import TasksPage from "@/pages/tasks";
import AnalyticsPage from "@/pages/analytics";
import LeadsByStagePage from "@/pages/leads-by-stage";
import PipelinePage from "@/pages/pipeline";
import ProfilesPage from "@/pages/profiles";
import ClientsPage from "@/pages/clients";
import ClientDetailsPage from "@/pages/client-details";
import UsersPage from "@/pages/users";
import SettingsPage from "@/pages/settings";
import { Layout } from "@/components/layout/Layout";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

function ProtectedRoute({ component: Component }: any) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return null;
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function AppRouter() {
  const { user, fetchMe, loading } = useAuth();

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  return (
    <Switch>
      <Route path="/auth">
        {!loading && user ? <Redirect to="/dashboard" /> : <AuthPage />}
      </Route>
      
      <Route path="/dashboard">
        <ProtectedRoute component={DashboardPage} />
      </Route>

      <Route path="/plans">
        <ProtectedRoute component={PlansPage} />
      </Route>

      <Route path="/tasks">
        <ProtectedRoute component={TasksPage} />
      </Route>

      <Route path="/analytics">
        <ProtectedRoute component={AnalyticsPage} />
      </Route>

      <Route path="/analytics/leads/:stage">
        <ProtectedRoute component={LeadsByStagePage} />
      </Route>

      <Route path="/pipeline">
        <ProtectedRoute component={PipelinePage} />
      </Route>

      <Route path="/clients">
        <ProtectedRoute component={ClientsPage} />
      </Route>

      <Route path="/clients/:id">
        <ProtectedRoute component={ClientDetailsPage} />
      </Route>

      <Route path="/profiles">
        <ProtectedRoute component={ProfilesPage} />
      </Route>

      <Route path="/users">
        <ProtectedRoute component={UsersPage} />
      </Route>

      <Route path="/leads">
        <ProtectedRoute component={LeadsPage} />
      </Route>

      <Route path="/leads/:id">
        <ProtectedRoute component={LeadDetailsPage} />
      </Route>

      <Route path="/import">
        <ProtectedRoute component={ImportPage} />
      </Route>

      <Route path="/teams">
        <ProtectedRoute component={TeamsPage} />
      </Route>

      <Route path="/settings">
        <ProtectedRoute component={SettingsPage} />
      </Route>

      <Route path="/">
        {!loading && user ? <Redirect to="/dashboard" /> : <Redirect to="/auth" />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter>
          <AppRouter />
          <Toaster />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
