import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import {
  useListClientPanels,
  useCreateClientPanel,
  usePublishClientPanel,
  useUnpublishClientPanel,
  useDeleteClientPanel,
  getListClientPanelsQueryKey,
  type Panel,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface PortalDevice {
  id: number;
}

interface PortalClient {
  id: number;
  name: string;
}

/** Erro de rede não pode virar lista vazia — ver a nota em portal-advertiser.tsx. */
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Falha ao carregar ${path}: ${res.status}`);
  return res.json();
}

const KIND_LABEL: Record<Panel['kind'], string> = {
  menu: 'Cardápio',
  promo: 'Promoção',
  notice: 'Aviso',
};

const NEW_PANEL_OPTIONS = [
  { kind: 'menu' as const, template: 'menu-basico', label: 'Novo cardápio' },
  { kind: 'promo' as const, template: 'promo-foto', label: 'Nova promoção' },
  { kind: 'notice' as const, template: 'aviso-simples', label: 'Novo aviso' },
];

function itemCountLabel(count: number): string {
  return count === 1 ? '1 item' : `${count} itens`;
}

function publishedDateLabel(publishedAt: string): string {
  return `No ar desde ${new Date(publishedAt).toLocaleDateString('pt-BR')}`;
}

/**
 * A biblioteca gerada não exporta a classe `ApiError` (só o tipo `ErrorType`,
 * apagado em tempo de execução), então o 422 é detectado por forma — mesma
 * técnica usada nos outros lugares do portal que leem `error.data`. Um tipo
 * de retorno amplo (em vez de um type predicate) evita que o TS estreite o
 * `TError` genérico das mutations geradas para `never`.
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

interface PanelCardProps {
  panel: Panel;
  clientName?: string;
  onEdit: (panelId: number) => void;
  onPublish: (panel: Panel) => void;
  onUnpublish: (panel: Panel) => void;
  onDelete: (panelId: number) => void;
  isPublishing: boolean;
  isUnpublishing: boolean;
  isDeleting: boolean;
}

function PanelCard({
  panel,
  clientName,
  onEdit,
  onPublish,
  onUnpublish,
  onDelete,
  isPublishing,
  isUnpublishing,
  isDeleting,
}: PanelCardProps) {
  const isPublished = panel.status === 'published';

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>{panel.name}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {KIND_LABEL[panel.kind]}
            {/* Só aparece para quem opera mais de uma loja: sem isto, dois
                cardápios de lojas diferentes ficam indistinguíveis na lista. */}
            {clientName ? ` · ${clientName}` : ''}
          </p>
        </div>
        <Badge variant={isPublished ? 'default' : 'secondary'}>
          {isPublished && panel.publishedAt ? publishedDateLabel(panel.publishedAt) : 'Rascunho'}
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">{itemCountLabel(panel.items.length)}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(panel.id)}>
            Editar
          </Button>
          {isPublished ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onUnpublish(panel)}
              disabled={isUnpublishing}
            >
              Tirar do ar
            </Button>
          ) : (
            <Button size="sm" onClick={() => onPublish(panel)} disabled={isPublishing}>
              Publicar
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isDeleting}>
                <Trash2 className="mr-1 h-4 w-4" />
                Apagar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar "{panel.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. O painel sai do ar imediatamente, se estiver publicado.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(panel.id)}>Apagar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PortalPanels({ onEdit }: { onEdit: (panelId: number) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const panelsQuery = useListClientPanels();

  const devicesQuery = useQuery({
    queryKey: ['portal', 'client', 'devices', 30],
    queryFn: () => getJson<PortalDevice[]>('api/portal/client/devices?days=30'),
    retry: false,
  });

  const clientsQuery = useQuery({
    queryKey: ['portal', 'client', 'clients'],
    queryFn: () => getJson<PortalClient[]>('api/portal/client/clients'),
    retry: false,
  });

  // Quem opera uma loja só nunca vê o seletor: o id vai junto do pedido de
  // qualquer jeito. Com duas ou mais, o servidor se recusa a adivinhar — e faz
  // bem, criar o cardápio na loja errada é pior que um erro na tela.
  const clients = clientsQuery.data ?? [];
  const needsClientChoice = clients.length > 1;
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const ownerClientId = needsClientChoice ? selectedClientId : (clients[0]?.id ?? null);
  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));

  const invalidatePanels = () =>
    queryClient.invalidateQueries({ queryKey: getListClientPanelsQueryKey() });

  const createPanel = useCreateClientPanel({
    mutation: {
      onSuccess: (panel) => {
        invalidatePanels();
        onEdit(panel.id);
      },
      onError: () => toast({ title: 'Não foi possível criar o painel', variant: 'destructive' }),
    },
  });

  const publishPanel = usePublishClientPanel({
    mutation: {
      onSuccess: () => invalidatePanels(),
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
      onSuccess: () => invalidatePanels(),
      onError: () => toast({ title: 'Não foi possível tirar o painel do ar', variant: 'destructive' }),
    },
  });

  const deletePanel = useDeleteClientPanel({
    mutation: {
      onSuccess: () => {
        invalidatePanels();
        toast({ title: 'Painel apagado' });
      },
      onError: () => toast({ title: 'Não foi possível apagar o painel', variant: 'destructive' }),
    },
  });

  if (panelsQuery.isError || devicesQuery.isError) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Não foi possível carregar seus painéis</EmptyTitle>
          <EmptyDescription>
            O servidor não respondeu. Seus painéis publicados continuam no ar — isto é uma falha de leitura.
          </EmptyDescription>
        </EmptyHeader>
        <Button
          onClick={() => {
            panelsQuery.refetch();
            devicesQuery.refetch();
          }}
        >
          Tentar de novo
        </Button>
      </Empty>
    );
  }

  const panels = panelsQuery.data ?? [];
  const hasNoDevices = devicesQuery.isSuccess && devicesQuery.data.length === 0;

  return (
    <div>
      {hasNoDevices ? (
        <div className="mb-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Você ainda não tem TV vinculada; o painel fica salvo e entra no ar assim que houver uma.
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Meus painéis</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {needsClientChoice ? (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Loja</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={selectedClientId ?? ''}
                onChange={(event) =>
                  setSelectedClientId(event.target.value === '' ? null : Number(event.target.value))
                }
              >
                <option value="">Escolha a loja</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {NEW_PANEL_OPTIONS.map((option) => (
            <Button
              key={option.kind}
              variant="outline"
              size="sm"
              title={
                needsClientChoice && ownerClientId === null
                  ? 'Escolha em qual loja o painel será criado.'
                  : undefined
              }
              disabled={createPanel.isPending || ownerClientId === null}
              onClick={() =>
                createPanel.mutate({
                  data: {
                    kind: option.kind,
                    name: option.label,
                    template: option.template,
                    // Sempre explícito: com uma loja só, o servidor deduziria,
                    // mas mandar o id evita que a criação dependa de dedução.
                    ...(ownerClientId === null ? {} : { clientId: ownerClientId }),
                  },
                })
              }
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {panelsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : panels.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Você ainda não tem nenhum painel</EmptyTitle>
            <EmptyDescription>
              Crie um cardápio, uma promoção ou um aviso para começar a exibir nas suas TVs.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {panels.map((panel) => (
            <PanelCard
              key={panel.id}
              panel={panel}
              clientName={needsClientChoice ? clientNameById.get(panel.clientId) : undefined}
              onEdit={onEdit}
              onPublish={(p) => publishPanel.mutate({ id: p.id })}
              onUnpublish={(p) => unpublishPanel.mutate({ id: p.id })}
              onDelete={(id) => deletePanel.mutate({ id })}
              isPublishing={publishPanel.isPending}
              isUnpublishing={unpublishPanel.isPending}
              isDeleting={deletePanel.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
