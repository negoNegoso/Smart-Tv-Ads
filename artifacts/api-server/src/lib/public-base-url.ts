function withoutTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

/**
 * Origin embedded into generated QR codes. A printed QR outlives the deployment
 * that produced it, so an explicit domain always wins over the request host.
 */
export function publicBaseUrl(env: NodeJS.ProcessEnv, requestOrigin: string): string {
  if (env.PUBLIC_BASE_URL) return withoutTrailingSlash(env.PUBLIC_BASE_URL);
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return withoutTrailingSlash(requestOrigin);
}
