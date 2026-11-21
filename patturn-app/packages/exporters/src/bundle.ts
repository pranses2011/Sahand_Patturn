import { zip, strToU8, type Zippable } from 'fflate';
import type { Mesh } from '@patturn/kernel';
import { toObj, type ObjPart } from './obj.js';
import { toBinaryStl, exportName, type ExportResult } from './index.js';

export interface BuildBundle {
  project: string;
  meshes: { path: string; mesh: Mesh }[];
  files?: { path: string; bytes: Uint8Array }[];
  instructions: string;
  assemblies?: { path: string; parts: ObjPart[] }[];
}

/** Atomic archive: all STL inputs validated before compression/download. */
export async function toBuildZip(input: BuildBundle, signal?: AbortSignal): Promise<ExportResult> {
  const fail = (error: string): ExportResult => ({ ok: false, filename: '', error });
  if (signal?.aborted) return fail('EXPORT_CANCELLED');
  if (!input.meshes.length) return fail('BUNDLE_NO_MESHES');
  const entries = new Map<string, Uint8Array>();
  const paths = new Set<string>(['readme.txt', 'manifest.json']);
  const add = (path: string, bytes: Uint8Array) => {
    // Reject traversal, Windows drive/ADS syntax, controls and unsafe segments.
    if (!path || path.includes('\\') || /[:\x00-\x1f\x7f]/.test(path) ||
        path.split('/').some((p) => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /[<>"|?*]/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p))) {
      throw new Error(`BUNDLE_UNSAFE_PATH:${path}`);
    }
    const key = path.normalize('NFC').toLowerCase();
    if (paths.has(key)) throw new Error(`BUNDLE_DUPLICATE_PATH:${path}`);
    paths.add(key);
    entries.set(path, bytes);
  };
  try {
    for (const item of input.meshes) {
      if (!item.path.toLowerCase().endsWith('.stl')) throw new Error('BUNDLE_STL_EXTENSION');
      const output = toBinaryStl(item.mesh, item.path);
      if (!output.ok) throw new Error(`${item.path}:${output.error}`);
      add(item.path, output.bytes!);
    }
    for (const item of input.assemblies ?? []) {
      if (!item.path.toLowerCase().endsWith('.obj')) throw new Error('BUNDLE_OBJ_EXTENSION');
      const output = toObj(item.parts, input.project);
      if (!output.ok) throw new Error(`${item.path}:${output.error}`);
      add(item.path, output.bytes!);
    }
    for (const item of input.files ?? []) {
      // Extra files must not bypass STL validation or introduce arbitrary archives.
      if (!/\.(txt|json|svg|pdf)$/i.test(item.path)) throw new Error('BUNDLE_EXTRA_EXTENSION');
      add(item.path, item.bytes);
    }
    entries.set('README.txt', strToU8('\uFEFF' + input.instructions));
    entries.set('manifest.json', strToU8(JSON.stringify({
      version: 1, project: input.project, units: 'mm',
      stlValidated: true,
      objValidated: true,
      files: [...entries].map(([path, bytes]) => ({ path, bytes: bytes.length })).sort((a, b) => a.path < b.path ? -1 : 1),
    }, null, 2)));
  } catch (e) { return fail(String(e)); }
  if (signal?.aborted) return fail('EXPORT_CANCELLED');
  const archive: Zippable = {};
  for (const [path, bytes] of [...entries].sort(([a], [b]) => a < b ? -1 : 1)) {
    archive[path] = [bytes, { mtime: new Date(2000, 0, 1), level: 6 }];
  }
  return new Promise((resolve) => {
    let done = false;
    let cancel: (() => void) | undefined;
    const finish = (output: ExportResult) => {
      if (done) return;
      done = true;
      signal?.removeEventListener('abort', abort);
      resolve(output);
    };
    const abort = () => { cancel?.(); finish(fail('EXPORT_CANCELLED')); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      cancel = zip(archive, { level: 6 }, (error, bytes) => {
        if (error) finish(fail(`ZIP_FAILED:${error.message}`));
        else finish({ ok: true, filename: exportName(input.project, 'build', 'mm', 'zip'), bytes });
      });
      if (signal?.aborted) abort();
    } catch (e) { finish(fail(`ZIP_FAILED:${String(e)}`)); }
  });
}
