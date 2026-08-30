import { ReactNode } from 'react';
import { MonitorPlay, LogOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

export function PortalShell({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  async function handleLogout() {
    await fetch(`${import.meta.env.BASE_URL}api/auth/logout`, { method: 'POST' });
    queryClient.setQueryData(['auth'], { authenticated: false });
  }

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center px-4">
          <div className="flex items-center gap-2 font-bold tracking-tight text-primary">
            <MonitorPlay className="h-6 w-6" />
            <span>Painel de Anúncios</span>
          </div>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto w-full flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
