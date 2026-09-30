import { VALE_MUNICIPIOS, VALE_VIEW_BOX } from '@/lib/mapa-vale';

export interface MapaValeProps {
  parceiras: ReadonlySet<string>;
  ativa?: string | null;
  onSelecionar?: (ibge: string) => void;
  className?: string;
}

/**
 * Mapa dos 24 municípios do Vale do Ribeira.
 *
 * Saiu de dentro da seção Cobertura para a apresentação comercial usar o
 * mesmo desenho: duas cópias do SVG divergiriam na primeira troca de cor.
 *
 * É decoração (aria-hidden): quem precisa de seleção acessível põe uma lista
 * de botões ao lado, como a landing faz. Sem `onSelecionar`, nenhuma cidade
 * captura o ponteiro — no slide o toque atravessa o mapa e troca de slide.
 */
export function MapaVale({ parceiras, ativa = null, onSelecionar, className }: MapaValeProps) {
  return (
    <svg viewBox={VALE_VIEW_BOX} className={className} aria-hidden="true">
      {VALE_MUNICIPIOS.map((municipio) => {
        const temParceiro = parceiras.has(municipio.ibge);
        const clicavel = temParceiro && onSelecionar !== undefined;
        return (
          <path
            key={municipio.ibge}
            data-ibge={municipio.ibge}
            d={municipio.path}
            fill={
              municipio.ibge === ativa
                ? 'hsl(var(--primary))'
                : temParceiro
                  ? 'hsl(var(--primary) / 0.35)'
                  : 'hsl(var(--muted-foreground) / 0.3)'
            }
            stroke="hsl(var(--background))"
            strokeWidth={1.5}
            style={{ pointerEvents: clicavel ? 'auto' : 'none', cursor: clicavel ? 'pointer' : 'default' }}
            onClick={clicavel ? () => onSelecionar(municipio.ibge) : undefined}
          />
        );
      })}
    </svg>
  );
}
