import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { portalNav } from '@/components/nav-config';

/**
 * Portal do anunciante/cliente. O contêiner mantém as regras de impressão de
 * antes: o PDF do portal sai sem margem extra e sem menu.
 */
export function PortalShell({ roles, children }: { roles: string[]; children: ReactNode }) {
  return (
    <AppShell navGroups={portalNav(roles)}>
      <div className="container mx-auto w-full px-4 py-6 print:max-w-none print:px-0 print:py-0">{children}</div>
    </AppShell>
  );
}
