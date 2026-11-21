import { isTauri } from '@tauri-apps/api/core';
import { MAX_PROJECT_FILE_BYTES } from './portable.js';

export interface NativeFileDriver {
  saveDialog(filename: string, extension: string): Promise<string | null>;
  openProjectDialog(): Promise<string | null>;
  write(path: string, bytes: Uint8Array): Promise<void>;
  size(path: string): Promise<number>;
  read(path: string): Promise<Uint8Array>;
}
const OUTPUT_EXTENSIONS = new Set(['stl', 'svg', 'dxf', 'pdf', 'obj', 'zip', 'txt', 'json', 'patturn']);

/** No ambient filesystem scope: paths must come from the native picker. */
export function nativeFileAccess(driver: NativeFileDriver) {
  return {
    async save(filename: string, bytes: Uint8Array): Promise<boolean> {
      const extension = filename.split('.').at(-1)?.toLowerCase() ?? '';
      if (!OUTPUT_EXTENSIONS.has(extension) || /[\\/:\x00-\x1f]/.test(filename)) throw new Error('FILE_UNSAFE_NAME');
      const path = await driver.saveDialog(filename, extension);
      if (path === null) return false;
      await driver.write(path, bytes);
      return true;
    },
    async openProject(): Promise<Uint8Array | null> {
      const path = await driver.openProjectDialog();
      if (path === null) return null;
      const size = await driver.size(path);
      if (!Number.isFinite(size) || size < 0 || size > MAX_PROJECT_FILE_BYTES) throw new Error('PROJECT_FILE_TOO_LARGE');
      const bytes = await driver.read(path);
      // Recheck after read in case the selected file changed after stat.
      if (bytes.length > MAX_PROJECT_FILE_BYTES) throw new Error('PROJECT_FILE_TOO_LARGE');
      return bytes;
    },
  };
}

export const isDesktop = () => isTauri();
export async function desktopFiles() {
  if (!isDesktop()) throw new Error('NATIVE_FILES_REQUIRE_TAURI');
  const [dialog, fs] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
  return nativeFileAccess({
    saveDialog: (filename, extension) => dialog.save({
      title: 'ذخیرهٔ خروجی', defaultPath: filename,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    }),
    openProjectDialog: async () => {
      const result = await dialog.open({ title: 'بازکردن پروژه', multiple: false, directory: false, filters: [{ name: 'Patturn', extensions: ['patturn'] }] });
      if (Array.isArray(result)) throw new Error('EXPECTED_ONE_PROJECT');
      return result;
    },
    write: (path, bytes) => fs.writeFile(path, bytes),
    size: async (path) => (await fs.stat(path)).size,
    read: (path) => fs.readFile(path),
  });
}
