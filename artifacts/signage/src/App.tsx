import { ReactNode, useEffect } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Spinner } from '@/components/ui/spinner';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';

import { Layout } from './components/layout';
import Admin from './pages/admin';
import Login from './pages/login';
import Display from './pages/display';
import Clients from './pages/clients';
import ClientDetail from './pages/client-detail';
import DeviceDetail from './pages/device-detail';
import Analytics from './pages/analytics';
import Advertisers from './pages/advertisers';
import AdvertiserDetail from './pages/advertiser-detail';
import CampaignDetail from './pages/campaign-detail';
import { UNAUTHORIZED_EVENT } from './lib/auth-fetch-guard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AdminRoutes() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/clients" />
      </Route>
      <Route path="/clients">
        <Layout><Clients /></Layout>
      </Route>
      <Route path="/clients/:id">
        <Layout><ClientDetail /></Layout>
      </Route>
      <Route path="/devices/:id">
        <Layout><DeviceDetail /></Layout>
      </Route>
      <Route path="/admin">
        <Layout><Admin /></Layout>
      </Route>
      <Route path="/analytics">
        <Layout><Analytics /></Layout>
      </Route>
      <Route path="/advertisers">
        <Layout><Advertisers /></Layout>
      </Route>
      <Route path="/advertisers/:id">
        <Layout><AdvertiserDetail /></Layout>
      </Route>
      <Route path="/campaigns/:id">
        <Layout><CampaignDetail /></Layout>
      </Route>
      <Route>
        <Layout><NotFound /></Layout>
      </Route>
    </Switch>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/me`);
      return { authenticated: res.ok };
    },
    retry: false,
  });

  useEffect(() => {
    const onUnauthorized = () => {
      queryClient.setQueryData(['auth'], { authenticated: false });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!data?.authenticated) {
    return <Login />;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/display/:deviceKey" component={Display} />
      <Route>
        <AuthGate>
          <AdminRoutes />
        </AuthGate>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
