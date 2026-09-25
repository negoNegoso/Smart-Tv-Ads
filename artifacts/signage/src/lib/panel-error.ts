export interface PanelErrorInfo {
  status?: number;
  message?: string;
}

/**
 * Lê status e mensagem específica de um erro de mutation do painel.
 *
 * O cliente gerado lança um erro com o corpo já parseado em `data`, mas a
 * classe (`ApiError`) não é exportada pelo pacote — por isso a leitura é por
 * formato, não por `instanceof` (mesma técnica de portal-panels.tsx).
 *
 * Compartilhado entre `pages/portal-panel-editor.tsx` (painéis antigos) e
 * `components/flyer/flyer-editor.tsx` (encarte) para não duplicar a leitura
 * do formato de erro — e para não criar import circular entre os dois
 * editores, já que nenhum dos dois importa do outro.
 */
export function panelErrorInfo(error: unknown): PanelErrorInfo {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return {};
  }
  const status = (error as { status: unknown }).status;
  const data = 'data' in error ? (error as { data: unknown }).data : undefined;
  const message =
    data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
      ? (data as { error: string }).error
      : undefined;
  return { status: typeof status === 'number' ? status : undefined, message };
}
