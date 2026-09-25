import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutDashboard, BarChart3, Building2, LogOut, KeyRound, Megaphone, PanelsTopLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';
import { logout } from '@/lib/logout';

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const queryClient = useQueryClient();

  async function handleLogout() {
    await logout(queryClient);
  }

  const navItems = [
    { href: '/companies', label: 'Empresas', icon: Building2 },
    { href: '/panels', label: 'Painéis', icon: PanelsTopLeft },
    { href: '/admin', label: 'Biblioteca de Mídia', icon: LayoutDashboard },
    { href: '/analytics', label: 'Análises', icon: BarChart3 },
    { href: '/users-admin', label: 'Contas de Acesso', icon: KeyRound },
    { href: '/divulgacao', label: 'Divulgação', icon: Megaphone },
  ];

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center px-4">
          <div className="flex items-center gap-3 text-foreground">
            <Logo className="h-8" />
            <span className="hidden border-l border-border pl-3 text-sm font-medium text-muted-foreground sm:inline">
              Painel de Anúncios
            </span>
          </div>

          <nav className="ml-8 flex gap-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = location === href || location.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground ${
                    active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <Button
            variant="ghost"
            size="sm"
            className="ml-auto flex items-center gap-2 text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
