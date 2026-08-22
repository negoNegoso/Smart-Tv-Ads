import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';

import { Layout } from './components/layout';
import Admin from './pages/admin';
import Display from './pages/display';
import Clients from './pages/clients';
import ClientDetail from './pages/client-detail';
import DeviceDetail from './pages/device-detail';
import Analytics from './pages/analytics';
import Advertisers from './pages/advertisers';
import AdvertiserDetail from './pages/advertiser-detail';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
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
      <Route path="/display/:deviceKey" component={Display} />
      <Route>
        <Layout><NotFound /></Layout>
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
