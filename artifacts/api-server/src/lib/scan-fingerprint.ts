import { createHash } from "node:crypto";

export function fingerprintFor(ip: string, userAgent: string | undefined | null): string {
  const salt = process.env.SCAN_SALT ?? "";
  return createHash("sha256").update(`${salt}|${ip}|${userAgent ?? ""}`).digest("hex");
}
