import { useEffect } from 'react';
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
import { Route, Switch, Router as WouterRouter, Redirect, useLocation, useSearch } from 'wouter';

import { Layout } from './components/layout';
import { PortalShell } from './components/portal-shell';
import { portalHome } from './components/nav-config';
import Admin from './pages/admin';
import Login from './pages/login';
import Display from './pages/display';
import Companies from './pages/companies';
import UrgentAlerts from './pages/urgent-alerts';
import Segments from './pages/segments';
import CompanyDetailPage from './pages/company-detail';
import LegacyRedirect from './pages/legacy-redirect';
import DeviceDetail from './pages/device-detail';
import ParearPage from './pages/parear';
import Analytics from './pages/analytics';
import CampaignDetail from './pages/campaign-detail';
import Users from './pages/users';
import Divulgacao from './pages/divulgacao';
import Fleet from './pages/fleet';
import ChangePassword from './pages/change-password';
import PortalAdvertiser from './pages/portal-advertiser';
import PortalCampaignReport from './pages/portal-campaign-report';
import PortalDeviceReport from './pages/portal-device-report';
import PortalClient from './pages/portal-client';
import PortalPanels from './pages/portal-panels';
import PortalPanelEditor from './pages/portal-panel-editor';
import PortalAccount from './pages/portal-account';
import PanelsAdmin from './pages/panels-admin';
import { UNAUTHORIZED_EVENT } from './lib/auth-fetch-guard';
import Landing from './pages/landing';
import Apresentacao from './pages/apresentacao';
import { clearSessionHint, hasSessionHint, markSessionStarted } from './lib/session-hint';
import { loginPathFor, readNextPath } from './lib/next-path';

interface Me {
  authenticated: boolean;
  isAdmin: boolean;
  roles: string[];
  clientIds: number[];
  advertiserIds: number[];
  mustChangePassword: boolean;
  maxUploadBytes?: number;
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
        <Layout><Analytics /></Layout>
      </Route>
      <Route path="/companies">
        <Layout><Companies /></Layout>
      </Route>
      <Route path="/companies/:id">
        <Layout><CompanyDetailPage /></Layout>
      </Route>
      <Route path="/segments">
        <Layout><Segments /></Layout>
      </Route>
      <Route path="/parque">
        <Layout><Fleet /></Layout>
      </Route>
      <Route path="/avisos">
        <Layout><UrgentAlerts /></Layout>
      </Route>
      <Route path="/clients">
        <Redirect to="/companies" />
      </Route>
      <Route path="/clients/:id">
        <Layout><LegacyRedirect kind="client" /></Layout>
      </Route>
      <Route path="/advertisers">
        <Redirect to="/companies" />
      </Route>
      <Route path="/advertisers/:id">
        <Layout><LegacyRedirect kind="advertiser" /></Layout>
      </Route>
      <Route path="/panels">
        <Layout><PanelsAdmin /></Layout>
      </Route>
      <Route path="/panels/:id">
        <Layout><PanelsAdmin /></Layout>
      </Route>
      <Route path="/devices/:id">
        <Layout><DeviceDetail /></Layout>
      </Route>
      <Route path="/parear/:key">
        <Layout><ParearPage /></Layout>
      </Route>
      <Route path="/admin">
        <Layout><Admin /></Layout>
      </Route>
      {/* Links salvos de antes da Visão geral virar a raiz. */}
      <Route path="/analytics">
        <Redirect to="/" replace />
      </Route>
      <Route path="/campaigns/:id">
        <Layout><CampaignDetail /></Layout>
      </Route>
      <Route path="/users-admin">
        <Layout><Users /></Layout>
      </Route>
      <Route path="/divulgacao">
        <Layout><Divulgacao /></Layout>
      </Route>
      <Route>
        <Layout><NotFound /></Layout>
      </Route>
    </Switch>
  );
}

/**
 * O `:id` vem da URL: qualquer coisa que não seja inteiro positivo volta para
 * a lista em vez de abrir o editor com NaN.
 */
function PortalPanelRoute({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const panelId = Number(id);
  if (!Number.isInteger(panelId) || panelId <= 0) return <Redirect to="/portal/paineis" replace />;
  return <PortalPanelEditor panelId={panelId} onBack={() => navigate('/portal/paineis')} />;
}

/** `:id` que não é inteiro positivo volta para a lista em vez de pedir um relatório de NaN. */
function PortalCampaignRoute({ id }: { id: string }) {
  const campaignId = Number(id);
  if (!Number.isInteger(campaignId) || campaignId <= 0) return <Redirect to="/portal/anunciante" replace />;
  return <PortalCampaignReport id={campaignId} />;
}

/** `:id` que não é inteiro positivo volta para a lista em vez de pedir um relatório de NaN. */
function PortalDeviceRoute({ id }: { id: string }) {
  const deviceId = Number(id);
  if (!Number.isInteger(deviceId) || deviceId <= 0) return <Redirect to="/portal/tvs" replace />;
  return <PortalDeviceReport id={deviceId} />;
}

/**
 * Cada tela do portal tem URL própria: F5, voltar do navegador e link
 * mandado a alguém abrem a mesma tela. Rota de papel que o usuário não tem
 * nem é registrada e cai no redirect final — a API bloquearia de qualquer
 * jeito, o redirect só evita uma tela de erro.
 */
function PortalRoutes({ me }: { me: Me }) {
  const [, navigate] = useLocation();
  const isAdv = me.roles.includes('advertiser');
  const isClient = me.roles.includes('client');

  return (
    <PortalShell roles={me.roles}>
      <Switch>
        {isAdv ? (
          <Route path="/portal/anunciante/campanhas/:id">{(params) => <PortalCampaignRoute id={params.id} />}</Route>
        ) : null}
        {isAdv ? (
          <Route path="/portal/anunciante">
            <PortalAdvertiser />
          </Route>
        ) : null}
        {isClient ? (
          <Route path="/portal/tvs/:id">{(params) => <PortalDeviceRoute id={params.id} />}</Route>
        ) : null}
        {isClient ? (
          <Route path="/portal/tvs">
            <PortalClient />
          </Route>
        ) : null}
        {isClient ? (
          <Route path="/portal/paineis/:id">{(params) => <PortalPanelRoute id={params.id} />}</Route>
        ) : null}
        {isClient ? (
          <Route path="/portal/paineis">
            <PortalPanels onEdit={(id) => navigate(`/portal/paineis/${id}`)} />
          </Route>
        ) : null}
        <Route path="/portal/conta">
          <PortalAccount />
        </Route>
        <Route>
          <Redirect to={portalHome(me.roles)} replace />
        </Route>
      </Switch>
    </PortalShell>
  );
}

/**
 * A dica de sessão é escrita aqui, e não só no login, porque o login não é o
 * único jeito de chegar autenticado: cookie de antes deste deploy, outra aba,
 * storage que voltou vazio. Todo mundo que o servidor reconhece sai daqui com
 * a dica gravada — e quem ele não reconhece sai sem ela.
 */
function useAuthMe() {
  return useQuery({
    queryKey: ['auth'],
    queryFn: async (): Promise<Me> => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/me`);
      if (!res.ok) {
        clearSessionHint();
        return UNAUTHENTICATED;
      }
      const me: Me = await res.json();
      if (me.authenticated) markSessionStarted();
      else clearSessionHint();
      return me;
    },
    retry: false,
  });
}

function RoleRouter() {
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const search = useSearch();
  const { data: me, isLoading } = useAuthMe();

  useEffect(() => {
    const onUnauthorized = () => {
      clearSessionHint();
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
    return <Redirect to={loginPathFor(location, search ? `?${search}` : '')} />;
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
    return <PortalRoutes me={me} />;
  }
  return <Login />;
}

/**
 * A raiz é pública. Enquanto GET /api/auth/me está em voo, quem nunca logou
 * neste navegador já vê a landing; quem tem a dica de sessão vê o spinner de
 * sempre, para não piscar a página de marketing antes do painel.
 */
function RootGate() {
  const { data: me, isLoading } = useAuthMe();

  if (isLoading) {
    return hasSessionHint() ? (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner />
      </div>
    ) : (
      <Landing />
    );
  }
  if (me?.authenticated) {
    return <RoleRouter />;
  }
  return <Landing />;
}

function LoginGate() {
  const search = useSearch();
  const { data: me, isLoading } = useAuthMe();

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (me?.authenticated) {
    return <Redirect to={readNextPath(search ? `?${search}` : '')} />;
  }
  return <Login />;
}

function Router() {
  return (
    <Switch>
      <Route path="/display/:deviceKey" component={Display} />
      {/* Pública e fora do RootGate: abre igual com ou sem sessão, sem esperar /auth/me. */}
      <Route path="/apresentacao" component={Apresentacao} />
      <Route path="/" component={RootGate} />
      <Route path="/login" component={LoginGate} />
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
