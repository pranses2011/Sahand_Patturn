import { describe, it, expect, vi } from 'vitest';
import { parseRelease, checkForUpdate, RELEASE_API } from './update-check';
const release = (tag_name = 'v0.2.0') => ({
  tag_name,
  draft: false,
  prerelease: false,
  assets: [
    {
      name: 'Patturn_0.2.0_x64.exe',
      size: 2048,
      browser_download_url: 'https://evil.invalid/installer.exe',
    },
  ],
});
describe('Explicit optional stable update check', () => {
  it('compares numeric version components and never accepts JSON download URLs', () => {
    const result = parseRelease(release('v0.10.0'), '0.9.0');
    expect(result.kind).toBe('available');
    if (result.kind === 'available')
      expect(result.installers[0]!.url).toBe(
        'https://github.com/pranses2011/Sahand_Patturn/releases/download/v0.10.0/Patturn_0.2.0_x64.exe',
      );
    for (const tag of ['v0.1.0', 'v0.0.9'])
      expect(parseRelease(release(tag), '0.1.0').kind).toBe('current');
    expect(parseRelease(release('v1.0.0'), '0.99.99').kind).toBe('available');
  });
  it.each(['v0.2.0-beta', '01.2.0', 'v1.2', 'https://evil.invalid', '1.2.9007199254740992'])(
    'rejects noncanonical stable version %s',
    (tag) => {
      expect(() => parseRelease(release(tag), '0.1.0')).toThrow();
    },
  );
  it('rejects prerelease/draft data and filters unsafe installer names or sizes', () => {
    for (const key of ['draft', 'prerelease'])
      expect(() => parseRelease({ ...release(), [key]: true }, '0.1.0')).toThrow();
    const result = parseRelease(
      {
        ...release(),
        assets: [
          { name: '../bad.exe', size: 1 },
          { name: 'a.exe', size: 0 },
          { name: 'a.exe', size: 1024 ** 3 + 1 },
          { name: 'a.zip', size: 10 },
          { name: 'a.msi', size: 100 },
        ],
      },
      '0.1.0',
    );
    expect(result.kind).toBe('available');
    if (result.kind === 'available')
      expect(result.installers.map((item) => item.name)).toEqual(['a.msi']);
  });
  it('requests only the fixed endpoint, without credentials, with the caller abort signal', async () => {
    const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify(release()))),
      controller = new AbortController();
    expect((await checkForUpdate('0.1.0', controller.signal, request)).kind).toBe('available');
    expect(request).toHaveBeenCalledWith(
      RELEASE_API,
      expect.objectContaining({
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
      }),
    );
  });
  it('handles no releases and rejects network errors, bad JSON and oversized bodies', async () => {
    const signal = new AbortController().signal;
    expect(
      await checkForUpdate(
        '0.1.0',
        signal,
        vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 })),
      ),
    ).toEqual({ kind: 'none' });
    for (const response of [
      new Response('', { status: 403 }),
      new Response('{broken'),
      new Response(' '.repeat(262145)),
      new Response('{}', { headers: { 'content-length': '262145' } }),
    ]) {
      await expect(
        checkForUpdate('0.1.0', signal, vi.fn<typeof fetch>().mockResolvedValue(response)),
      ).rejects.toThrow();
    }
  });
});
