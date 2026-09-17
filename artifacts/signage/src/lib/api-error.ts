/**
 * Mensagem de erro para o usuário a partir de uma falha de API.
 *
 * O cliente gerado lança um `ApiError` com o corpo já parseado em `data`, mas a
 * classe não é exportada pelo pacote — e `companies-api.ts` tem um `ApiError`
 * próprio, de outra natureza. Por isso a leitura aqui é por formato, não por
 * `instanceof`: evita acoplar o front à classe e evita confusão de nomes.
 *
 * A regra é estreita de propósito. Só a duplicata, que o servidor nomeia, vira
 * frase específica; todo o resto cai no fallback. Mensagem de servidor em
 * inglês não vai para a tela, e um erro genérico nunca deve acusar uma causa
 * que ninguém verificou — foi assim que o toast antigo mandou gente procurar
 * duplicata onde havia outro defeito.
 */
export function mensagemDeErro(err: unknown, fallback: string): string {
  const data = (err as { data?: unknown } | null | undefined)?.data;
  const bruto = data && typeof data === "object" ? (data as { error?: unknown }).error : undefined;
  const mensagem = typeof bruto === "string" ? bruto.trim() : "";

  if (mensagem === "Announcement already in playlist") return "Essa peça já está na playlist.";

  return fallback;
}
