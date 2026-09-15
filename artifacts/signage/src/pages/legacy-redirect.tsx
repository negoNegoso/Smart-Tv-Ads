import { useEffect, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { Button } from '@/components/ui/button';

/**
 * `/clients/:id` e `/advertisers/:id` viraram abas da empresa. Links salvos e
 * os que ainda existem nas páginas de TV e campanha caem aqui e seguem para a
 * empresa dona do perfil.
 */
export default function LegacyRedirect({ kind }: { kind: 'client' | 'advertiser' }) {
  const [, params] = useRoute(kind === 'client' ? '/clients/:id' : '/advertisers/:id');
  const [, navigate] = useLocation();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!params?.id) return;
    const path = kind === 'client' ? 'clients' : 'advertisers';
    fetch(`${import.meta.env.BASE_URL}api/${path}/${params.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((row: { companyId?: number } | null) => {
        if (row?.companyId) navigate(`/companies/${row.companyId}`, { replace: true });
        else setMissing(true);
      })
      .catch(() => setMissing(true));
  }, [kind, params?.id, navigate]);

  if (!missing) return <div className="container mx-auto max-w-4xl px-4 py-8 text-sm text-muted-foreground">Carregando…</div>;
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 text-center">
      <p className="text-muted-foreground">Cadastro não encontrado.</p>
      <Link href="/companies"><Button variant="link">Ir para empresas</Button></Link>
    </div>
  );
}
