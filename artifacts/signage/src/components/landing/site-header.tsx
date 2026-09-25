import { Link } from 'wouter';
import { Logo } from '@/components/brand/logo';
import { LANDING } from '@/lib/landing-content';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="text-foreground">
          <Logo className="h-9" />
        </Link>

        <nav aria-label={LANDING.header.navLabel} className="hidden items-center gap-6 md:flex">
          {LANDING.nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <Link
          href="/login"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
        >
          {LANDING.header.loginLabel}
        </Link>
      </div>
    </header>
  );
}
