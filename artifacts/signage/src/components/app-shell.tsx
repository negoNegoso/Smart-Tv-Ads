import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { LogOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Logo } from '@/components/brand/logo';
import { logout } from '@/lib/logout';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { isNavItemActive, type NavGroup } from '@/components/nav-config';

function NavMenu({ groups }: { groups: NavGroup[] }) {
  const [location] = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <>
      {groups.map((group, index) => (
        <SidebarGroup key={group.label ?? `grupo-${index}`}>
          {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isNavItemActive(location, href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        // No celular a gaveta cobre a página: sem fechar,
                        // quem toca no item continua vendo o menu.
                        onClick={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                      >
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function TopBar() {
  const { isMobile } = useSidebar();
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 print:hidden">
      <SidebarTrigger aria-label="Abrir menu" />
      {/* No desktop o logo já está na sidebar; no celular a sidebar vira
          gaveta fechada, então o logo vem para a barra. */}
      {isMobile ? (
        <Logo className="h-7" />
      ) : (
        <span className="text-sm font-medium text-muted-foreground">Painel de Anúncios</span>
      )}
    </header>
  );
}

/**
 * Moldura comum do admin e do portal: sidebar no desktop, gaveta no celular.
 * Não sabe quem está servindo — os itens chegam por `navGroups`.
 */
export function AppShell({ navGroups, children }: { navGroups: NavGroup[]; children: ReactNode }) {
  const queryClient = useQueryClient();

  return (
    <SidebarProvider>
      {/* `contents` não cria caixa na tela; na impressão o print:hidden some
          com a sidebar inteira, inclusive o espaço reservado dela. */}
      <div className="contents print:hidden">
        <Sidebar>
          <SidebarHeader className="px-4 py-4">
            <Logo className="h-8" />
          </SidebarHeader>
          <SidebarContent>
            <NavMenu groups={navGroups} />
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => void logout(queryClient)}>
                  <LogOut />
                  <span>Sair</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
      </div>
      <SidebarInset className="min-h-[100dvh]">
        <TopBar />
        <div className="flex-1">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
