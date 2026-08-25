import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { MonitorPlay, Users, LayoutDashboard, BarChart3, Building2 } from 'lucide-react';

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: '/clients', label: 'Clientes', icon: Users },
    { href: '/admin', label: 'Biblioteca de Mídia', icon: LayoutDashboard },
    { href: '/analytics', label: 'Análises', icon: BarChart3 },
    { href: '/advertisers', label: 'Anunciantes', icon: Building2 },
  ];

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center px-4">
          <div className="flex items-center gap-2 font-bold tracking-tight text-primary">
            <MonitorPlay className="h-6 w-6" />
            <span>Painel de Anúncios</span>
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
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
