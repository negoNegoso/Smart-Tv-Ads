import { parseYouTubeUrl } from "@workspace/db/youtube";
import type { AnnouncementOrientation } from "@workspace/db/orientation";

export type YouTubeMeta = {
  kind: "youtube_video" | "youtube_playlist";
  id: string;
  orientation: AnnouncementOrientation;
};

/**
 * Tipo, ID e orientação de um link do YouTube, para o formulário do admin
 * mostrar o preview no formato certo antes de salvar.
 *
 * O plano original consultava o oEmbed do YouTube pra descobrir a proporção
 * do vídeo (`width`/`height`). A sondagem (corpo do commit) mostrou que o
 * oEmbed sempre devolve uma proporção "deitada" (largura > altura), inclusive
 * para Shorts públicos reais — não dá pra usar isso pra decidir orientação.
 * Por isso só o link `/shorts/` marca vertical; todo o resto (playlist,
 * watch?v= comum) é landscape e o operador corrige no seletor manual do
 * formulário.
 *
 * `fetchImpl` continua no contrato da função (não é mais usado aqui) pra não
 * quebrar quem já chama passando um fetch de teste.
 */
export async function detectYouTubeMeta(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<YouTubeMeta | null> {
  void fetchImpl;

  const ref = parseYouTubeUrl(url);
  if (!ref) return null;
  if (ref.kind === "youtube_playlist") return { ...ref, orientation: "landscape" };

  // Link de Short já diz o formato; não depende de rede.
  if (/\/shorts\//.test(new URL(url.trim()).pathname)) return { ...ref, orientation: "portrait" };

  return { ...ref, orientation: "landscape" };
}
