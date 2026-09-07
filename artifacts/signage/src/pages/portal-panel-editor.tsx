import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, ImagePlus, Plus, Trash2 } from 'lucide-react';
import {
  useGetClientPanel,
  useUpdateClientPanel,
  useReplaceClientPanelItems,
  usePublishClientPanel,
  useUnpublishClientPanel,
  getGetClientPanelQueryKey,
  type PanelItem,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { PanelPreview, type PanelPreviewItem } from '@/components/portal/panel-preview';
import { useToast } from '@/hooks/use-toast';
import { useMaxUploadBytes, formatUploadLimit } from '@/lib/upload-limit';

/**
 * Espelha `MENU_ITEMS_PER_PAGE` de `artifacts/api-server/src/lib/panels/paginate.ts`.
 * O signage não depende do pacote do servidor, então o número — e a regra de
 * agrupar por categoria — é reimplementado aqui só para a navegação da prévia.
 * Quem decide o que realmente cabe na tela é sempre o PNG do servidor.
 */
const MENU_ITEMS_PER_PAGE = 8;

interface ItemDraft {
  name: string;
  description: string;
  priceText: string;
  oldPriceText: string;
  category: string;
  imageUrl: string | null;
}

function centsToInputText(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * Preço digitado em texto pt-BR vira centavos inteiros: remove tudo que não é
 * dígito e lê a string resultante como o total de centavos — "12,90" e
 * "1290" chegam à mesma string de dígitos ("1290") e viram 1290. Nunca
 * introduz float.
 */
function parsePriceToCents(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return 0;
  return parseInt(digits, 10);
}

function itemToDraft(item: PanelItem): ItemDraft {
  return {
    name: item.name,
    description: item.description ?? '',
    priceText: centsToInputText(item.priceCents),
    oldPriceText: item.oldPriceCents != null ? centsToInputText(item.oldPriceCents) : '',
    category: item.category ?? '',
    imageUrl: item.imageUrl ?? null,
  };
}

function emptyDraft(): ItemDraft {
  return { name: '', description: '', priceText: '', oldPriceText: '', category: '', imageUrl: null };
}

function draftToPreviewItem(draft: ItemDraft): PanelPreviewItem {
  return {
    name: draft.name,
    description: draft.description.trim() === '' ? null : draft.description,
    priceCents: parsePriceToCents(draft.priceText),
    oldPriceCents: draft.oldPriceText.trim() === '' ? null : parsePriceToCents(draft.oldPriceText),
    category: draft.category.trim() === '' ? null : draft.category,
    imageUrl: draft.imageUrl,
  };
}

/** Mesma regra de `paginateMenuItems`: uma categoria por tela, em blocos de MENU_ITEMS_PER_PAGE. */
function paginateMenuDrafts(items: ItemDraft[]): ItemDraft[][] {
  const groups: ItemDraft[][] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last[0].category === item.category) last.push(item);
    else groups.push([item]);
  }
  const pages: ItemDraft[][] = [];
  for (const group of groups) {
    for (let start = 0; start < group.length; start += MENU_ITEMS_PER_PAGE) {
      pages.push(group.slice(start, start + MENU_ITEMS_PER_PAGE));
    }
  }
  return pages;
}

/**
 * A biblioteca gerada não exporta a classe `ApiError` (só o tipo `ErrorType`,
 * apagado em tempo de execução), então o 422 é detectado por forma — mesma
 * técnica usada em portal-panels.tsx.
 */
function publishErrorInfo(error: unknown): { is422: boolean; message?: string } {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return { is422: false };
  }
  const status = (error as { status: unknown }).status;
  const data = 'data' in error ? (error as { data: unknown }).data : undefined;
  const message =
    data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
      ? (data as { error: string }).error
      : undefined;
  return { is422: status === 422, message };
}

export default function PortalPanelEditor({
  panelId,
  onBack,
}: {
  panelId: number;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const maxUploadBytes = useMaxUploadBytes();

  const panelQuery = useGetClientPanel(panelId);
  const panel = panelQuery.data;

  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [duration, setDuration] = useState(10);
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [previewPage, setPreviewPage] = useState(0);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Carrega o estado local do formulário a partir do painel vindo do servidor
  // uma única vez por painel — depois disso o formulário é a fonte da
  // verdade até o próximo Salvar, para não sobrescrever o que o lojista está
  // digitando a cada refetch do react-query.
  useEffect(() => {
    if (panel && panel.id !== loadedId) {
      setName(panel.name);
      setDuration(panel.duration);
      setHeadline(panel.headline ?? '');
      setBody(panel.body ?? '');
      const drafts = panel.items.map(itemToDraft);
      setItems(panel.kind === 'promo' && drafts.length === 0 ? [emptyDraft()] : drafts);
      setLoadedId(panel.id);
      setPreviewPage(0);
    }
  }, [panel, loadedId]);

  const menuPages = paginateMenuDrafts(items);
  useEffect(() => {
    setPreviewPage((p) => Math.min(p, Math.max(0, menuPages.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const invalidatePanel = () =>
    queryClient.invalidateQueries({ queryKey: getGetClientPanelQueryKey(panelId) });

  const updatePanel = useUpdateClientPanel();
  const replaceItems = useReplaceClientPanelItems();

  const publishPanel = usePublishClientPanel({
    mutation: {
      onSuccess: () => {
        invalidatePanel();
        toast({ title: 'Painel publicado' });
      },
      onError: (error) => {
        const { is422, message } = publishErrorInfo(error);
        toast({
          title: is422 && message ? message : 'Não foi possível publicar o painel',
          variant: 'destructive',
        });
      },
    },
  });

  const unpublishPanel = useUnpublishClientPanel({
    mutation: {
      onSuccess: () => invalidatePanel(),
      onError: () => toast({ title: 'Não foi possível tirar o painel do ar', variant: 'destructive' }),
    },
  });

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyDraft()]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function moveItem(index: number, direction: -1 | 1) {
    setItems((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const isSaving = updatePanel.isPending || replaceItems.isPending;

  async function handleSave() {
    try {
      await updatePanel.mutateAsync({
        id: panelId,
        data: {
          name,
          duration,
          headline: headline.trim() === '' ? null : headline,
          body: body.trim() === '' ? null : body,
        },
      });
      await replaceItems.mutateAsync({
        id: panelId,
        data: {
          items: items
            .filter((it) => it.name.trim() !== '')
            .map((it) => ({
              name: it.name,
              description: it.description.trim() === '' ? null : it.description,
              priceCents: parsePriceToCents(it.priceText),
              oldPriceCents: it.oldPriceText.trim() === '' ? null : parsePriceToCents(it.oldPriceText),
              category: it.category.trim() === '' ? null : it.category,
              imageUrl: it.imageUrl,
            })),
        },
      });
      invalidatePanel();
      toast({ title: 'Alterações salvas' });
    } catch {
      toast({ title: 'Não foi possível salvar as alterações', variant: 'destructive' });
    }
  }

  async function handleImageSelected(file: File) {
    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`${import.meta.env.BASE_URL}api/portal/client/panels/${panelId}/image`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        const message =
          errorBody && typeof errorBody === 'object' && typeof (errorBody as { error?: unknown }).error === 'string'
            ? (errorBody as { error: string }).error
            : 'Não foi possível enviar a imagem.';
        toast({ title: message, variant: 'destructive' });
        return;
      }
      const { imageUrl } = (await res.json()) as { imageUrl: string };
      if (items.length === 0) {
        setItems([{ ...emptyDraft(), imageUrl }]);
      } else {
        updateItem(0, { imageUrl });
      }
    } catch {
      toast({ title: 'Não foi possível enviar a imagem.', variant: 'destructive' });
    } finally {
      setIsUploadingImage(false);
    }
  }

  if (panelQuery.isLoading) {
    return (
      <div>
        <Skeleton className="mb-4 h-8 w-24" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (panelQuery.isError || !panel) {
    return (
      <div>
        <Button variant="ghost" size="sm" className="mb-4" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar
        </Button>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Não foi possível carregar este painel</EmptyTitle>
            <EmptyDescription>O servidor não respondeu. Tente de novo.</EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => panelQuery.refetch()}>Tentar de novo</Button>
        </Empty>
      </div>
    );
  }

  const kind = panel.kind;
  const isPublished = panel.status === 'published';
  const previewItems: PanelPreviewItem[] =
    kind === 'menu'
      ? (menuPages[previewPage] ?? []).map(draftToPreviewItem)
      : kind === 'promo'
        ? items.slice(0, 1).map(draftToPreviewItem)
        : [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar
        </Button>
        <div className="flex flex-wrap gap-2">
          {isPublished ? (
            <Button
              variant="outline"
              onClick={() => unpublishPanel.mutate({ id: panelId })}
              disabled={unpublishPanel.isPending}
            >
              Tirar do ar
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => publishPanel.mutate({ id: panelId })}
              disabled={publishPanel.isPending}
            >
              Publicar
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving}>
            Salvar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Dados do painel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="panel-name">Nome</Label>
                <Input id="panel-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="panel-duration">Duração na tela (segundos)</Label>
                <Input
                  id="panel-duration"
                  type="number"
                  min={5}
                  max={60}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </div>

              {kind === 'notice' ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="panel-headline">Manchete</Label>
                    <Input
                      id="panel-headline"
                      placeholder="Ex.: Aceitamos Pix"
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      maxLength={80}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="panel-body">Corpo</Label>
                    <Textarea
                      id="panel-body"
                      placeholder="Ex.: Chave no balcão"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      maxLength={300}
                    />
                  </div>
                </>
              ) : null}

              {kind === 'promo' ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="panel-headline">Manchete</Label>
                    <Input
                      id="panel-headline"
                      placeholder="PROMOÇÃO"
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      maxLength={80}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="item-name-0">Nome</Label>
                    <Input
                      id="item-name-0"
                      placeholder="Nome do item"
                      value={items[0]?.name ?? ''}
                      onChange={(e) => updateItem(0, { name: e.target.value })}
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="panel-body">Descrição</Label>
                    <Textarea
                      id="panel-body"
                      placeholder="Descrição da promoção"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      maxLength={300}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="item-price-0">Preço</Label>
                      <Input
                        id="item-price-0"
                        placeholder="Preço"
                        inputMode="numeric"
                        value={items[0]?.priceText ?? ''}
                        onChange={(e) => updateItem(0, { priceText: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="item-old-price-0">Preço antigo</Label>
                      <Input
                        id="item-old-price-0"
                        placeholder="Preço antigo"
                        inputMode="numeric"
                        value={items[0]?.oldPriceText ?? ''}
                        onChange={(e) => updateItem(0, { oldPriceText: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="item-image-0">Foto</Label>
                    <input
                      id="item-image-0"
                      type="file"
                      accept="image/*"
                      disabled={isUploadingImage}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleImageSelected(file);
                        e.target.value = '';
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent text-sm file:mr-3 file:h-full file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium"
                    />
                    <p className="text-xs text-muted-foreground">
                      Tamanho máximo: {formatUploadLimit(maxUploadBytes)}.
                    </p>
                    {items[0]?.imageUrl ? (
                      <img
                        src={items[0].imageUrl}
                        alt="Foto enviada"
                        className="mt-2 h-32 w-32 rounded-lg object-cover"
                      />
                    ) : null}
                  </div>
                </>
              ) : null}

              {kind === 'menu' ? (
                <div className="space-y-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Preço</TableHead>
                        <TableHead className="w-0">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Input
                              placeholder="Nome do item"
                              value={item.name}
                              onChange={(e) => updateItem(index, { name: e.target.value })}
                              maxLength={120}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="Categoria"
                              value={item.category}
                              onChange={(e) => updateItem(index, { category: e.target.value })}
                              maxLength={60}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="Preço"
                              inputMode="numeric"
                              value={item.priceText}
                              onChange={(e) => updateItem(index, { priceText: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Mover para cima"
                                disabled={index === 0}
                                onClick={() => moveItem(index, -1)}
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Mover para baixo"
                                disabled={index === items.length - 1}
                                onClick={() => moveItem(index, 1)}
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Remover item"
                                onClick={() => removeItem(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Button variant="outline" size="sm" onClick={addItem}>
                    <Plus className="mr-1 h-4 w-4" />
                    Adicionar item
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div>
          <PanelPreview
            kind={kind}
            headline={headline.trim() === '' ? null : headline}
            body={body.trim() === '' ? null : body}
            items={previewItems}
            page={previewPage + 1}
          />
          {kind === 'menu' && menuPages.length > 1 ? (
            <div className="mt-3 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={previewPage === 0}
                onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {previewPage + 1} de {menuPages.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={previewPage === menuPages.length - 1}
                onClick={() => setPreviewPage((p) => Math.min(menuPages.length - 1, p + 1))}
              >
                Próxima
              </Button>
            </div>
          ) : null}
          {kind === 'promo' && !items[0]?.imageUrl ? (
            <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
              <ImagePlus className="h-3.5 w-3.5" />
              Sem foto, a promoção ainda aparece sem imagem no ar.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
