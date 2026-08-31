import { MonitorPlay } from 'lucide-react';
import { Link } from 'wouter';
import { BRAND, LANDING } from '@/lib/landing-content';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <span className="flex items-center gap-2 font-semibold tracking-tight text-primary">
          <MonitorPlay className="h-5 w-5" aria-hidden="true" />
          {BRAND}
        </span>

        <nav aria-label={LANDING.header.navLabel} className="hidden items-center gap-6 md:flex">
          {LANDING.nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-zinc-600 transition-colors hover:text-zinc-900"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <Link
          href="/login"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
        >
          {LANDING.header.loginLabel}
        </Link>
      </div>
    </header>
  );
}
