export function resolvePublicAssetUrl(baseUrl: string, assetPath: string) {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, "");
  const normalizedPath = assetPath.trim().replace(/^\/+/, "");
  return `${normalizedBase}/${normalizedPath}`;
}

/**
 * Resolve a file from `public/` against the active Vite base path.
 *
 * Local builds use `/`, while GitHub Pages uses `/Echoes/`. The optional
 * access keeps direct Node test imports working outside Vite as well.
 */
export function resolveRuntimePublicAssetUrl(assetPath: string) {
  const baseUrl = typeof import.meta.env?.BASE_URL === "string"
    ? import.meta.env.BASE_URL
    : "/";
  return resolvePublicAssetUrl(baseUrl, assetPath);
}
