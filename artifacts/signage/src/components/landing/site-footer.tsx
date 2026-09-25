import { Link } from 'wouter';
import { Logo } from '@/components/brand/logo';
import { LANDING, WHATSAPP_NUMBER, whatsappUrl } from '@/lib/landing-content';

function prettyPhone(raw: string): string {
  // 5513997478695 → (13) 99747-8695
  const national = raw.replace(/^55/, '');
  return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Logo className="h-8 text-foreground" />
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{LANDING.footer.tagline}</p>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <a
            href={whatsappUrl(LANDING.footer.whatsappMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            WhatsApp {prettyPhone(WHATSAPP_NUMBER)}
          </a>
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            {LANDING.footer.loginLabel}
          </Link>
        </div>
      </div>
    </footer>
  );
}
