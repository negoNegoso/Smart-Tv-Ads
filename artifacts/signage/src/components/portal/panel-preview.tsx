import { cn } from '@/lib/utils';
import {
  PROMO_PHOTO_LEFT,
  PROMO_SPLIT_BOTTOM,
  discountPercent,
  promoBackgroundSvg,
  promoBadgeMetrics,
  promoBadgeSvg,
  promoPalette,
  resolvePromoStyle,
} from '@/lib/promo-visual';

/**
 * Segunda implementação do visual do quadro — não é o que vai ao ar. O
 * servidor (`artifacts/api-server/src/lib/panels/templates.ts`) desenha o
 * PNG de verdade com satori; esta prévia só ajuda o lojista a ver, antes de
 * publicar, se o texto cabe e onde a paginação corta. A promoção agora
 * espelha `promoNode` por `px()` (quase pixel a pixel, cores incluídas);
 * menu e aviso continuam aproximados, com as cores de `COLORS` abaixo.
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
  accentColor?: string | null;
  promoStyle?: string | null;
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

/** Pixel do quadro 1920×1080 em unidade do container: 1920px = 100cqw. */
const px = (value: number) => `${(value / 1920) * 100}cqw`;

const svgSrc = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/** "R$ 8,99" → ["R$", "8,99"], mesma regra do servidor. */
function splitCurrency(formatted: string): [string, string] {
  const space = formatted.indexOf(' ');
  return [formatted.slice(0, space), formatted.slice(space + 1)];
}

function PromoPreview({
  headline,
  body,
  item,
  accentColor,
  promoStyle,
}: {
  headline: string | null;
  body: string | null;
  item: PanelPreviewItem | undefined;
  accentColor: string | null;
  promoStyle: string | null;
}) {
  // Mesmas posições e tamanhos de `promoNode` em templates.ts, convertidos por px().
  const palette = promoPalette(accentColor);
  const style = resolvePromoStyle(promoStyle, item);
  const photo = item?.imageUrl ?? null;
  const badgeText = (headline ?? 'PROMOÇÃO').toUpperCase();
  const badge = promoBadgeMetrics(badgeText);
  const priceCents = item?.priceCents ?? 0;
  const oldPriceCents = item?.oldPriceCents ?? null;
  const [currency, amount] = splitCurrency(formatPriceBRL(priceCents));

  return (
    <div
      className="relative h-full w-full overflow-hidden font-bold"
      style={{ backgroundColor: '#F1F1F3', color: palette.text, fontFamily: 'Fredoka, sans-serif' }}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          className="absolute top-0 h-full object-cover"
          style={{ left: px(PROMO_PHOTO_LEFT), width: px(1920 - PROMO_PHOTO_LEFT) }}
        />
      ) : null}
      <img
        data-promo-background
        src={svgSrc(promoBackgroundSvg({ color: palette.panel, ornament: palette.text, hasImage: Boolean(photo) }))}
        alt=""
        className="absolute inset-0 h-full w-full"
      />
      <div
        className="absolute flex flex-col"
        style={{ left: px(80), top: px(310), width: px(photo ? PROMO_SPLIT_BOTTOM - 160 : 1400) }}
      >
        <div
          className="relative flex items-center justify-center"
          style={{ width: px(badge.width), height: px(badge.height) }}
        >
          <img
            src={svgSrc(promoBadgeSvg({ width: badge.width, height: badge.height, stroke: palette.text }))}
            alt=""
            className="absolute inset-0 h-full w-full"
          />
          <span style={{ fontSize: px(badge.fontSize) }}>{badgeText}</span>
        </div>
        <div className="truncate" style={{ fontSize: px(52), marginTop: px(24) }}>
          {(item?.name ?? '').toUpperCase()}
        </div>
        {style === 'percent' && oldPriceCents !== null ? (
          <>
            <div className="flex items-baseline" style={{ color: palette.price, marginTop: px(8) }}>
              <span style={{ fontSize: px(200), lineHeight: 1 }}>{`${discountPercent(oldPriceCents, priceCents)}%`}</span>
              <span style={{ fontSize: px(72), marginLeft: px(16) }}>OFF</span>
            </div>
            <div style={{ fontSize: px(40) }}>
              {`DE ${formatPriceBRL(oldPriceCents)} POR ${formatPriceBRL(priceCents)}`}
            </div>
          </>
        ) : (
          <>
            {/* Preço antigo zerado ou sem desconto de verdade não vira DE/POR, mesma regra do servidor. */}
            {oldPriceCents !== null && oldPriceCents > priceCents ? (
              <div className="flex items-baseline" style={{ marginTop: px(24) }}>
                <span style={{ fontSize: px(36) }}>DE</span>
                <span style={{ fontSize: px(52), margin: `0 ${px(16)}` }}>
                  {splitCurrency(formatPriceBRL(oldPriceCents))[1]}
                </span>
                <span style={{ fontSize: px(36) }}>POR</span>
              </div>
            ) : null}
            <div className="flex items-baseline" style={{ color: palette.price }}>
              <span style={{ fontSize: px(52), marginRight: px(12) }}>{currency}</span>
              <span style={{ fontSize: px(amount.length > 6 ? 130 : 170), lineHeight: 1 }}>{amount}</span>
            </div>
          </>
        )}
        {body ? (
          <div className="line-clamp-2" style={{ fontSize: px(38), lineHeight: 1.2, marginTop: px(16), color: palette.price }}>
            {body}
          </div>
        ) : null}
      </div>
      {photo ? (
        <div className="absolute" style={{ right: px(80), bottom: px(40), fontSize: px(32), color: '#3A2A4A' }}>
          *imagens meramente ilustrativas
        </div>
      ) : null}
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

export function PanelPreview({
  kind,
  headline,
  body,
  items,
  page,
  accentColor = null,
  promoStyle = null,
}: PanelPreviewProps) {
  return (
    <div
      className={cn('aspect-[16/9] w-full overflow-hidden rounded-lg', kind === 'promo' ? null : 'p-[4%]')}
      style={{
        backgroundColor: COLORS.background,
        color: COLORS.text,
        containerType: 'inline-size',
      }}
    >
      {kind === 'menu' ? <MenuPreview items={items} page={page} /> : null}
      {kind === 'promo' ? (
        <PromoPreview headline={headline} body={body} item={items[0]} accentColor={accentColor} promoStyle={promoStyle} />
      ) : null}
      {kind === 'notice' ? <NoticePreview headline={headline} body={body} /> : null}
    </div>
  );
}
