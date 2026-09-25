import { useListClientPanelCampaignOptions } from '@workspace/api-client-react';
import { Label } from '@/components/ui/label';

// Datas de campanha são dias guardados como meia-noite UTC; em UTC (como no
// admin) o período sai no próprio dia, e não um dia antes como em Brasília.
const period = (a: string, b: string) => {
  const f = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  return `${f(a)} a ${f(b)}`;
};

interface Props {
  panelId: number;
  campaignId: number | null;
  onChange: (campaignId: number | null) => void;
}

/**
 * Onde o encarte vai ao ar. Campanha só da mesma empresa (o servidor confere
 * de novo): datas, dias e alvo passam a ser os dela.
 */
export function FlyerDestinationField({ panelId, campaignId, onChange }: Props) {
  const options = useListClientPanelCampaignOptions(panelId);
  const list = options.data ?? [];
  const hasOptions = list.length > 0;
  const mode = campaignId === null ? 'store' : 'campaign';
  // A lista só traz campanha ativa e não encerrada. Se a salva sumiu dela
  // (terminou ou foi desativada), o select mostraria outra campanha como se
  // fosse o destino; em vez disso fica selecionada uma opção desabilitada que
  // diz o que houve, e o servidor recusa publicar nela.
  const savedIsClosed = campaignId !== null && options.data !== undefined && !list.some((c) => c.id === campaignId);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Onde vai ao ar</legend>
      <label className="flex items-center gap-2">
        <input type="radio" name="flyer-destination" checked={mode === 'store'} onChange={() => onChange(null)} />
        TVs da loja <span className="text-muted-foreground">(até você tirar do ar)</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name="flyer-destination"
          aria-label="Campanha"
          disabled={!hasOptions}
          checked={mode === 'campaign'}
          onChange={() => hasOptions && onChange(list[0]!.id)}
        />
        Campanha <span className="text-muted-foreground">(datas, dias e TVs da campanha)</span>
      </label>
      {!hasOptions && !options.isLoading ? (
        <p className="text-xs text-muted-foreground">Nenhuma campanha desta empresa em andamento ou agendada. Peça ao admin para criar uma.</p>
      ) : null}
      {mode === 'campaign' ? (
        <div className="space-y-1">
          <Label htmlFor="flyer-campaign">Campanha</Label>
          <select
            id="flyer-campaign"
            className="w-full rounded border px-2 py-1"
            value={campaignId ?? ''}
            onChange={(e) => onChange(Number(e.target.value))}
          >
            {savedIsClosed ? (
              <option value={campaignId} disabled>
                Campanha escolhida (encerrada)
              </option>
            ) : null}
            {list.map((c) => (
              <option key={c.id} value={c.id}>{`${c.name} — ${period(c.startsAt, c.endsAt)}`}</option>
            ))}
          </select>
        </div>
      ) : null}
    </fieldset>
  );
}
