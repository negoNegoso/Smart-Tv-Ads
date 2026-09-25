import type { Panel } from '@workspace/api-client-react';

type Badge = { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' };

// Datas de campanha são dias guardados como meia-noite UTC; formatar em UTC
// (como o admin faz) evita mostrar o dia anterior no fuso de Brasília.
const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

/**
 * Situação do painel na lista. Para encarte em campanha, quem manda é a
 * campanha da última publicação: agendado, no ar ou encerrado pelas datas
 * dela — o encarte não tem datas próprias.
 */
export function panelStatusBadges(
  panel: Pick<Panel, 'status' | 'publishedAt' | 'artOutdated' | 'publishedCampaign'>,
  now: Date,
): Badge[] {
  if (panel.status !== 'published') return [{ label: 'Rascunho', variant: 'secondary' }];
  const badges: Badge[] = [];
  const c = panel.publishedCampaign;
  if (!c) {
    badges.push({ label: 'Na loja', variant: 'default' });
  } else if (!c.isActive || new Date(c.endsAt) < now) {
    badges.push({ label: `Encerrado em ${dayMonth(c.endsAt)}`, variant: 'outline' });
  } else if (new Date(c.startsAt) > now) {
    badges.push({ label: `Agendado — entra no ar ${dayMonth(c.startsAt)}`, variant: 'secondary' });
  } else {
    badges.push({ label: `No ar até ${dayMonth(c.endsAt)}`, variant: 'default' });
  }
  if (panel.artOutdated) badges.push({ label: 'Arte desatualizada', variant: 'destructive' });
  return badges;
}
