import { useState } from 'react';
import { Copy, Check, Download, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { DIVULGACAO, type PecaDivulgacao } from '@/lib/divulgacao-content';

/**
 * Central de peças prontas para o operador postar. Página só de admin.
 *
 * Os PNGs são assets estáticos em public/divulgacao/, gerados fora do app por
 * `marketing/gerar.mjs`. Não há upload nem rota de API aqui: o download é um
 * link direto para a CDN. Os arquivos são públicos de propósito — material de
 * divulgação existe para circular; o que fica atrás do login é esta página,
 * que diz onde postar cada um e entrega a legenda pronta.
 */

/** Os arquivos ficam no estático da própria signage, sob a base do Vite. */
function urlDaPeca(arquivo: string, alta: boolean): string {
  return `${import.meta.env.BASE_URL}divulgacao/${arquivo}${alta ? '-2x' : ''}.png`;
}

function BotaoCopiar({ legenda }: { legenda: string }) {
  const { toast } = useToast();
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(legenda);
      setCopiado(true);
      toast({ title: DIVULGACAO.copiado });
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Navegador sem permissão de área de transferência (ou contexto não
      // seguro). Selecionar o texto na tela continua funcionando.
      toast({
        title: 'Não foi possível copiar',
        description: 'Selecione a legenda e copie manualmente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={copiar}>
      {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {DIVULGACAO.copiar}
    </Button>
  );
}

function CardPeca({ peca }: { peca: PecaDivulgacao }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-6 p-6 md:grid-cols-[220px_1fr]">
        <div className="flex items-start justify-center">
          <img
            src={urlDaPeca(peca.arquivo, false)}
            alt={`Peça de divulgação: ${peca.titulo}`}
            loading="lazy"
            className="w-full max-w-[220px] rounded-md border bg-muted"
          />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{peca.publico}</Badge>
            <Badge variant="outline">
              {peca.formato} · {peca.dimensoes}
            </Badge>
          </div>

          <h2 className="mt-3 text-lg font-semibold tracking-tight">{peca.titulo}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{peca.ondePostar}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" className="gap-2">
              <a href={urlDaPeca(peca.arquivo, true)} download>
                <Download className="h-4 w-4" />
                {DIVULGACAO.downloadAlta}
              </a>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-2">
              <a href={urlDaPeca(peca.arquivo, false)} download>
                <Download className="h-4 w-4" />
                {DIVULGACAO.downloadPadrao}
              </a>
            </Button>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">{peca.recomendacao}</p>

          <div className="mt-5 rounded-md border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {DIVULGACAO.legendaLabel}
              </p>
              <BotaoCopiar legenda={peca.legenda} />
            </div>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground">
              {peca.legenda}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Divulgacao() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{DIVULGACAO.title}</h1>
        <p className="mt-1 text-muted-foreground">{DIVULGACAO.subtitle}</p>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        {DIVULGACAO.avisos.map((aviso) => (
          <div key={aviso.titulo} className="rounded-lg border bg-muted/40 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              {aviso.titulo}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{aviso.body}</p>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        {DIVULGACAO.pecas.map((peca) => (
          <CardPeca key={peca.id} peca={peca} />
        ))}
      </div>
    </div>
  );
}
