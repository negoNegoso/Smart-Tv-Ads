export interface PanelAuth {
  isAdmin: boolean;
  clientIds: number[];
}

/** Quem pode ler ou alterar um painel daquele cliente. */
export function canAccessPanel(auth: PanelAuth, panelClientId: number): boolean {
  if (auth.isAdmin) return true;
  return auth.clientIds.includes(panelClientId);
}

/**
 * Cliente dono do painel que está sendo criado, ou null quando a intenção é
 * ambígua ou proibida. Devolver null em vez de escolher um vínculo qualquer
 * evita criar o cardápio na loja errada de quem opera duas.
 */
export function resolveOwnerClientId(auth: PanelAuth, requested: number | undefined): number | null {
  if (requested !== undefined) {
    return canAccessPanel(auth, requested) ? requested : null;
  }
  if (auth.isAdmin) return null;
  return auth.clientIds.length === 1 ? auth.clientIds[0] : null;
}
