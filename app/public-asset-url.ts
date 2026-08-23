export function resolvePublicAssetUrl(baseUrl: string, assetPath: string) {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, "");
  const normalizedPath = assetPath.trim().replace(/^\/+/, "");
  return `${normalizedBase}/${normalizedPath}`;
}
