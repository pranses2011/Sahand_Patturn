import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  nativeFileAccess,
  isDesktop,
  desktopFiles,
  MAX_PROJECT_FILE_BYTES,
  type NativeFileDriver,
} from './index.js';
const setup = () => {
  const bytes = new Uint8Array([0, 1, 255]);
  const driver: NativeFileDriver = {
    saveDialog: vi.fn(async () => 'C:\\selected\\out.stl'),
    openProjectDialog: vi.fn(async () => 'C:\\selected\\project.patturn'),
    write: vi.fn(async () => {}),
    size: vi.fn(async () => bytes.length),
    read: vi.fn(async () => bytes),
  };
  return { driver, bytes, access: nativeFileAccess(driver) };
};
describe('Native file access adapter', () => {
  it('N1: saves exact binary bytes only to the picker-selected path', async () => {
    const { driver, bytes, access } = setup();
    expect(await access.save('قطعه_mesh_mm.stl', bytes)).toBe(true);
    expect(driver.saveDialog).toHaveBeenCalledWith('قطعه_mesh_mm.stl', 'stl');
    expect(driver.write).toHaveBeenCalledWith('C:\\selected\\out.stl', bytes);
  });
  it('N2: cancellation performs no write, stat or read', async () => {
    const { driver, bytes, access } = setup();
    driver.saveDialog = vi.fn(async () => null);
    driver.openProjectDialog = vi.fn(async () => null);
    expect(await access.save('test.pdf', bytes)).toBe(false);
    expect(await access.openProject()).toBeNull();
    expect(driver.write).not.toHaveBeenCalled();
    expect(driver.read).not.toHaveBeenCalled();
    expect(driver.size).not.toHaveBeenCalled();
  });
  it('N3: preserves read bytes, rejects oversized files before reading and after file replacement', async () => {
    const { driver, bytes, access } = setup();
    expect(await access.openProject()).toEqual(bytes);
    driver.size = vi.fn(async () => MAX_PROJECT_FILE_BYTES + 1);
    driver.read = vi.fn(async () => bytes);
    await expect(access.openProject()).rejects.toThrow('TOO_LARGE');
    expect(driver.read).not.toHaveBeenCalled();
    driver.size = vi.fn(async () => 2);
    driver.read = vi.fn(async () => new Uint8Array(MAX_PROJECT_FILE_BYTES + 1));
    await expect(access.openProject()).rejects.toThrow('TOO_LARGE');
  });
  it('N4: propagates write/read failures and rejects unsafe suggested filenames', async () => {
    const { driver, bytes, access } = setup();
    driver.write = vi.fn(async () => {
      throw new Error('disk full');
    });
    await expect(access.save('out.zip', bytes)).rejects.toThrow('disk full');
    for (const name of ['../x.stl', 'C:\\x.stl', 'x.exe'])
      await expect(access.save(name, bytes)).rejects.toThrow('UNSAFE_NAME');
    driver.read = vi.fn(async () => {
      throw new Error('access denied');
    });
    await expect(access.openProject()).rejects.toThrow('access denied');
  });
  it('N5: browser runtime never attempts a native dialog', async () => {
    expect(isDesktop()).toBe(false);
    await expect(desktopFiles()).rejects.toThrow('REQUIRE_TAURI');
  });
  it('N6: desktop window capability and frontend artifact paths match the monorepo', () => {
    const folder = fileURLToPath(new URL('../../../apps/desktop/src-tauri/', import.meta.url));
    const config = JSON.parse(readFileSync(path.join(folder, 'tauri.conf.json'), 'utf8'));
    const capability = JSON.parse(
      readFileSync(path.join(folder, 'capabilities/default.json'), 'utf8'),
    );
    expect(path.resolve(folder, config.build.frontendDist)).toBe(
      path.resolve(folder, '../../web/dist'),
    );
    expect(capability.windows).toContain(config.app.windows[0].label);
    for (const permission of [
      'fs:allow-read-file',
      'fs:allow-write-file',
      'fs:allow-stat',
      'dialog:default',
    ]) {
      expect(capability.permissions).toContain(permission);
    }
    expect(JSON.stringify(capability)).not.toContain('"**"');
    const scope = capability.permissions.find(
      (p: unknown) =>
        typeof p === 'object' && p !== null && 'identifier' in p && p.identifier === 'fs:scope',
    );
    expect(scope.allow.map((p: { path: string }) => p.path)).toEqual([
      '$APPLOCALDATA/backups',
      '$APPLOCALDATA/backups/**',
    ]);
  });

  it('N7: configured Windows icon exists and is a multi-size ICO', () => {
    const folder = fileURLToPath(new URL('../../../apps/desktop/src-tauri/', import.meta.url));
    const config = JSON.parse(readFileSync(path.join(folder, 'tauri.conf.json'), 'utf8'));
    for (const icon of config.bundle.icon) {
      const bytes = readFileSync(path.join(folder, icon));
      expect(bytes.readUInt16LE(0)).toBe(0);
      expect(bytes.readUInt16LE(2)).toBe(1);
      expect(bytes.readUInt16LE(4)).toBeGreaterThan(1);
    }
    expect(config.bundle.windows.nsis.languages).toContain('Farsi');
    expect(config.bundle.windows.nsis.languages).not.toContain('Persian');
  });
});
