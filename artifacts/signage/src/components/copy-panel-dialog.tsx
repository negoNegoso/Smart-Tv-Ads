import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useCopyClientPanel, getListClientPanelsQueryKey, type Panel } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

export interface PanelStore {
  id: number;
  name: string;
}

function copiedLabel(count: number): string {
  return count === 1 ? 'Painel copiado para 1 loja' : `Painel copiado para ${count} lojas`;
}

/**
 * Copia o painel para outras lojas, para não montar a mesma tabela de preços
 * do zero em cada uma. A loja de origem não aparece na lista: copiar para ela
 * mesma seria duplicar, não copiar.
 */
export function CopyPanelDialog({ panel, stores }: { panel: Panel; stores: PanelStore[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const targets = stores.filter((store) => store.id !== panel.clientId);

  const copyPanel = useCopyClientPanel({
    mutation: {
      onSuccess: (copies) => {
        queryClient.invalidateQueries({ queryKey: getListClientPanelsQueryKey() });
        toast({ title: copiedLabel(copies.length), description: 'As cópias ficam como rascunho até alguém publicar.' });
        setOpen(false);
      },
      onError: () => toast({ title: 'Não foi possível copiar o painel', variant: 'destructive' }),
    },
  });

  const toggle = (storeId: number, checked: boolean) =>
    setSelected((current) => (checked ? [...current, storeId] : current.filter((id) => id !== storeId)));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSelected([]);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Copy className="mr-1 h-4 w-4" />
          Copiar para…
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copiar "{panel.name}"</DialogTitle>
          <DialogDescription>
            A cópia entra como rascunho em cada loja escolhida, com os mesmos itens e fotos. Nada vai ao ar sem
            alguém revisar e publicar.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {targets.map((store) => {
            const inputId = `copiar-${panel.id}-${store.id}`;
            return (
              <li key={store.id} className="flex items-center gap-2">
                <Checkbox
                  id={inputId}
                  checked={selected.includes(store.id)}
                  onCheckedChange={(checked) => toggle(store.id, checked === true)}
                />
                <label htmlFor={inputId} className="text-sm">
                  {store.name}
                </label>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button
            disabled={selected.length === 0 || copyPanel.isPending}
            onClick={() => copyPanel.mutate({ id: panel.id, data: { clientIds: selected } })}
          >
            Copiar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
