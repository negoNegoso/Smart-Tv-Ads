import { cn } from '@/lib/utils';

/**
 * Segunda implementação do visual do quadro — não é o que vai ao ar. O
 * servidor (`artifacts/api-server/src/lib/panels/templates.ts`) desenha o
 * PNG de verdade com satori; esta prévia só ajuda o lojista a ver, antes de
 * publicar, se o texto cabe e onde a paginação corta. As cores abaixo
 * espelham `COLORS` de lá; o layout é aproximado, não pixel a pixel.
 */
const COLORS = {
  background: '#0B1120',
  surface: '#111C33',
  text: '#F8FAFC',
  muted: '#94A3B8',
  accent: '#FBBF24',
};

export interface PanelPreviewItem {
  name: string;
  description: string | null;
  priceCents: number;
  oldPriceCents: number | null;
  category: string | null;
  imageUrl: string | null;
}

export interface PanelPreviewProps {
  kind: 'menu' | 'promo' | 'notice';
  headline: string | null;
  body: string | null;
  items: PanelPreviewItem[];
  page: number;
}

/**
 * Preço em real a partir de centavos inteiros — mesma regra do servidor
 * (`format.ts`): o Intl às vezes emite espaço não separável entre "R$" e o
 * valor; trocamos por espaço comum para o texto ficar previsível.
 */
function formatPriceBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(cents / 100)
    .replace(/[  ]/g, ' ');
}

function MenuPreview({ items, page }: { items: PanelPreviewItem[]; page: number }) {
  const category = items[0]?.category ?? null;
  return (
    <div className="flex h-full w-full flex-col">
      {category ? (
        <div
          className="mb-3 shrink-0 text-[3.5cqw] uppercase tracking-[0.2em]"
          style={{ color: COLORS.muted }}
        >
          {category}
        </div>
      ) : null}
      {/* Centrado como no servidor (`templates.ts`): a paginação por orçamento
          quase nunca enche a página exata, e a sobra vira margem simétrica em
          vez de um vazio embaixo do último item. */}
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex items-baseline justify-between gap-4 py-1.5"
            style={{ borderBottom: `1px solid ${COLORS.surface}` }}
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[3.5cqw] font-bold">{item.name}</span>
              {item.description ? (
                <span className="truncate text-[2cqw]" style={{ color: COLORS.muted }}>
                  {item.description}
                </span>
              ) : null}
            </div>
            <span className="shrink-0 text-[4cqw] font-bold" style={{ color: COLORS.accent }}>
              {formatPriceBRL(item.priceCents)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 shrink-0 self-end text-[2cqw]" style={{ color: COLORS.muted }}>
        Página {page}
      </div>
    </div>
  );
}

function PromoPreview({
  headline,
  body,
  item,
}: {
  headline: string | null;
  body: string | null;
  item: PanelPreviewItem | undefined;
}) {
  return (
    <div className="flex h-full w-full flex-col">
      <div
        className="shrink-0 text-[3cqw] uppercase tracking-[0.2em]"
        style={{ color: COLORS.accent }}
      >
        {headline ?? 'PROMOÇÃO'}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-between gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="truncate text-[6cqw] font-bold leading-tight">{item?.name ?? ''}</div>
          {body ? (
            <div className="line-clamp-2 text-[2.5cqw]" style={{ color: COLORS.muted }}>
              {body}
            </div>
          ) : null}
          <div className="flex items-baseline gap-4">
            {item?.oldPriceCents ? (
              <span
                className="line-through text-[3.2cqw]"
                style={{ color: COLORS.muted }}
              >
                {formatPriceBRL(item.oldPriceCents)}
              </span>
            ) : null}
            <span className="text-[8cqw] font-bold" style={{ color: COLORS.accent }}>
              {formatPriceBRL(item?.priceCents ?? 0)}
            </span>
          </div>
        </div>
        {item?.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            className="aspect-square w-[35%] shrink-0 rounded-2xl object-cover"
          />
        ) : null}
      </div>
    </div>
  );
}

function NoticePreview({ headline, body }: { headline: string | null; body: string | null }) {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-4">
      <div className="text-[6cqw] font-bold leading-tight">{headline ?? ''}</div>
      {body ? (
        <div className="text-[3cqw]" style={{ color: COLORS.muted }}>
          {body}
        </div>
      ) : null}
    </div>
  );
}

export function PanelPreview({ kind, headline, body, items, page }: PanelPreviewProps) {
  return (
    <div
      className={cn('aspect-[16/9] w-full overflow-hidden rounded-lg p-[4%]')}
      style={{
        backgroundColor: COLORS.background,
        color: COLORS.text,
        containerType: 'inline-size',
      }}
    >
      {kind === 'menu' ? <MenuPreview items={items} page={page} /> : null}
      {kind === 'promo' ? <PromoPreview headline={headline} body={body} item={items[0]} /> : null}
      {kind === 'notice' ? <NoticePreview headline={headline} body={body} /> : null}
    </div>
  );
}
