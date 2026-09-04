const ROOT = '/';

/**
 * Um caminho só é destino aceitável se for interno. `//evil.com` é uma URL
 * protocol-relative: passa num teste ingênuo de "começa com /" e leva o usuário
 * para fora do site depois do login.
 */
function isInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}

/**
 * Para onde mandar quem caiu numa rota protegida sem sessão. O destino viaja na
 * query porque o /login é uma rota de verdade agora — sem isso, todo deep link
 * (bookmark, `/advertisers/:id` compartilhado) termina na raiz depois do login.
 */
export function loginPathFor(path: string, search = ''): string {
  const target = `${path}${search}`;
  if (!isInternalPath(path) || target === ROOT) return '/login';
  return `/login?next=${encodeURIComponent(target)}`;
}

export function readNextPath(search: string): string {
  const raw = new URLSearchParams(search).get('next');
  return raw && isInternalPath(raw) ? raw : ROOT;
}
