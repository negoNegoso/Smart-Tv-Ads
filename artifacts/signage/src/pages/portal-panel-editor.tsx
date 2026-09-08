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
import { prepararImagemParaUpload } from '@/lib/image-para-renderizador';

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

export interface PriceParseResult {
  ok: boolean;
  cents: number;
}

/**
 * Preço digitado vira centavos inteiros, ou falha — nunca em silêncio. Um
 * preço na parede não pode nascer de uma coerção que ninguém vê.
 *
 * Duas leituras, dependendo do que foi digitado:
 *
 *  - Só dígitos ("1290"): atalho sem separador — os dois últimos dígitos
 *    são os centavos. "1290" -> 1290 (R$ 12,90).
 *  - Com separador decimal ("," ou "."): lido como moeda brasileira. Quando
 *    os dois aparecem, "." é separador de milhar e "," é o decimal
 *    ("1.234,56" -> 123456). Com um só, ele é o decimal — um único dígito
 *    decimal é lido como décimos ("1,5" -> 150, R$ 1,50). Três ou mais
 *    dígitos decimais não é um preço válido ("12,345" falha).
 *
 * Vazio, só letras, ou com decimais demais: `ok: false`. Um item de
 * cortesia deliberado é digitado "0,00", que é válido e vale 0 — bem
 * diferente de um campo vazio, que não é um preço.
 */
export function parsePriceToCents(raw: string): PriceParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, cents: 0 };

  const hasComma = trimmed.includes(',');
  const hasDot = trimmed.includes('.');

  if (!hasComma && !hasDot) {
    if (!/^\d+$/.test(trimmed)) return { ok: false, cents: 0 };
    return { ok: true, cents: parseInt(trimmed, 10) };
  }

  // "," manda quando os dois aparecem (ela é sempre o decimal em pt-BR); só
  // sobra "." como decimal quando "," não apareceu.
  const decimalSep = hasComma ? ',' : '.';
  const lastIndex = trimmed.lastIndexOf(decimalSep);
  const integerRaw = trimmed.slice(0, lastIndex);
  const decimalRaw = trimmed.slice(lastIndex + 1);

  const decimalDigits = decimalRaw.replace(/\D/g, '');
  if (decimalRaw !== decimalDigits || decimalDigits.length === 0 || decimalDigits.length > 2) {
    return { ok: false, cents: 0 };
  }

  // A parte inteira pode conter o outro separador como milhar (ex.: "1.234"
  // antes de ","), mas nenhum outro caractere — letra ali é erro de digitação.
  if (integerRaw !== '' && !/^[\d.,]*$/.test(integerRaw)) return { ok: false, cents: 0 };
  const integerDigits = integerRaw.replace(/\D/g, '');

  const reais = integerDigits === '' ? 0 : parseInt(integerDigits, 10);
  const cents = decimalDigits.length === 1 ? Number(decimalDigits) * 10 : Number(decimalDigits);
  return { ok: true, cents: reais * 100 + cents };
}

/** Só para a prévia: um preço momentaneamente inválido (ainda sendo digitado) vira 0 em vez de travar o desenho — quem bloqueia de verdade é o Salvar. */
function parsePriceOrZero(raw: string): number {
  const result = parsePriceToCents(raw);
  return result.ok ? result.cents : 0;
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
    priceCents: parsePriceOrZero(draft.priceText),
    oldPriceCents: draft.oldPriceText.trim() === '' ? null : parsePriceOrZero(draft.oldPriceText),
    category: draft.category.trim() === '' ? null : draft.category,
    imageUrl: draft.imageUrl,
  };
}

/** Espelha o bound de priceCents/oldPriceCents em artifacts/api-server/src/routes/panels.ts. */
const MAX_PRICE_CENTS = 100_000_000;
/** Espelha itemsBody.items.max(200) em artifacts/api-server/src/routes/panels.ts. */
const MAX_ITEMS = 200;

interface ItemPayload {
  name: string;
  description: string | null;
  priceCents: number;
  oldPriceCents: number | null;
  category: string | null;
  imageUrl: string | null;
}

type ItemsValidationResult =
  | { ok: true; items: ItemPayload[] }
  | { ok: false; errors: Record<number, string> };

/**
 * Valida e converte os rascunhos em itens prontos para o PUT, ou devolve os
 * erros por índice de linha — nunca os dois ao mesmo tempo, e nunca um
 * priceCents de 0 nascido de um texto que não era um preço.
 */
function buildItemsPayload(drafts: ItemDraft[]): ItemsValidationResult {
  const errors: Record<number, string> = {};
  const items: ItemPayload[] = [];

  drafts.forEach((draft, index) => {
    if (draft.name.trim() === '') return; // linha em branco: nunca enviada, nunca validada

    const price = parsePriceToCents(draft.priceText);
    if (!price.ok) {
      errors[index] = 'Preço inválido. Digite algo como 12,90.';
      return;
    }
    if (price.cents > MAX_PRICE_CENTS) {
      errors[index] = 'Preço acima do limite permitido.';
      return;
    }

    let oldPriceCents: number | null = null;
    if (draft.oldPriceText.trim() !== '') {
      const oldPrice = parsePriceToCents(draft.oldPriceText);
      if (!oldPrice.ok) {
        errors[index] = 'Preço antigo inválido. Digite algo como 12,90.';
        return;
      }
      if (oldPrice.cents > MAX_PRICE_CENTS) {
        errors[index] = 'Preço antigo acima do limite permitido.';
        return;
      }
      oldPriceCents = oldPrice.cents;
    }

    items.push({
      name: draft.name,
      description: draft.description.trim() === '' ? null : draft.description,
      priceCents: price.cents,
      oldPriceCents,
      category: draft.category.trim() === '' ? null : draft.category,
      imageUrl: draft.imageUrl,
    });
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, items };
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
  const [itemErrors, setItemErrors] = useState<Record<number, string>>({});
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
      setItemErrors({});
    }
  }, [panel, loadedId]);

  const menuPages = paginateMenuDrafts(items);
  useEffect(() => {
    setPreviewPage((p) => Math.min(p, Math.max(0, menuPages.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const invalidatePanel = () =>
    queryClient.invalidateQueries({ queryKey: getGetClientPanelQueryKey(panelId) });

  /**
   * Usado quando um Salvar dá errado no meio do caminho (PATCH ok, PUT não,
   * por exemplo): descarta o formulário local e força recarregar do
   * servidor, porque depois de uma falha parcial o estado local deixou de
   * ser confiável — só o servidor sabe o que realmente ficou salvo.
   */
  function reloadFromServer() {
    setLoadedId(null);
    invalidatePanel();
  }

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
    // O lojista está corrigindo a linha: o erro marcado nela deixou de valer
    // assim que ele mexe no campo, mesmo antes de validar de novo no Salvar.
    setItemErrors((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }

  function addItem() {
    if (items.length >= MAX_ITEMS) {
      toast({ title: `Não é possível ter mais de ${MAX_ITEMS} itens.`, variant: 'destructive' });
      return;
    }
    setItems((prev) => [...prev, emptyDraft()]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
    // Índices mudam para todo mundo depois do removido — mais simples e
    // seguro limpar os erros marcados do que tentar remapeá-los.
    setItemErrors({});
  }

  function moveItem(index: number, direction: -1 | 1) {
    setItems((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setItemErrors({});
  }

  const isSaving = updatePanel.isPending || replaceItems.isPending;

  async function handleSave() {
    // Preço inválido nunca deve virar 0 silenciosamente nem chegar à rede:
    // valida tudo antes de qualquer chamada e para aqui se algo não bate.
    const validated = buildItemsPayload(items);
    if (!validated.ok) {
      setItemErrors(validated.errors);
      toast({
        title: 'Corrija os preços destacados antes de salvar',
        variant: 'destructive',
      });
      return;
    }
    setItemErrors({});

    // PATCH (dados do painel) e PUT (itens) são duas chamadas — uma pode dar
    // certo e a outra não (um preço fora do limite derruba só o PUT, por
    // exemplo). Reportar as duas com uma mensagem genérica faria o lojista
    // achar que nada foi salvo quando na verdade metade foi, ou vice-versa.
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
    } catch {
      toast({
        title: 'Não foi possível salvar nome e duração. Nada foi alterado — tente de novo.',
        variant: 'destructive',
      });
      reloadFromServer();
      return;
    }

    try {
      await replaceItems.mutateAsync({ id: panelId, data: { items: validated.items } });
    } catch {
      toast({
        title: 'Nome e duração foram salvos, mas os itens não. Corrija e salve de novo.',
        variant: 'destructive',
      });
      reloadFromServer();
      return;
    }

    invalidatePanel();
    toast({ title: 'Alterações salvas' });
  }

  async function handleImageSelected(file: File) {
    setIsUploadingImage(true);
    try {
      // WebP (o que sai de celular hoje) é recusado pelo servidor porque o
      // renderizador não desenha — converte aqui, onde o navegador já sabe
      // decodificar. Ver lib/image-para-renderizador.ts.
      let arquivo: File;
      try {
        arquivo = await prepararImagemParaUpload(file, maxUploadBytes);
      } catch (erro) {
        toast({
          title: erro instanceof Error ? erro.message : 'Não foi possível preparar a imagem.',
          variant: 'destructive',
        });
        return;
      }

      const formData = new FormData();
      formData.append('image', arquivo);
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
                  onChange={(e) => {
                    // Não confia só nos atributos min/max do <input> — alguns
                    // navegadores deixam passar valor fora do intervalo (colar,
                    // setas do teclado em builds antigos). O servidor aceita só
                    // 5..60; forçar aqui evita descobrir isso só num 400.
                    const raw = e.target.valueAsNumber;
                    if (Number.isNaN(raw)) return;
                    setDuration(Math.min(60, Math.max(5, Math.trunc(raw))));
                  }}
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
                        className={itemErrors[0] ? 'border-destructive' : undefined}
                        aria-invalid={Boolean(itemErrors[0])}
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
                        className={itemErrors[0] ? 'border-destructive' : undefined}
                        aria-invalid={Boolean(itemErrors[0])}
                      />
                    </div>
                  </div>
                  {itemErrors[0] ? <p className="text-xs text-destructive">{itemErrors[0]}</p> : null}
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
                        <TableHead>Descrição</TableHead>
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
                              placeholder="Descrição"
                              value={item.description}
                              onChange={(e) => updateItem(index, { description: e.target.value })}
                              maxLength={200}
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
                              className={itemErrors[index] ? 'border-destructive' : undefined}
                              aria-invalid={Boolean(itemErrors[index])}
                            />
                            {itemErrors[index] ? (
                              <p className="mt-1 text-xs text-destructive">{itemErrors[index]}</p>
                            ) : null}
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
