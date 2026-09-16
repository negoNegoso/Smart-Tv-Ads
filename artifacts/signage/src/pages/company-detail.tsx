import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useRoute } from 'wouter';
import { ArrowLeft, MapPin, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { AdvertiserCampaignsSection } from '@/components/advertiser-campaigns-section';
import { ClientDevicesSection } from '@/components/client-devices-section';
import { CompanyFormDialog } from '@/components/company-form-dialog';
import {
  ApiError,
  STATUS_LABELS,
  companiesQueryKey,
  companyQueryKey,
  deleteCompany,
  getCompany,
  type CompanyDetail,
} from '@/lib/companies-api';

interface LinkedUser {
  id: number;
  email: string;
  name: string | null;
  clientIds: number[];
  advertiserIds: number[];
}

function formatCep(cep: string) {
  return cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;
}

/** "Rua, número · bairro · cidade/UF · CEP 00000-000", pulando o que falta. */
function addressLine(c: CompanyDetail): string | null {
  const street = [c.street, c.number].filter(Boolean).join(', ');
  const city = [c.city, c.state].filter(Boolean).join('/');
  const parts = [street, c.complement, c.district, city, c.cep ? `CEP ${formatCep(c.cep)}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export default function CompanyDetailPage() {
  const [, params] = useRoute('/companies/:id');
  const id = params ? Number(params.id) : 0;
  return <CompanyDetailView companyId={id} />;
}

export function CompanyDetailView({ companyId }: { companyId: number }) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);

  const { data: company, isLoading, isError } = useQuery({
    queryKey: companyQueryKey(companyId),
    queryFn: () => getCompany(companyId),
    enabled: companyId > 0,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async (): Promise<LinkedUser[]> => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/users`);
      return res.ok ? res.json() : [];
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !company) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8 text-center">
        <p className="text-muted-foreground">Empresa não encontrada.</p>
        <Link href="/companies"><Button variant="link" className="mt-2">Voltar para empresas</Button></Link>
      </div>
    );
  }

  const linkedUsers = users.filter(
    (u) =>
      (company.clientId !== null && u.clientIds.includes(company.clientId)) ||
      (company.advertiserId !== null && u.advertiserIds.includes(company.advertiserId)),
  );
  const address = addressLine(company);
  const defaultTab = company.clientId !== null ? 'tvs' : company.advertiserId !== null ? 'campanhas' : 'contas';

  async function handleDelete() {
    if (!company || !window.confirm(`Excluir a empresa "${company.name}"?`)) return;
    try {
      await deleteCompany(company.id);
      queryClient.invalidateQueries({ queryKey: companiesQueryKey });
      toast({ title: 'Empresa excluída' });
      navigate('/companies');
    } catch (err) {
      toast({ title: err instanceof ApiError ? err.message : 'Não foi possível excluir a empresa.', variant: 'destructive' });
    }
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Link href="/companies">
        <Button variant="ghost" size="sm" className="-ml-2 mb-6 text-muted-foreground"><ArrowLeft className="mr-1 h-4 w-4" />Empresas</Button>
      </Link>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{company.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {company.clientId !== null ? <Badge variant="secondary">Cliente</Badge> : null}
            {company.advertiserId !== null ? <Badge variant="secondary">Anunciante</Badge> : null}
            <Badge variant="outline">{STATUS_LABELS[company.status]}</Badge>
          </div>
          {address ? (
            <p className="mt-3 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" /><span>{address}</span></p>
          ) : null}
          {company.email || company.phone ? (
            <p className="mt-1 text-sm text-muted-foreground">{[company.email, company.phone].filter(Boolean).join(' · ')}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
          <Button variant="ghost" size="icon" aria-label="Excluir empresa" onClick={handleDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {company.notes ? (
        <Card className="mb-8">
          <CardContent className="pt-5">
            <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Observações internas</p>
            <p className="whitespace-pre-wrap text-sm">{company.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {company.clientId !== null ? <TabsTrigger value="tvs">TVs</TabsTrigger> : null}
          {company.advertiserId !== null ? <TabsTrigger value="campanhas">Campanhas</TabsTrigger> : null}
          <TabsTrigger value="contas">Contas de acesso</TabsTrigger>
        </TabsList>
        {company.clientId !== null ? (
          <TabsContent value="tvs" className="pt-4"><ClientDevicesSection clientId={company.clientId} /></TabsContent>
        ) : null}
        {company.advertiserId !== null ? (
          <TabsContent value="campanhas" className="pt-4"><AdvertiserCampaignsSection advertiserId={company.advertiserId} /></TabsContent>
        ) : null}
        <TabsContent value="contas" className="pt-4">
          {linkedUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta vinculada a esta empresa.</p>
          ) : (
            <ul className="space-y-2">
              {linkedUsers.map((u) => (
                <li key={u.id} className="rounded-lg border p-3 text-sm">
                  <span className="font-medium">{u.name ?? u.email}</span>
                  {u.name ? <span className="text-muted-foreground"> · {u.email}</span> : null}
                </li>
              ))}
            </ul>
          )}
          <Link href="/users-admin"><Button variant="link" className="mt-2 px-0">Gerenciar contas de acesso</Button></Link>
        </TabsContent>
      </Tabs>

      <CompanyFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        company={company}
        onSaved={(saved) => {
          setEditOpen(false);
          queryClient.setQueryData(companyQueryKey(company.id), saved);
          queryClient.invalidateQueries({ queryKey: companiesQueryKey });
        }}
      />
    </div>
  );
}
