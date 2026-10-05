import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Building2,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  Monitor,
  PanelsTopLeft,
  Tags,
  TrendingUp,
  Tv,
  UserCog,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/**
 * Menu do admin em grupos. Separado do AppShell para dar para testar a
 * estrutura sem renderizar nada e para o shell não saber se serve admin ou
 * portal.
 */
export const adminNav: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { href: '/', label: 'Visão geral', icon: BarChart3 },
      { href: '/parque', label: 'Parque de TVs', icon: Monitor },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { href: '/companies', label: 'Empresas', icon: Building2 },
      { href: '/segments', label: 'Segmentos', icon: Tags },
    ],
  },
  {
    label: 'Conteúdo',
    items: [
      { href: '/admin', label: 'Biblioteca de Mídia', icon: LayoutDashboard },
      { href: '/panels', label: 'Painéis', icon: PanelsTopLeft },
      { href: '/divulgacao', label: 'Divulgação', icon: Megaphone },
    ],
  },
  { label: 'Sistema', items: [{ href: '/users-admin', label: 'Contas de Acesso', icon: KeyRound }] },
];

/**
 * Menu do portal montado pelos papéis. Quem é anunciante e cliente vê os dois
 * grupos juntos, sem botão de alternar. Item de papel que o usuário não tem
 * nem aparece — a API bloquearia de qualquer jeito.
 */
export function portalNav(roles: string[]): NavGroup[] {
  const groups: NavGroup[] = [];
  if (roles.includes('advertiser')) {
    groups.push({ label: 'Anunciante', items: [{ href: '/portal/anunciante', label: 'Desempenho', icon: TrendingUp }] });
  }
  if (roles.includes('client')) {
    groups.push({
      label: 'Cliente',
      items: [
        { href: '/portal/tvs', label: 'Minhas TVs', icon: Tv },
        { href: '/portal/paineis', label: 'Meus painéis', icon: PanelsTopLeft },
      ],
    });
  }
  groups.push({ items: [{ href: '/portal/conta', label: 'Minha conta', icon: UserCog }] });
  return groups;
}

/** Para onde vai quem abre `/` (ou uma rota que não é do seu papel). */
export function portalHome(roles: string[]): string {
  return roles.includes('advertiser') ? '/portal/anunciante' : '/portal/tvs';
}

/**
 * Item ativo na rota exata e nas filhas (`/companies/5` acende Empresas).
 * A raiz é exceção: por prefixo, "Visão geral" acenderia em toda página.
 */
export function isNavItemActive(location: string, href: string): boolean {
  if (href === '/') return location === '/';
  return location === href || location.startsWith(`${href}/`);
}
