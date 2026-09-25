import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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
import FlyerEditor from '@/components/flyer/flyer-editor';
import { useToast } from '@/hooks/use-toast';
import { useMaxUploadBytes, formatUploadLimit } from '@/lib/upload-limit';
import { dimensoesDaImagem, prepararImagemParaUpload } from '@/lib/image-para-renderizador';
import { parsePriceToCents } from '@/lib/price';
import { panelErrorInfo } from '@/lib/panel-error';
import {
  DEFAULT_ACCENT_COLOR,
  PROMO_PHOTO_LEFT,
  PROMO_PHOTO_HEIGHT,
  PROMO_PHOTO_WIDTH,
  normalizeAccentColor,
  normalizePhotoOffset,
  resolvePromoStyle,
} from '@/lib/promo-visual';

/**
 * Espelha o orçamento vertical de `artifacts/api-server/src/lib/panels/`
 * (`templates.ts` mede as alturas no satori, `paginate.ts` corta por elas).
 * O signage não depende do pacote do servidor, então os números — e a regra de
 * agrupar por categoria — são reimplementados aqui só para a navegação da
 * prévia. Quem decide o que realmente cabe na tela é sempre o PNG do servidor.
 *
 * O corte é por altura, não por contagem de itens: linha com descrição ocupa
 * bem mais que linha só com nome, então "quantos itens cabem" muda de página
 * para página.
 */
const MENU_CONTENT_HEIGHT = 952;
const MENU_CATEGORY_HEADER_HEIGHT = 65;
const MENU_ROW_HEIGHT_WITH_DESCRIPTION = 121;
const MENU_ROW_HEIGHT_PLAIN = 88;

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

// Movido para lib/price.ts: o editor do encarte importa de lá, não desta
// página, para não criar import circular entre os dois editores.
export { parsePriceToCents } from '@/lib/price';

/** Só para a prévia: um preço momentaneamente inválido (ainda sendo digitado) vira 0 em vez de travar o desenho — quem bloqueia de verdade é o Salvar. */
function parsePriceOrZero(raw: string): number {
  const result = parsePriceToCents(raw);
  return result.ok ? result.cents : 0;
}

/**
 * Converte o arrasto vertical na prévia (Anexo 2026-09-17) em porcentagem de
 * enquadramento: o deslocamento em pixels desde o mousedown vira porcentagem
 * pela altura da prévia, subtraído do valor de partida e preso entre 0 e 100.
 *
 * A subtração (em vez de soma) é o que faz o arrasto se comportar como
 * "segurar a foto": arrastar para baixo empurra o conteúdo da foto para
 * baixo dentro do quadro, então o que aparece é mais o TOPO dela — um
 * `object-position` Y menor, na convenção 0 = topo, 100 = rodapé. Arrastar
 * para cima é o oposto: revela mais o rodapé, offset maior.
 *
 * Altura zero (prévia ainda não medida) não desloca nada, só prende o valor
 * de partida ao intervalo.
 */
export function photoOffsetFromDrag(startOffset: number, deltaY: number, previewHeight: number): number {
  const deltaPercent = previewHeight > 0 ? (deltaY / previewHeight) * 100 : 0;
  return Math.min(100, Math.max(0, startOffset - deltaPercent));
}

/**
 * Mesma conversão de `photoOffsetFromDrag`, no eixo horizontal: o
 * deslocamento em pixels desde o mousedown vira porcentagem pela largura da
 * prévia, subtraído do valor de partida e preso entre 0 e 100.
 *
 * Mesma convenção de "segurar a foto": arrastar para a direita empurra o
 * conteúdo da foto para a direita dentro do quadro, então o que aparece é
 * mais o lado ESQUERDO dela — um `object-position` X menor, na convenção
 * 0 = esquerda, 100 = direita. Arrastar para a esquerda é o oposto: revela
 * mais o lado direito, offset maior.
 *
 * Largura zero (prévia ainda não medida) não desloca nada, só prende o
 * valor de partida ao intervalo.
 */
export function photoOffsetXFromDrag(startOffset: number, deltaX: number, previewWidth: number): number {
  const deltaPercent = previewWidth > 0 ? (deltaX / previewWidth) * 100 : 0;
  return Math.min(100, Math.max(0, startOffset - deltaPercent));
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

/** Altura que a linha ocupa na tela, conforme tenha ou não descrição. */
function draftHeight(item: ItemDraft): number {
  return item.description.trim() === '' ? MENU_ROW_HEIGHT_PLAIN : MENU_ROW_HEIGHT_WITH_DESCRIPTION;
}

/** Enche páginas até o orçamento acabar; devolve o mínimo de páginas do grupo. */
function greedyDraftPages(items: ItemDraft[], budget: number): ItemDraft[][] {
  const pages: ItemDraft[][] = [];
  let current: ItemDraft[] = [];
  let used = 0;
  for (const item of items) {
    const height = draftHeight(item);
    if (current.length > 0 && used + height > budget) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += height;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

/** Reparte em páginas de tamanho parecido; `null` quando o corte parelho não cabe. */
function balancedDraftPages(
  items: ItemDraft[],
  pageCount: number,
  budget: number,
): ItemDraft[][] | null {
  const base = Math.floor(items.length / pageCount);
  const extra = items.length % pageCount;
  const pages: ItemDraft[][] = [];
  let index = 0;
  for (let page = 0; page < pageCount; page += 1) {
    const size = base + (page < extra ? 1 : 0);
    const slice = items.slice(index, index + size);
    index += size;
    if (slice.length > 1 && slice.reduce((sum, i) => sum + draftHeight(i), 0) > budget) return null;
    pages.push(slice);
  }
  return pages;
}

/** Mesma regra de `paginateMenuItems`: uma categoria por tela, cortada por altura. */
function paginateMenuDrafts(items: ItemDraft[]): ItemDraft[][] {
  const groups: ItemDraft[][] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last[0].category === item.category) last.push(item);
    else groups.push([item]);
  }
  const pages: ItemDraft[][] = [];
  for (const group of groups) {
    // O cabeçalho se repete em toda página do grupo, então sai do orçamento de
    // todas elas, não só da primeira.
    const budget = Math.max(
      1,
      group[0].category.trim() === ''
        ? MENU_CONTENT_HEIGHT
        : MENU_CONTENT_HEIGHT - MENU_CATEGORY_HEADER_HEIGHT,
    );
    const greedy = greedyDraftPages(group, budget);
    const split =
      greedy.length > 1 ? (balancedDraftPages(group, greedy.length, budget) ?? greedy) : greedy;
    pages.push(...split);
  }
  return pages;
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
  // accentColor guarda só cor válida ('' = padrão); accentText é o que o
  // lojista está digitando, que pode estar pela metade.
  const [accentColor, setAccentColor] = useState('');
  const [accentText, setAccentText] = useState('');
  const [promoStyle, setPromoStyle] = useState<'price' | 'percent'>('price');
  const [photoOffset, setPhotoOffset] = useState(50);
  const [photoOffsetX, setPhotoOffsetX] = useState(50);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const photoDragRef = useRef<{
    startX: number;
    startY: number;
    startOffset: number;
    startOffsetX: number;
    width: number;
    height: number;
  } | null>(null);

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
      setAccentColor(panel.accentColor ?? '');
      setAccentText(panel.accentColor ?? '');
      setPromoStyle(panel.promoStyle === 'percent' ? 'percent' : 'price');
      setPhotoOffset(normalizePhotoOffset(panel.photoOffset));
      setPhotoOffsetX(normalizePhotoOffset(panel.photoOffsetX));
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
        const { status, message } = panelErrorInfo(error);
        toast({
          title: status === 422 && message ? message : 'Não foi possível publicar o painel',
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
          accentColor: accentColor === '' ? null : accentColor,
          promoStyle,
          photoOffset,
          photoOffsetX,
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
      // Aviso, não bloqueio: a foto pequena ainda vai ao ar (o renderizador
      // estica), e medir depende do navegador saber decodificar o arquivo.
      const dimensoes = await dimensoesDaImagem(arquivo);
      if (dimensoes && (dimensoes.largura < PROMO_PHOTO_WIDTH || dimensoes.altura < PROMO_PHOTO_HEIGHT)) {
        toast({
          title: `Foto pequena para a TV (${dimensoes.largura}×${dimensoes.altura}). O ideal é pelo menos ${PROMO_PHOTO_WIDTH}×${PROMO_PHOTO_HEIGHT} pixels.`,
        });
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

  /**
   * Arrasto na prévia (Anexo 2026-09-17): pointerdown guarda a posição e o
   * enquadramento de partida dos dois eixos, pointermove converte o
   * deslocamento em porcentagem pela altura e largura da prévia
   * (`photoOffsetFromDrag` e `photoOffsetXFromDrag`) — um gesto só move os
   * dois eixos ao mesmo tempo. `setPointerCapture` mantém os eventos de
   * move/up presos ao overlay mesmo que o ponteiro saia da área durante o
   * arrasto.
   */
  function handlePhotoPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    photoDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffset: photoOffset,
      startOffsetX: photoOffsetX,
      width: rect.width,
      height: rect.height,
    };
    setIsDraggingPhoto(true);
  }

  function handlePhotoPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = photoDragRef.current;
    if (!drag) return;
    const deltaY = e.clientY - drag.startY;
    const deltaX = e.clientX - drag.startX;
    setPhotoOffset(photoOffsetFromDrag(drag.startOffset, deltaY, drag.height));
    setPhotoOffsetX(photoOffsetXFromDrag(drag.startOffsetX, deltaX, drag.width));
  }

  function handlePhotoPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (photoDragRef.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    photoDragRef.current = null;
    setIsDraggingPhoto(false);
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

  // Encarte tem editor próprio: layout, prévia no servidor e identidade da
  // loja não cabem neste arquivo, que já serve três tipos de painel.
  if (panel.kind === 'flyer') return <FlyerEditor panel={panel} onBack={onBack} />;

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
                    <Label htmlFor="panel-accent-text">Código da cor</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label="Escolher cor"
                        value={normalizeAccentColor(accentColor).toLowerCase()}
                        onChange={(e) => {
                          const color = e.target.value.toUpperCase();
                          setAccentColor(color);
                          setAccentText(color);
                        }}
                        className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1"
                      />
                      <Input
                        id="panel-accent-text"
                        placeholder={DEFAULT_ACCENT_COLOR}
                        value={accentText}
                        maxLength={7}
                        onChange={(e) => {
                          const text = e.target.value;
                          setAccentText(text);
                          // Só vira cor quando está completa; pela metade, o
                          // slide segue com a última cor válida (ou a padrão).
                          if (text === '') setAccentColor('');
                          else if (/^#[0-9A-Fa-f]{6}$/.test(text)) setAccentColor(text.toUpperCase());
                        }}
                        className="w-32 font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Mostrar desconto como</Label>
                    <div className="flex gap-2" role="group" aria-label="Mostrar desconto como">
                      <Button
                        type="button"
                        variant={promoStyle === 'price' ? 'default' : 'outline'}
                        aria-pressed={promoStyle === 'price'}
                        onClick={() => setPromoStyle('price')}
                      >
                        Preço
                      </Button>
                      <Button
                        type="button"
                        variant={promoStyle === 'percent' ? 'default' : 'outline'}
                        aria-pressed={promoStyle === 'percent'}
                        onClick={() => setPromoStyle('percent')}
                      >
                        Porcentagem
                      </Button>
                    </div>
                    {promoStyle === 'percent' &&
                    resolvePromoStyle('percent', items[0] ? draftToPreviewItem(items[0]) : undefined) === 'price' ? (
                      <p className="text-xs text-muted-foreground">
                        Sem desconto válido, o slide mostra o preço normal.
                      </p>
                    ) : null}
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
                      Use imagem quadrada ou em pé, com pelo menos {PROMO_PHOTO_WIDTH}×{PROMO_PHOTO_HEIGHT}{' '}
                      pixels. O produto aparece à direita do slide e o lado esquerdo da foto fica atrás do
                      painel colorido, então deixe folga nas bordas. Tamanho máximo do arquivo:{' '}
                      {formatUploadLimit(maxUploadBytes)}.
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
          <div className="relative">
            {/* Encarte nunca chega aqui: o guard acima delega para o
                FlyerEditor antes deste JSX existir. `PanelPreview` só
                atende os painéis que já existiam. */}
            <PanelPreview
              kind={kind}
              headline={headline.trim() === '' ? null : headline}
              body={body.trim() === '' ? null : body}
              items={previewItems}
              page={previewPage + 1}
              accentColor={accentColor === '' ? null : accentColor}
              promoStyle={promoStyle}
              photoOffset={photoOffset}
              photoOffsetX={photoOffsetX}
            />
            {/* Arrasto vertical (Anexo 2026-09-17): overlay transparente só sobre a
                área da foto, para não interferir no resto da prévia nem acoplar o
                componente reutilizável `PanelPreview` ao estado do editor. */}
            {kind === 'promo' && items[0]?.imageUrl ? (
              <div
                role="presentation"
                aria-hidden="true"
                className="absolute inset-y-0"
                style={{
                  left: `${(PROMO_PHOTO_LEFT / (PROMO_PHOTO_LEFT + PROMO_PHOTO_WIDTH)) * 100}%`,
                  right: 0,
                  cursor: isDraggingPhoto ? 'grabbing' : 'grab',
                  touchAction: 'none',
                }}
                onPointerDown={handlePhotoPointerDown}
                onPointerMove={handlePhotoPointerMove}
                onPointerUp={handlePhotoPointerUp}
                onPointerCancel={handlePhotoPointerUp}
              />
            ) : null}
          </div>
          {kind === 'promo' && items[0]?.imageUrl ? (
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPhotoOffset(50);
                    setPhotoOffsetX(50);
                  }}
                >
                  Centralizar
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="photo-offset">Enquadramento vertical da foto</Label>
                <input
                  id="photo-offset"
                  type="range"
                  min={0}
                  max={100}
                  value={photoOffset}
                  onChange={(e) => setPhotoOffset(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="photo-offset-x">Enquadramento horizontal da foto</Label>
                <input
                  id="photo-offset-x"
                  type="range"
                  min={0}
                  max={100}
                  value={photoOffsetX}
                  onChange={(e) => setPhotoOffsetX(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          ) : null}
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
