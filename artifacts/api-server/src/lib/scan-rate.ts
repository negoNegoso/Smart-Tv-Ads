export function scanRate(scans: number, plays: number): number {
  if (!plays || plays <= 0) return 0;
  return scans / plays;
}
