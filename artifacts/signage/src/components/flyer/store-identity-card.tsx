import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetClientStoreIdentityQueryKey,
  useGetClientStoreIdentity,
  useUpdateClientStoreIdentity,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_BACKGROUND = '#0B6B3A';
const DEFAULT_BAND = '#FFC20E';

export interface IdentityDraft {
  logoUrl: string | null;
  openingHours: string;
  brandColor: string;
  brandAccentColor: string;
}

interface Props {
  clientId: number;
  /** Mudanças ainda não salvas vão para a prévia na hora. */
  onDraftChange: (draft: IdentityDraft) => void;
  uploadLogo: (file: File) => Promise<string | null>;
}

function ColorField({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-end gap-2">
      <input type="color" aria-label={label} value={HEX.test(value) ? value : fallback} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      <div className="flex-1 space-y-1">
        <Label htmlFor={`${label}-hex`}>{`${label} (hex)`}</Label>
        <Input id={`${label}-hex`} value={value} placeholder={fallback} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

export function StoreIdentityCard({ clientId, onDraftChange, uploadLogo }: Props) {
  const [open, setOpen] = useState(false);
  const identity = useGetClientStoreIdentity(clientId);
  const update = useUpdateClientStoreIdentity();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<IdentityDraft>({ logoUrl: null, openingHours: '', brandColor: '', brandAccentColor: '' });

  useEffect(() => {
    if (!identity.data) return;
    const d = {
      logoUrl: identity.data.logoUrl ?? null,
      openingHours: identity.data.openingHours ?? '',
      brandColor: identity.data.brandColor ?? '',
      brandAccentColor: identity.data.brandAccentColor ?? '',
    };
    setDraft(d);
    onDraftChange(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.data]);

  const change = (patch: Partial<IdentityDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onDraftChange(next);
  };

  const colorsValid = [draft.brandColor, draft.brandAccentColor].every((c) => c === '' || HEX.test(c));

  function save() {
    update.mutate(
      {
        clientId,
        data: {
          logoUrl: draft.logoUrl,
          openingHours: draft.openingHours.trim() || null,
          brandColor: draft.brandColor || null,
          brandAccentColor: draft.brandAccentColor || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetClientStoreIdentityQueryKey(clientId) });
          toast({ title: 'Identidade da loja salva' });
        },
        onError: () => toast({ title: 'Não foi possível salvar a identidade da loja', variant: 'destructive' }),
      },
    );
  }

  return (
    <div className="rounded border">
      <button type="button" className="w-full px-4 py-3 text-left font-medium" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Identidade da loja
      </button>
      {open ? (
        <div className="space-y-4 border-t p-4">
          <p className="text-sm text-muted-foreground">Vale para todos os encartes da loja.</p>
          <div className="space-y-1">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {draft.logoUrl ? <img src={draft.logoUrl} alt="Logo" className="h-12 max-w-40 object-contain" /> : null}
              <input
                type="file"
                accept="image/*"
                aria-label="Enviar logo"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const url = await uploadLogo(file);
                  if (url) change({ logoUrl: url });
                }}
              />
              {draft.logoUrl ? <Button type="button" variant="ghost" onClick={() => change({ logoUrl: null })}>Remover</Button> : null}
            </div>
          </div>
          <ColorField label="Cor de fundo" value={draft.brandColor} fallback={DEFAULT_BACKGROUND} onChange={(v) => change({ brandColor: v })} />
          <ColorField label="Cor da faixa de destaque" value={draft.brandAccentColor} fallback={DEFAULT_BAND} onChange={(v) => change({ brandAccentColor: v })} />
          {!colorsValid ? <p className="text-xs text-destructive">Use cores no formato #RRGGBB.</p> : null}
          <div className="space-y-1">
            <Label htmlFor="opening-hours">Horário de funcionamento</Label>
            <Textarea id="opening-hours" rows={2} maxLength={120} value={draft.openingHours} onChange={(e) => change({ openingHours: e.target.value })} />
          </div>
          <div className="space-y-1 text-sm">
            <span className="font-medium">Endereço: </span>
            {identity.data?.address ?? 'não cadastrado'} <span className="text-muted-foreground">(muda no cadastro da empresa)</span>
          </div>
          <Button type="button" onClick={save} disabled={!colorsValid || update.isPending}>Salvar identidade</Button>
        </div>
      ) : null}
    </div>
  );
}
