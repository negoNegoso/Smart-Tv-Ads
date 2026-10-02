import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateDevice, getGetDeviceQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { mensagemDeErro } from '@/lib/api-error';

/**
 * Música de fundo da TV: um link do YouTube que o player toca só em áudio,
 * por baixo das peças. Não é peça — não entra na playlist nem conta exibição.
 */
export function DeviceMusicField({ deviceId, musicUrl }: { deviceId: number; musicUrl: string | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [link, setLink] = useState(musicUrl ?? '');

  // O valor gravado chega depois do primeiro render e muda a cada salvar.
  useEffect(() => setLink(musicUrl ?? ''), [musicUrl]);

  const update = useUpdateDevice({
    mutation: {
      onSuccess: (d) => {
        queryClient.invalidateQueries({ queryKey: getGetDeviceQueryKey(deviceId) });
        toast({ title: d.musicUrl ? 'Música de fundo salva.' : 'Música de fundo removida.' });
      },
      // Sem mexer no campo: quem errou o link quer corrigir o que digitou.
      onError: (err) =>
        toast({
          title: mensagemDeErro(err, 'Não foi possível salvar a música de fundo'),
          variant: 'destructive',
        }),
    },
  });

  const digitado = link.trim();
  const mudou = digitado !== (musicUrl ?? '');

  return (
    <div className="mb-6 rounded-lg border px-3 py-2.5 text-sm">
      <label htmlFor="device-music" className="font-medium">Música de fundo (YouTube)</label>
      <p className="text-muted-foreground mb-2">
        Link de um vídeo ou de uma playlist. A TV toca só o áudio, em laço, e pausa nas peças com som.
      </p>
      <div className="flex items-center gap-2">
        <Input
          id="device-music"
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={link}
          disabled={update.isPending}
          onChange={(e) => setLink(e.target.value)}
        />
        <Button
          size="sm"
          disabled={update.isPending || !digitado || !mudou}
          onClick={() => update.mutate({ id: deviceId, data: { musicUrl: digitado } })}
        >
          Salvar
        </Button>
        {musicUrl && (
          <Button
            size="sm"
            variant="outline"
            disabled={update.isPending}
            onClick={() => update.mutate({ id: deviceId, data: { musicUrl: null } })}
          >
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}
