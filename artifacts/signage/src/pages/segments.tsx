import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Plus } from 'lucide-react';
import { getListSegmentsQueryKey, useListSegments } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ApiError, companiesQueryKey, listCompanies } from '@/lib/companies-api';
import {
  createSegment,
  deleteSegment,
  mergeSegment,
  renameSegment,
  type SegmentWithUsage,
} from '@/lib/segments-api';

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

export default function Segments() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: segments = [] } = useListSegments();
  // A contagem de pendentes sai da lista de empresas: é o mesmo dado que a
  // tela de empresas mostra com o selo "Sem segmento".
  const { data: companies = [] } = useQuery({ queryKey: [...companiesQueryKey, {}], queryFn: () => listCompanies() });
  const missing = companies.filter((c) => c.segmentId === null).length;

  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<SegmentWithUsage | null>(null);
  const [merging, setMerging] = useState<SegmentWithUsage | null>(null);

  // Segmento mexe na regra do concorrente e no cadastro das empresas: as duas
  // listas voltam a buscar.
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: getListSegmentsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: companiesQueryKey });
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    try {
      await createSegment(newName.trim());
      setNewName('');
      refresh();
    } catch (err) {
      toast({ title: errorMessage(err, 'Não foi possível criar o segmento.'), variant: 'destructive' });
    }
  }

  async function handleDelete(segment: SegmentWithUsage) {
    try {
      await deleteSegment(segment.id);
      toast({ title: 'Segmento apagado' });
      refresh();
    } catch (err) {
      // 409: alguém passou a usar o segmento depois que a lista carregou.
      toast({ title: errorMessage(err, 'Não foi possível apagar o segmento.'), description: 'Use mesclar para tirá-lo.', variant: 'destructive' });
      refresh();
      // Além da mensagem, já abre o mesclar: é a saída para um segmento em uso.
      setMerging(segment);
    }
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Segmentos</h1>
        <p className="mt-1 text-muted-foreground">Ramo de cada empresa. Empresas do mesmo segmento não anunciam nas TVs umas das outras.</p>
        {missing > 0 ? (
          <p className="mt-3 text-sm text-amber-500">
            <Link href="/companies" className="underline">{missing === 1 ? '1 empresa sem segmento' : `${missing} empresas sem segmento`}</Link>
            {' '}— a regra do concorrente não vale para elas.
          </p>
        ) : null}
      </div>

      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <Input aria-label="Nome do segmento" placeholder="Ex.: Farmácia" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button type="submit"><Plus className="mr-2 h-4 w-4" />Novo segmento</Button>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2">Segmento</th>
            <th className="py-2">Empresas</th>
            <th className="py-2">Campanhas</th>
            <th className="py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((segment) => {
            const inUse = segment.companyCount > 0 || segment.campaignCount > 0;
            return (
              <tr key={segment.id} className="border-b">
                <td className="py-2 font-medium">{segment.name}</td>
                <td className="py-2">{segment.companyCount}</td>
                <td className="py-2">{segment.campaignCount}</td>
                <td className="flex justify-end gap-2 py-2">
                  <Button variant="outline" size="sm" onClick={() => setRenaming(segment)}>Renomear</Button>
                  <Button variant="outline" size="sm" onClick={() => setMerging(segment)} disabled={segments.length < 2}>Mesclar</Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={inUse}
                    title={inUse ? 'Em uso: use mesclar para tirá-lo.' : undefined}
                    onClick={() => handleDelete(segment)}
                  >
                    Apagar
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <RenameDialog segment={renaming} onClose={() => setRenaming(null)} onSaved={refresh} />
      <MergeDialog segment={merging} segments={segments} onClose={() => setMerging(null)} onSaved={refresh} />
    </div>
  );
}

function RenameDialog({ segment, onClose, onSaved }: { segment: SegmentWithUsage | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);
  // Reabre com o nome do segmento clicado, sem resto de erro da vez anterior.
  if (segment && segment.id !== lastId) {
    setLastId(segment.id);
    setName(segment.name);
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!segment) return;
    try {
      await renameSegment(segment.id, name.trim());
      onSaved();
      setLastId(null);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível renomear o segmento.'));
    }
  }

  return (
    <Dialog open={segment !== null} onOpenChange={(open) => { if (!open) { setLastId(null); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Renomear segmento</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="segment-rename">Novo nome</Label>
            <Input id="segment-rename" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter><Button type="submit">Salvar nome</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({
  segment,
  segments,
  onClose,
  onSaved,
}: {
  segment: SegmentWithUsage | null;
  segments: SegmentWithUsage[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [targetId, setTargetId] = useState('');
  const others = segments.filter((s) => s.id !== segment?.id);

  function close() {
    setTargetId('');
    onClose();
  }

  async function handleConfirm() {
    if (!segment || !targetId) return;
    try {
      await mergeSegment(segment.id, Number(targetId));
      toast({ title: 'Segmentos mesclados' });
      onSaved();
      close();
    } catch (err) {
      toast({ title: errorMessage(err, 'Não foi possível mesclar.'), variant: 'destructive' });
    }
  }

  return (
    <Dialog open={segment !== null} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Mesclar {segment?.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {segment?.companyCount ?? 0} empresa(s) e {segment?.campaignCount ?? 0} campanha(s) passam para o destino, e {segment?.name} deixa de existir.
          </p>
          <p className="text-sm text-amber-500">
            As empresas dos dois segmentos passam a ser concorrentes: peças entre elas deixam de tocar nas TVs umas das outras.
          </p>
          <div className="space-y-2">
            <Label htmlFor="segment-merge-target">Mesclar em</Label>
            <select id="segment-merge-target" className={selectClass} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="" disabled>Escolha o destino</option>
              {others.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter><Button onClick={handleConfirm} disabled={!targetId}>Confirmar mesclar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
