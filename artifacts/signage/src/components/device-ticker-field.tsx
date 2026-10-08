import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateDevice, getGetDeviceQueryKey, getGetDevicePreviewQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { mensagemDeErro } from '@/lib/api-error';

/** Mesmos limites da API: o que dá para ler passando na frente da TV. */
const MAX_RECADOS = 5;
const MAX_CARACTERES = 80;

/**
 * Recados que correm na faixa do rodapé da TV. Campo vazio não vai para o
 * servidor; lista vazia tira a faixa.
 */
export function DeviceTickerField({ deviceId, messages }: { deviceId: number; messages: string[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [recados, setRecados] = useState<string[]>(messages);

  // O valor gravado chega depois do primeiro render e muda a cada salvar.
  useEffect(() => setRecados(messages), [messages]);

  const update = useUpdateDevice({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDeviceQueryKey(deviceId) });
        queryClient.invalidateQueries({ queryKey: getGetDevicePreviewQueryKey(deviceId) });
        toast({ title: 'Faixa salva.' });
      },
      // Sem mexer nos campos: quem errou quer corrigir o que digitou.
      onError: (err) =>
        toast({ title: mensagemDeErro(err, 'Não foi possível salvar a faixa'), variant: 'destructive' }),
    },
  });

  const limpos = recados.map((recado) => recado.trim()).filter((recado) => recado.length > 0);

  return (
    <div className="mb-6 rounded-lg border px-3 py-2.5 text-sm">
      <p className="font-medium">Faixa de recados</p>
      <p className="text-muted-foreground mb-2">
        Os recados correm no rodapé da TV, juntos, em loop. O anúncio encolhe um pouco para não ficar coberto.
      </p>
      <div className="space-y-2">
        {recados.map((recado, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={`Recado ${index + 1}`}
              maxLength={MAX_CARACTERES}
              value={recado}
              disabled={update.isPending}
              onChange={(e) => setRecados(recados.map((r, i) => (i === index ? e.target.value : r)))}
            />
            <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">{recado.length}/{MAX_CARACTERES}</span>
            <Button
              size="sm"
              variant="outline"
              aria-label={`Remover recado ${index + 1}`}
              disabled={update.isPending}
              onClick={() => setRecados(recados.filter((_, i) => i !== index))}
            >
              ✕
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {recados.length < MAX_RECADOS && (
          <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => setRecados([...recados, ''])}>
            + recado
          </Button>
        )}
        <Button
          size="sm"
          aria-label="Salvar recados"
          disabled={update.isPending}
          onClick={() => update.mutate({ id: deviceId, data: { tickerMessages: limpos } })}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}
