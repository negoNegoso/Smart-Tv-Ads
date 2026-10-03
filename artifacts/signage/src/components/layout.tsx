import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { adminNav } from '@/components/nav-config';

export function Layout({ children }: { children: ReactNode }) {
  return <AppShell navGroups={adminNav}>{children}</AppShell>;
}
