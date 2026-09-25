import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import {
  getGetClientPanelQueryKey,
  usePublishClientPanel,
  useReplaceClientPanelItems,
  useUnpublishClientPanel,
  useUpdateClientPanel,
  type Panel,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useMaxUploadBytes } from '@/lib/upload-limit';
import { prepararImagemParaUpload } from '@/lib/image-para-renderizador';
import { parsePriceToCents } from '@/lib/price';
import { panelErrorInfo } from '@/lib/panel-error';
import { FlyerItemsTable, emptyFlyerItem, MAX_FLYER_ITEMS, type FlyerItemDraft } from './flyer-items-table';
import { FlyerDestinationField } from './flyer-destination-field';
import { StoreIdentityCard, type IdentityDraft } from './store-identity-card';
import { FlyerPreview } from './flyer-preview';

export type { FlyerItemDraft };
export { UNIT_SUGGESTIONS } from './flyer-items-table';

const centsToText = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2).replace('.', ','));

function toDraft(item: Panel['items'][number]): FlyerItemDraft {
  return {
    name: item.name,
    price: centsToText(item.priceCents),
    oldPrice: centsToText(item.oldPriceCents ?? null),
    unit: item.unit ?? '',
    featured: item.featured,
    imageUrl: item.imageUrl ?? null,
  };
}

export function draftsToItems(drafts: FlyerItemDraft[]) {
  const errors: Record<number, string> = {};
  const items = drafts.map((d, i) => {
    const price = parsePriceToCents(d.price);
    const old = d.oldPrice.trim() ? parsePriceToCents(d.oldPrice) : { ok: true, cents: 0 };
    if (!d.name.trim()) errors[i] = 'Informe o nome do produto.';
    else if (!price.ok) errors[i] = 'Preço inválido.';
    else if (!old.ok) errors[i] = 'Preço antigo inválido.';
    return {
      name: d.name.trim(),
      description: null,
      category: null,
      priceCents: price.cents,
      oldPriceCents: d.oldPrice.trim() ? old.cents : null,
      unit: d.unit.trim() || null,
      featured: d.featured,
      imageUrl: d.imageUrl,
    };
  });
  return Object.keys(errors).length > 0 ? ({ ok: false, errors } as const) : ({ ok: true, items } as const);
}

/**
 * Nunca rejeita: rede caindo no meio do upload (fetch ou res.json()) vira
 * `{ error }` como qualquer outra falha, em vez de derrubar o `await` de
 * quem chama — que, sem isso, pulava o `setUploadingIndex(null)` e travava
 * o input de foto até recarregar a página.
 */
async function uploadImage(panelId: number, file: File, maxBytes: number): Promise<{ url: string } | { error: string }> {
  let arquivo: File;
  try {
    arquivo = await prepararImagemParaUpload(file, maxBytes);
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : 'Não foi possível preparar a imagem.' };
  }
  const form = new FormData();
  form.append('image', arquivo);
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/portal/client/panels/${panelId}/image`, { method: 'POST', body: form });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: unknown };
      return { error: typeof body.error === 'string' ? body.error : 'Não foi possível enviar a imagem.' };
    }
    const { imageUrl } = (await res.json()) as { imageUrl: string };
    return { url: imageUrl };
  } catch {
    return { error: 'Não foi possível enviar a imagem. Confira sua conexão.' };
  }
}

export default function FlyerEditor({ panel, onBack }: { panel: Panel; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const maxUploadBytes = useMaxUploadBytes();
  const [name, setName] = useState(panel.name);
  const [headline, setHeadline] = useState(panel.headline ?? '');
  const [body, setBody] = useState(panel.body ?? '');
  const [duration, setDuration] = useState(panel.duration);
  const [campaignId, setCampaignId] = useState<number | null>(panel.campaignId ?? null);
  const [items, setItems] = useState<FlyerItemDraft[]>(panel.items.length ? panel.items.map(toDraft) : [emptyFlyerItem()]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [identity, setIdentity] = useState<IdentityDraft | null>(null);
  const [dirty, setDirty] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetClientPanelQueryKey(panel.id) });
  const updatePanel = useUpdateClientPanel();
  const replaceItems = useReplaceClientPanelItems();
  const publish = usePublishClientPanel({
    mutation: {
      onSuccess: () => { invalidate(); setDirty(false); toast({ title: 'Encarte publicado' }); },
      onError: (erro) => {
        const { message } = panelErrorInfo(erro);
        toast({ title: message ?? 'Não foi possível publicar o encarte', variant: 'destructive' });
      },
    },
  });
  const unpublish = useUnpublishClientPanel({
    mutation: {
      onSuccess: invalidate,
      onError: (erro) => {
        const { message } = panelErrorInfo(erro);
        toast({ title: message ?? 'Não foi possível tirar o encarte do ar', variant: 'destructive' });
      },
    },
  });

  const touch = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  function changeItem(index: number, patch: Partial<FlyerItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
    setErrors((prev) => { const next = { ...prev }; delete next[index]; return next; });
    setDirty(true);
  }

  function moveItem(index: number, delta: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row!);
      return next;
    });
    setDirty(true);
  }

  async function pickImage(index: number, file: File) {
    setUploadingIndex(index);
    try {
      const result = await uploadImage(panel.id, file, maxUploadBytes);
      if ('error' in result) toast({ title: result.error, variant: 'destructive' });
      else changeItem(index, { imageUrl: result.url });
    } finally {
      setUploadingIndex(null);
    }
  }

  async function save(): Promise<boolean> {
    const parsed = draftsToItems(items);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      toast({ title: 'Corrija os produtos marcados.', variant: 'destructive' });
      return false;
    }
    try {
      await updatePanel.mutateAsync({
        id: panel.id,
        data: { name: name.trim(), headline: headline.trim() || null, body: body.trim() || null, duration, campaignId },
      });
      await replaceItems.mutateAsync({ id: panel.id, data: { items: parsed.items } });
      await invalidate();
      toast({ title: 'Encarte salvo' });
      return true;
    } catch (erro) {
      const { message } = panelErrorInfo(erro);
      toast({ title: message ?? 'Não foi possível salvar o encarte', variant: 'destructive' });
      invalidate();
      return false;
    }
  }

  const previewItems = items
    .filter((d) => d.name.trim())
    .map((d) => {
      const price = parsePriceToCents(d.price);
      const old = d.oldPrice.trim() ? parsePriceToCents(d.oldPrice) : null;
      return {
        name: d.name.trim(),
        priceCents: price.ok ? price.cents : 0,
        oldPriceCents: old?.ok ? old.cents : null,
        imageUrl: d.imageUrl,
        unit: d.unit.trim() || null,
        featured: d.featured,
      };
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Button>
        <h1 className="text-xl font-semibold">{panel.name}</h1>
        {dirty && panel.status === 'published' ? <span className="text-sm text-amber-600">Alterações não publicadas</span> : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Encarte</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1"><Label htmlFor="flyer-name">Nome interno</Label><Input id="flyer-name" value={name} maxLength={80} onChange={(e) => touch(setName)(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="flyer-headline">Chamada</Label><Input id="flyer-headline" value={headline} maxLength={40} placeholder="OFERTAS" onChange={(e) => touch(setHeadline)(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="flyer-body">Aviso do rodapé</Label><Textarea id="flyer-body" rows={2} maxLength={160} value={body} placeholder="Ofertas válidas enquanto durarem os estoques." onChange={(e) => touch(setBody)(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="flyer-duration">Segundos por slide</Label><Input id="flyer-duration" type="number" min={5} max={60} value={duration} onChange={(e) => touch(setDuration)(Number(e.target.value))} /></div>
              <FlyerDestinationField panelId={panel.id} campaignId={campaignId} onChange={touch(setCampaignId)} />
            </CardContent>
          </Card>
          <StoreIdentityCard
            clientId={panel.clientId}
            onDraftChange={setIdentity}
            uploadLogo={async (file) => {
              const r = await uploadImage(panel.id, file, maxUploadBytes);
              if ('error' in r) { toast({ title: r.error, variant: 'destructive' }); return null; }
              return r.url;
            }}
          />
        </div>
        <FlyerPreview
          panelId={panel.id}
          payload={{
            campaignId,
            headline: headline.trim() || null,
            body: body.trim() || null,
            items: previewItems.slice(0, MAX_FLYER_ITEMS),
            identity: identity
              ? {
                  logoUrl: identity.logoUrl,
                  openingHours: identity.openingHours.trim() || null,
                  brandColor: /^#[0-9A-Fa-f]{6}$/.test(identity.brandColor) ? identity.brandColor : null,
                  brandAccentColor: /^#[0-9A-Fa-f]{6}$/.test(identity.brandAccentColor) ? identity.brandAccentColor : null,
                }
              : undefined,
          }}
        />
      </div>
      <Card>
        <CardHeader><CardTitle>Produtos</CardTitle></CardHeader>
        <CardContent>
          <FlyerItemsTable
            items={items}
            errors={errors}
            uploadingIndex={uploadingIndex}
            onChange={changeItem}
            onAdd={() => { setItems((p) => [...p, emptyFlyerItem()]); setDirty(true); }}
            onRemove={(i) => { setItems((p) => p.filter((_, j) => j !== i)); setDirty(true); }}
            onMove={moveItem}
            onPickImage={pickImage}
          />
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button onClick={() => void save()} disabled={updatePanel.isPending || replaceItems.isPending}>Salvar</Button>
        <Button
          variant="secondary"
          disabled={publish.isPending}
          onClick={async () => { if (await save()) publish.mutate({ id: panel.id }); }}
        >
          Publicar
        </Button>
        {panel.status === 'published' ? (
          <Button variant="outline" onClick={() => unpublish.mutate({ id: panel.id })}>Tirar do ar</Button>
        ) : null}
      </div>
    </div>
  );
}
