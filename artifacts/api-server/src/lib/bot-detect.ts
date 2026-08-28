const BOT_PATTERNS = [
  "bot",
  "crawler",
  "spider",
  "preview",
  "facebookexternalhit",
  "whatsapp",
  "telegram",
  "slack",
  "discord",
  "curl",
  "wget",
  "python-requests",
  "headlesschrome",
];

export function isBotUserAgent(userAgent: string | undefined | null): boolean {
  if (!userAgent) return true;
  const value = userAgent.toLowerCase();
  return BOT_PATTERNS.some((pattern) => value.includes(pattern));
}
