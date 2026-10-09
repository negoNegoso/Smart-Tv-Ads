import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatCents, parseReais } from '@/lib/money';
import { quote, type Pricing as Tabela } from '@/lib/pricing';
import { getPricing, pricingQueryKey, savePricing } from '@/lib/pricing-api';

// Exemplo fixo do quadro "como fica": o admin enxerga a conta sem montar campanha.
const EXEMPLO = { tvs: 10, loopInsertions: 2, period: 'annual' as const };

type Campos = { preco: string; minimo: string; trimestral: string; anual: string };

const VAZIO: Campos = { preco: '', minimo: '', trimestral: '', anual: '' };

function centavosParaTexto(n: number): string {
  return (n / 100).toFixed(2).replace('.', ',');
}

function porcentagem(texto: string): number | null {
  const t = texto.trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = Number(t);
  return n <= 90 ? n : null;
}

/** Campos digitados → tabela, ou null se algum estiver inválido. */
function lerTabela(c: Campos): Tabela | null {
  const pricePerTvCents = parseReais(c.preco);
  const minMonthlyCents = c.minimo.trim() === '' ? 0 : parseReais(c.minimo);
  const quarterlyDiscountPct = c.trimestral.trim() === '' ? 0 : porcentagem(c.trimestral);
  const annualDiscountPct = c.anual.trim() === '' ? 0 : porcentagem(c.anual);
  if (pricePerTvCents === null || minMonthlyCents === null || quarterlyDiscountPct === null || annualDiscountPct === null) return null;
  return { pricePerTvCents, minMonthlyCents, quarterlyDiscountPct, annualDiscountPct };
}

export default function Pricing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: pricingQueryKey, queryFn: getPricing });
  const [campos, setCampos] = useState<Campos>(VAZIO);

  // Preenche uma vez quando a tabela chega (ou fica vazio se não há preço).
  useEffect(() => {
    if (!data) return;
    setCampos({
      preco: centavosParaTexto(data.pricePerTvCents),
      minimo: centavosParaTexto(data.minMonthlyCents),
      trimestral: String(data.quarterlyDiscountPct),
      anual: String(data.annualDiscountPct),
    });
  }, [data]);

  const tabela = lerTabela(campos);
  const exemplo = tabela ? quote(tabela, EXEMPLO) : null;

  const salvar = useMutation({
    mutationFn: savePricing,
    onSuccess: (row) => {
      queryClient.setQueryData(pricingQueryKey, row);
      toast({ title: 'Preços salvos.' });
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  });

  const campo = (id: keyof Campos, label: string, invalido: boolean) => (
    <div className="space-y-2">
      <Label htmlFor={`preco-${id}`}>{label}</Label>
      <Input
        id={`preco-${id}`}
        inputMode="decimal"
        value={campos[id]}
        onChange={(e) => setCampos((c) => ({ ...c, [id]: e.target.value }))}
      />
      {invalido ? <p className="text-xs text-destructive">Valor inválido.</p> : null}
    </div>
  );

  const precoInvalido = campos.preco.trim() !== '' && parseReais(campos.preco) === null;
  const minimoInvalido = campos.minimo.trim() !== '' && parseReais(campos.minimo) === null;
  const triInvalido = campos.trimestral.trim() !== '' && porcentagem(campos.trimestral) === null;
  const anualInvalido = campos.anual.trim() !== '' && porcentagem(campos.anual) === null;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Preços</h1>
        <p className="mt-1 text-muted-foreground">
          Base do valor de tabela das campanhas e das propostas. Só o admin vê estes valores.
        </p>
      </div>

      {!isLoading && data === null ? (
        <p className="mb-4 rounded-md border p-3 text-sm text-muted-foreground">
          Hoje a landing anuncia R$ 150 por mês para a rede toda.
        </p>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Tabela</CardTitle></CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (tabela) salvar.mutate(tabela);
            }}
          >
            {campo('preco', 'Preço por TV por mês', precoInvalido)}
            {campo('minimo', 'Valor mínimo por mês', minimoInvalido)}
            {campo('trimestral', 'Desconto trimestral (%)', triInvalido)}
            {campo('anual', 'Desconto anual (%)', anualInvalido)}
            <p className="text-sm text-muted-foreground md:col-span-2" data-testid="exemplo-preco">
              {exemplo
                ? `${EXEMPLO.tvs} TVs × ${EXEMPLO.loopInsertions} inserções, anual: ${formatCents(exemplo.monthlyCents)} por mês (${formatCents(exemplo.totalCents)} no ano)`
                : 'Preencha o preço por TV para ver um exemplo.'}
            </p>
            <div className="md:col-span-2">
              <Button type="submit" disabled={!tabela || salvar.isPending}>Salvar preços</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
