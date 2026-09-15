import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Building2, ChevronRight, DollarSign, Megaphone, Monitor, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { CompanyFormDialog } from '@/components/company-form-dialog';
import { STATUS_LABELS, companiesQueryKey, listCompanies, type CompanyStatus } from '@/lib/companies-api';

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

export default function Companies() {
  const [, navigate] = useLocation();
  const [role, setRole] = useState<'' | 'client' | 'advertiser'>('');
  const [status, setStatus] = useState<'' | CompanyStatus>('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const filter = { role: role || undefined, status: status || undefined, q: q.trim() || undefined };
  const { data: companies = [], isLoading } = useQuery({
    queryKey: [...companiesQueryKey, filter],
    queryFn: () => listCompanies(filter),
  });

  // Valor contratado somado da rede: era o painel da antiga página de anunciantes.
  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async (): Promise<Array<{ contractValue: number }>> => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/campaigns`);
      return res.ok ? res.json() : [];
    },
  });
  const totalValue = campaigns.reduce((sum, c) => sum + Number(c.contractValue || 0), 0);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Empresas</h1>
          <p className="mt-1 text-muted-foreground">Donos de TV e anunciantes num cadastro só.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Nova empresa</Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric icon={Building2} label="Empresas" value={companies.length} />
        <Metric icon={Monitor} label="Clientes" value={companies.filter((c) => c.clientId !== null).length} />
        <Metric icon={Megaphone} label="Anunciantes" value={companies.filter((c) => c.advertiserId !== null).length} />
        <Metric icon={DollarSign} label="Valor contratado" value={money(totalValue)} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="filter-q">Buscar</Label>
          <Input id="filter-q" placeholder="Nome da empresa" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-role">Papel</Label>
          <select id="filter-role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="">Todos</option>
            <option value="client">Clientes</option>
            <option value="advertiser">Anunciantes</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-status">Status</Label>
          <select id="filter-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="">Todos</option>
            {(Object.keys(STATUS_LABELS) as CompanyStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : companies.length === 0 ? (
        <Card className="py-16 text-center">
          <CardContent>
            <Building2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">Nenhuma empresa encontrada.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {companies.map((company) => (
            <Link key={company.id} href={`/companies/${company.id}`}>
              <div className="group flex cursor-pointer items-center gap-4 rounded-xl border bg-card p-5 shadow-sm transition-all hover:border-primary/40">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold">{company.name}</h3>
                  {company.city ? (
                    <p className="text-sm text-muted-foreground">{[company.city, company.state].filter(Boolean).join('/')}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {company.clientId !== null ? <Badge variant="secondary">Cliente</Badge> : null}
                  {company.advertiserId !== null ? <Badge variant="secondary">Anunciante</Badge> : null}
                  {company.status !== 'active' ? <Badge variant="outline">{STATUS_LABELS[company.status]}</Badge> : null}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <CompanyFormDialog
        open={open}
        onOpenChange={setOpen}
        onSaved={(saved) => {
          setOpen(false);
          navigate(`/companies/${saved.id}`);
        }}
      />
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
