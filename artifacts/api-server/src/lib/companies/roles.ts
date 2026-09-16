export interface CompanyDependencies {
  devices: number;
  panels: number;
  campaigns: number;
}

export interface RolePlan {
  createClient: boolean;
  removeClient: boolean;
  createAdvertiser: boolean;
  removeAdvertiser: boolean;
}

export type RoleDecision =
  | { ok: true; plan: RolePlan }
  | { ok: false; status: 400 | 409; error: string; dependencies?: CompanyDependencies };

/**
 * Traduz o que o formulário pediu em criar/remover perfil. Remover perfil com
 * TV, painel ou campanha apagaria tudo em cascata: isso é recusado aqui, e o
 * admin tira as dependências antes, de propósito.
 */
export function planRoles(
  current: { clientId: number | null; advertiserId: number | null },
  wanted: { isClient?: boolean; isAdvertiser?: boolean },
  deps: CompanyDependencies,
): RoleDecision {
  const hasClient = current.clientId !== null;
  const hasAdvertiser = current.advertiserId !== null;
  const willBeClient = wanted.isClient ?? hasClient;
  const willBeAdvertiser = wanted.isAdvertiser ?? hasAdvertiser;

  if (!willBeClient && !willBeAdvertiser) {
    return { ok: false, status: 400, error: "Marque cliente e/ou anunciante." };
  }

  const removeClient = hasClient && !willBeClient;
  const removeAdvertiser = hasAdvertiser && !willBeAdvertiser;

  if (removeClient && (deps.devices > 0 || deps.panels > 0)) {
    return {
      ok: false,
      status: 409,
      error: `Não dá para tirar o papel de cliente: tem ${deps.devices} TV(s) e ${deps.panels} painel(éis).`,
      dependencies: deps,
    };
  }
  if (removeAdvertiser && deps.campaigns > 0) {
    return {
      ok: false,
      status: 409,
      error: `Não dá para tirar o papel de anunciante: tem ${deps.campaigns} campanha(s).`,
      dependencies: deps,
    };
  }

  return {
    ok: true,
    plan: {
      createClient: !hasClient && willBeClient,
      removeClient,
      createAdvertiser: !hasAdvertiser && willBeAdvertiser,
      removeAdvertiser,
    },
  };
}

/** Motivo para recusar a exclusão, ou null quando pode excluir. */
export function deleteBlock(deps: CompanyDependencies): string | null {
  if (deps.devices === 0 && deps.panels === 0 && deps.campaigns === 0) return null;
  return `Não dá para excluir: a empresa tem ${deps.devices} TV(s), ${deps.panels} painel(éis) e ${deps.campaigns} campanha(s).`;
}
