// artifacts/api-server/src/lib/auth/admin-guard.ts

/**
 * A mudança tira do banco o último admin ativo? O admin do env não entra na
 * conta de propósito: ele é a reserva, não o dia a dia — e perder o último
 * admin do banco obrigaria alguém a usar a senha de emergência.
 */
export function removesLastAdmin(
  target: { isAdmin: boolean; isActive: boolean },
  change: { isAdmin?: boolean; isActive?: boolean; deleting?: boolean },
  activeAdmins: number,
): boolean {
  if (!(target.isAdmin && target.isActive)) return false;
  const staysActiveAdmin = !change.deleting && (change.isAdmin ?? true) && (change.isActive ?? true);
  return !staysActiveAdmin && activeAdmins <= 1;
}
