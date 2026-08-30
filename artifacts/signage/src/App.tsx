import { useEffect, useState } from 'react';
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
import { PortalShell } from './components/portal-shell';
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
import Users from './pages/users';
import ChangePassword from './pages/change-password';
import PortalAdvertiser from './pages/portal-advertiser';
import PortalClient from './pages/portal-client';
import { UNAUTHORIZED_EVENT } from './lib/auth-fetch-guard';

interface Me {
  authenticated: boolean;
  isAdmin: boolean;
  roles: string[];
  clientIds: number[];
  advertiserIds: number[];
  mustChangePassword: boolean;
}

const UNAUTHENTICATED: Me = {
  authenticated: false,
  isAdmin: false,
  roles: [],
  clientIds: [],
  advertiserIds: [],
  mustChangePassword: false,
};

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
      <Route path="/users-admin">
        <Layout><Users /></Layout>
      </Route>
      <Route>
        <Layout><NotFound /></Layout>
      </Route>
    </Switch>
  );
}

function PortalSwitch({ me }: { me: Me }) {
  const isAdv = me.roles.includes('advertiser');
  const isClient = me.roles.includes('client');
  const [view, setView] = useState<'advertiser' | 'client'>(isAdv ? 'advertiser' : 'client');

  return (
    <PortalShell>
      {isAdv && isClient ? (
        <div className="mb-4 flex gap-2 border-b">
          <button
            type="button"
            onClick={() => setView('advertiser')}
            className={`px-3 py-2 text-sm ${view === 'advertiser' ? 'border-b-2 border-primary font-semibold text-primary' : 'text-muted-foreground'}`}
          >
            Anunciante
          </button>
          <button
            type="button"
            onClick={() => setView('client')}
            className={`px-3 py-2 text-sm ${view === 'client' ? 'border-b-2 border-primary font-semibold text-primary' : 'text-muted-foreground'}`}
          >
            Cliente
          </button>
        </div>
      ) : null}
      {view === 'advertiser' && isAdv ? <PortalAdvertiser /> : null}
      {view === 'client' && isClient ? <PortalClient /> : null}
    </PortalShell>
  );
}

function RoleRouter() {
  const queryClient = useQueryClient();
  const { data: me, isLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: async (): Promise<Me> => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/me`);
      if (!res.ok) return UNAUTHENTICATED;
      return res.json();
    },
    retry: false,
  });

  useEffect(() => {
    const onUnauthorized = () => {
      queryClient.setQueryData(['auth'], UNAUTHENTICATED);
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
  if (!me?.authenticated) {
    return <Login />;
  }
  if (me.mustChangePassword) {
    return <ChangePassword onDone={() => queryClient.invalidateQueries({ queryKey: ['auth'] })} />;
  }
  if (me.isAdmin) {
    return <AdminRoutes />;
  }
  const isAdv = me.roles.includes('advertiser');
  const isClient = me.roles.includes('client');
  if (isAdv || isClient) {
    return <PortalSwitch me={me} />;
  }
  return <Login />;
}

function Router() {
  return (
    <Switch>
      <Route path="/display/:deviceKey" component={Display} />
      <Route>
        <RoleRouter />
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
