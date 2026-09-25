import { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';
import { logout } from '@/lib/logout';

export function PortalShell({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  async function handleLogout() {
    await logout(queryClient);
  }

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 print:hidden">
        <div className="container mx-auto flex h-16 items-center px-4">
          <div className="flex items-center gap-3 text-foreground">
            <Logo className="h-8" />
            <span className="hidden border-l border-border pl-3 text-sm font-medium text-muted-foreground sm:inline">
              Painel de Anúncios
            </span>
          </div>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto w-full flex-1 px-4 py-6 print:max-w-none print:px-0 print:py-0">{children}</main>
    </div>
  );
}
