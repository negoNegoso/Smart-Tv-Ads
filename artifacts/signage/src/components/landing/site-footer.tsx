import { Link } from 'wouter';
import { BRAND, LANDING, WHATSAPP_NUMBER, whatsappUrl } from '@/lib/landing-content';

function prettyPhone(raw: string): string {
  // 5513997478695 → (13) 99747-8695
  const national = raw.replace(/^55/, '');
  return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
}

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-zinc-900">{BRAND}</p>
          <p className="mt-1 max-w-sm text-sm text-zinc-600">{LANDING.footer.tagline}</p>
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
          <Link href="/login" className="text-zinc-600 hover:text-zinc-900">
            {LANDING.footer.loginLabel}
          </Link>
        </div>
      </div>
    </footer>
  );
}
