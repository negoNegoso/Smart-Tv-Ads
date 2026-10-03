import { Fragment } from 'react';
import { Link } from 'wouter';
import { ChevronLeft } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export interface TrailItem {
  label: string;
  href?: string;
}

/**
 * Caminho até a página. A página declara o trail porque só ela sabe o nome
 * da TV ou da campanha (vem da query dela). O título continua na página.
 *
 * No celular o caminho inteiro quebraria linha; lá vale só "‹ anterior".
 * A troca é por CSS para não depender de medir a tela.
 */
export function PageHeader({ trail }: { trail: TrailItem[] }) {
  const back = trail
    .slice(0, -1)
    .reverse()
    .find((item) => item.href);

  return (
    <div className="mb-6">
      <Breadcrumb className="hidden md:block">
        <BreadcrumbList>
          {trail.map((item, index) => {
            const isLast = index === trail.length - 1;
            return (
              <Fragment key={`${index}-${item.label}`}>
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {item.href && !isLast ? (
                    <BreadcrumbLink asChild>
                      <Link href={item.href}>{item.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      {back?.href ? (
        <Link
          href={back.href}
          data-testid="page-header-voltar"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground md:hidden"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {back.label}
        </Link>
      ) : null}
    </div>
  );
}
