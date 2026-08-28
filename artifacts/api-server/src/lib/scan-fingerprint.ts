import { createHash } from "node:crypto";

export function fingerprintFor(ip: string, userAgent: string | undefined | null): string {
  const salt = process.env.SCAN_SALT;
  if (!salt) {
    throw new Error("SCAN_SALT must be set to record scans");
  }
  return createHash("sha256").update(`${salt}|${ip}|${userAgent ?? ""}`).digest("hex");
}
