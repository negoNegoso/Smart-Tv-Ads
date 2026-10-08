/**
 * Espaço em disco que o app Android informa a cada busca do feed, no
 * cabeçalho `X-Signage-Storage`. O valor vem de um aparelho na loja: tudo que
 * não for exatamente o formato esperado é ignorado (sem 400 — a TV não pode
 * parar de receber a programação por causa de um cabeçalho ruim).
 */
export type DeviceStorage = { freeBytes: number; totalBytes: number; cacheBytes: number; cacheFiles: number };

/** Mesmo valor da reserva do app (ArteCache): abaixo disso o box corre risco de travar. */
export const LOW_STORAGE_BYTES = 500 * 1024 * 1024;

const INT4_MAX = 2147483647;

// Até 15 dígitos: cabe com folga em Number sem perder precisão (bigint no banco).
const INTEIRO = /^\d{1,15}$/;

export function parseStorageHeader(value: string | null | undefined): DeviceStorage | null {
  if (!value) return null;
  const campos = new Map<string, string>();
  for (const parte of value.split(";")) {
    const igual = parte.indexOf("=");
    if (igual === -1) continue;
    campos.set(parte.slice(0, igual).trim(), parte.slice(igual + 1).trim());
  }
  const numero = (chave: string): number | null => {
    const bruto = campos.get(chave);
    return bruto !== undefined && INTEIRO.test(bruto) ? Number(bruto) : null;
  };
  const freeBytes = numero("livre");
  const totalBytes = numero("total");
  const cacheBytes = numero("cache");
  const cacheFiles = numero("arquivos");
  if (freeBytes === null || totalBytes === null || cacheBytes === null || cacheFiles === null) return null;
  if (freeBytes > totalBytes || cacheFiles > INT4_MAX) return null;
  return { freeBytes, totalBytes, cacheBytes, cacheFiles };
}

/** Pouco espaço: abaixo da reserva do app ou de 10% do disco. Sem leitura, não marca. */
export function lowStorage(freeBytes: number | null, totalBytes: number | null): boolean {
  if (freeBytes === null || totalBytes === null) return false;
  return freeBytes < LOW_STORAGE_BYTES || freeBytes < totalBytes * 0.1;
}

export type DeviceStorageView = DeviceStorage & { reportedAt: string; low: boolean };

/** O que o admin vê. Null = a TV nunca mandou leitura (navegador ou APK antigo). */
export function storageView(row: {
  storageFreeBytes: number | null;
  storageTotalBytes: number | null;
  cacheBytes: number | null;
  cacheFiles: number | null;
  storageReportedAt: Date | null;
}): DeviceStorageView | null {
  if (
    row.storageFreeBytes === null ||
    row.storageTotalBytes === null ||
    row.cacheBytes === null ||
    row.cacheFiles === null ||
    row.storageReportedAt === null
  ) {
    return null;
  }
  return {
    freeBytes: row.storageFreeBytes,
    totalBytes: row.storageTotalBytes,
    cacheBytes: row.cacheBytes,
    cacheFiles: row.cacheFiles,
    reportedAt: row.storageReportedAt.toISOString(),
    low: lowStorage(row.storageFreeBytes, row.storageTotalBytes),
  };
}
