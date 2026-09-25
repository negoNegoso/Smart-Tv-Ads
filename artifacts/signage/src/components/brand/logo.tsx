import { cn } from '@/lib/utils';
import {
  LOGO_VIEWBOX,
  MARK_VIEWBOX,
  PATH_PLAY,
  PATH_SMART,
  PATH_TELA,
  PATH_TV,
  PATH_VALE,
  PLAY_STROKE_WIDTH,
  TELA_STROKE_WIDTH,
} from './logo-paths';

const TEAL = 'hsl(var(--primary))';

/**
 * Logo da Smart Vale TV em SVG inline: sem request extra e sem depender de
 * fonte. As partes brancas seguem `currentColor` e as teal seguem o token
 * primary — é isso que deixa o mesmo logo branco+teal na tela escura e
 * preto+teal escuro no relatório impresso, sem uma segunda versão.
 */
export function Logo({ variant = 'full', className }: { variant?: 'full' | 'mark'; className?: string }) {
  const full = variant === 'full';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={full ? LOGO_VIEWBOX : MARK_VIEWBOX}
      role="img"
      aria-label="Smart Vale TV"
      className={cn(full ? 'h-8 w-auto' : 'h-8 w-8', 'shrink-0', className)}
    >
      {full ? (
        <>
          <path d={PATH_SMART} fill="currentColor" />
          <path d={PATH_VALE} fill={TEAL} />
          <path d={PATH_TV} fill="currentColor" />
        </>
      ) : null}
      {/* A moldura é contorno + furo; o traço redondo arredonda os cantos. */}
      <path d={PATH_TELA} fill={TEAL} stroke={TEAL} strokeWidth={TELA_STROKE_WIDTH} strokeLinejoin="round" />
      <path d={PATH_PLAY} fill={TEAL} stroke={TEAL} strokeWidth={PLAY_STROKE_WIDTH} strokeLinejoin="round" />
    </svg>
  );
}
