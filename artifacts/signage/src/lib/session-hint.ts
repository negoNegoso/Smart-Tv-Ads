/** Exportada para o script inline do home.html pré-renderizado ler a mesma chave. */
export const SESSION_HINT_KEY = "signage:has-session";

/**
 * Dica de UX, jamais autorização.
 *
 * A sessão real só é conhecida depois de GET /api/auth/me. Sem essa dica, a
 * raiz teria que escolher entre mostrar um spinner para todo visitante anônimo
 * — a maioria — ou piscar a landing na cara de quem já está logado. Com ela,
 * cada público recebe o comportamento certo na primeira pintura.
 *
 * Quem decide o que o usuário pode ver continua sendo a API. Adulterar esta
 * chave no navegador não libera nada: no máximo troca um spinner por uma
 * landing.
 */
export function markSessionStarted(): void {
  try {
    localStorage.setItem(SESSION_HINT_KEY, "1");
  } catch {
    // Modo privado ou storage bloqueado: seguir sem a dica é aceitável.
  }
}

export function clearSessionHint(): void {
  try {
    localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // idem
  }
}

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === "1";
  } catch {
    return false;
  }
}
