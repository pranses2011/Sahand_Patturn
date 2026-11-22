export const RELEASE_API =
  'https://api.github.com/repos/pranses2011/Sahand_Patturn/releases/latest';
export const RELEASES_URL = 'https://github.com/pranses2011/Sahand_Patturn/releases';
function version(tag: string): number[] {
  if (!/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag))
    throw Error('UPDATE_INVALID_VERSION');
  const parts = tag.replace(/^v/, '').split('.').map(Number);
  if (parts.some((n) => !Number.isSafeInteger(n))) throw Error('UPDATE_INVALID_VERSION');
  return parts;
}
export type UpdateResult =
  | { kind: 'none' }
  | { kind: 'current'; version: string }
  | {
      kind: 'available';
      version: string;
      releaseUrl: string;
      installers: { name: string; url: string; size: number }[];
    };
export function parseRelease(value: unknown, currentVersion: string): UpdateResult {
  const current = version(currentVersion);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('UPDATE_INVALID_RELEASE');
  const release = value as Record<string, unknown>;
  if (
    release.draft !== false ||
    release.prerelease !== false ||
    typeof release.tag_name !== 'string'
  )
    throw Error('UPDATE_INVALID_RELEASE');
  const latest = version(release.tag_name);
  const newer = latest.some(
    (n, i) => n > current[i]! && latest.slice(0, i).every((m, j) => m === current[j]),
  );
  if (!newer) return { kind: 'current', version: release.tag_name };
  if (!Array.isArray(release.assets) || release.assets.length > 100)
    throw Error('UPDATE_INVALID_RELEASE');
  const tag = encodeURIComponent(release.tag_name);
  const installers: { name: string; url: string; size: number }[] = [];
  for (const asset of release.assets) {
    if (!asset || typeof asset !== 'object') continue;
    const item = asset as Record<string, unknown>;
    if (
      typeof item.name !== 'string' ||
      !/^[-a-zA-Z0-9_. ]{1,160}\.(exe|msi)$/.test(item.name) ||
      !Number.isSafeInteger(item.size) ||
      Number(item.size) <= 0 ||
      Number(item.size) > 1024 ** 3
    )
      continue;
    // Construct a trusted repository URL; never follow a URL supplied in JSON.
    installers.push({
      name: item.name,
      size: Number(item.size),
      url: `${RELEASES_URL}/download/${tag}/${encodeURIComponent(item.name)}`,
    });
  }
  return {
    kind: 'available',
    version: release.tag_name,
    releaseUrl: `${RELEASES_URL}/tag/${tag}`,
    installers,
  };
}
/** Explicit user action only; no credentials or local project/profile information. */
export async function checkForUpdate(
  currentVersion: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<UpdateResult> {
  const response = await request(RELEASE_API, {
    signal,
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (response.status === 404) return { kind: 'none' };
  if (!response.ok) throw Error('UPDATE_NETWORK');
  const length = response.headers.get('content-length');
  if (length && Number(length) > 262144) throw Error('UPDATE_TOO_LARGE');
  if (!response.body) throw Error('UPDATE_INVALID_RELEASE');
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 262144) throw Error('UPDATE_TOO_LARGE');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return parseRelease(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    currentVersion,
  );
}
