import DxfParser from 'dxf-parser';
import { wave } from '@patturn/patterns';
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { encodeEditorProject, decodeEditorProject } from '@patturn/storage';
import { referenceOuterProfile, revolve } from '@patturn/kernel';
import { toBuildZip, toDimensionPdf, BUNDLE_LIMITS, type BuildBundle } from './index.js';
const mesh = revolve(referenceOuterProfile(8), { segments: 16, closeBottom: true, closeTop: true });
const input = (): BuildBundle => ({
  project: 'گلدان',
  meshes: [{ path: 'parts/part-1.stl', mesh }],
  instructions: 'راهنمای فارسی؛ واحد mm',
  files: [{ path: 'BOM.txt', bytes: new TextEncoder().encode('گچ و آب') }],
});

describe('Build ZIP', () => {
  it('Z1: round-trip archive contains validated STL, UTF-8 guide, BOM and manifest', async () => {
    const data = input();
    const project = encodeEditorProject({
      profileMode: 'reference',
      segments: 96,
      wall: 4,
      shrink: 12,
      fill: 80,
      patternId: 'dot-grid',
      tileSize: 40,
    });
    data.files!.push({ path: 'project.patturn', bytes: project });
    const pdf = await toDimensionPdf(referenceOuterProfile(8));
    data.files!.push({ path: 'dimensions/profile.pdf', bytes: pdf.bytes! });
    const out = await toBuildZip(data);
    expect(out.ok, out.error).toBe(true);
    const entries = unzipSync(out.bytes!);
    expect(Object.keys(entries).sort()).toEqual([
      'BOM.txt',
      'README.txt',
      'dimensions/profile.pdf',
      'manifest.json',
      'parts/part-1.stl',
      'project.patturn',
    ]);
    expect(strFromU8(entries['README.txt']!)).toContain('راهنمای فارسی');
    const stl = entries['parts/part-1.stl']!;
    expect(stl.length).toBe(84 + (mesh.indices.length / 3) * 50);
    const manifest = JSON.parse(strFromU8(entries['manifest.json']!));
    expect(manifest.stlValidated).toBe(true);
    expect(manifest.units).toBe('mm');
    expect(entries['dimensions/profile.pdf']).toEqual(pdf.bytes);
    expect(decodeEditorProject(entries['project.patturn']!, ['dot-grid']).shrink).toBe(12);
    for (const file of manifest.files) expect(entries[file.path]!.length).toBe(file.bytes);
  });
  it('Z2: deterministic bytes for identical input', async () => {
    expect((await toBuildZip(input())).bytes).toEqual((await toBuildZip(input())).bytes);
  });
  it('Z3: one invalid part rejects the entire bundle', async () => {
    const data = input();
    data.meshes.push({
      path: 'bad.stl',
      mesh: { positions: new Float32Array(), indices: new Uint32Array() },
    });
    const result = await toBuildZip(data);
    expect(result.ok).toBe(false);
    expect(result.bytes).toBeUndefined();
    expect(result.error).toContain('MESH_INVALID');
  });
  it('Z4: rejects traversal, reserved names, collisions and unvalidated STL extras', async () => {
    for (const path of [
      '../evil.stl',
      '/evil.stl',
      'C:/evil.stl',
      'a\\evil.stl',
      'a//x.stl',
      'NUL.stl',
    ]) {
      const data = input();
      data.meshes[0]!.path = path;
      expect((await toBuildZip(data)).error).toContain('UNSAFE_PATH');
    }
    const data = input();
    data.files!.push({ path: 'readme.TXT', bytes: new Uint8Array() });
    expect((await toBuildZip(data)).error).toContain('DUPLICATE_PATH');
    data.files = [{ path: 'bad.stl', bytes: new Uint8Array() }];
    expect((await toBuildZip(data)).error).toContain('EXTRA_EXTENSION');
  });
  it('Z5: supports pre-cancel and active cancellation, no partial bytes', async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await toBuildZip(input(), controller.signal)).error).toBe('EXPORT_CANCELLED');
    const active = new AbortController();
    const pending = toBuildZip(input(), active.signal);
    active.abort();
    const result = await pending;
    expect(result.error).toBe('EXPORT_CANCELLED');
    expect(result.bytes).toBeUndefined();
  });
  it('Z6: validates named OBJ assemblies inside ZIP, rejecting invalid parts atomically', async () => {
    const data = input();
    data.assemblies = [
      {
        path: 'obj/mold.obj',
        parts: [
          { name: 'A', mesh },
          { name: 'B', mesh, color: [1, 0, 0] },
        ],
      },
    ];
    const result = await toBuildZip(data);
    expect(result.ok).toBe(true);
    const files = unzipSync(result.bytes!);
    const text = strFromU8(files['obj/mold.obj']!);
    expect(text).toContain('o 1-A');
    expect(text).toContain('o 2-B');
    data.assemblies[0]!.parts[1]!.mesh = {
      positions: new Float32Array(),
      indices: new Uint32Array(),
    };
    const invalid = await toBuildZip(data);
    expect(invalid.ok).toBe(false);
    expect(invalid.bytes).toBeUndefined();
    expect(invalid.error).toContain('MESH_INVALID');
  });

  it('Z7: builds clipped DXF inside ZIP, records it in manifest and round-trips through independent reader', async () => {
    const data = input();
    const paths = wave.build({
      canvasW: 80,
      canvasH: 80,
      tileW: 40,
      tileH: 40,
      seed: 42,
      params: { ...wave.defaults },
    });
    data.dxfPatterns = [
      {
        path: 'pattern/wave.dxf',
        paths,
        bounds: { width: 80, height: 80 },
        bezierToleranceMm: 0.05,
      },
    ];
    const result = await toBuildZip(data);
    expect(result.ok, result.error).toBe(true);
    const files = unzipSync(result.bytes!);
    const text = strFromU8(files['pattern/wave.dxf']!);
    expect(text).toContain('tolerance 0.05 mm');
    const doc = new DxfParser().parseSync(text)!;
    expect(doc.entities.length).toBeGreaterThan(0);
    expect(doc.entities.every((e) => e.type === 'LINE')).toBe(true);
    const manifest = JSON.parse(strFromU8(files['manifest.json']!));
    expect(manifest.files).toContainEqual({
      path: 'pattern/wave.dxf',
      bytes: files['pattern/wave.dxf']!.length,
    });
    expect((await toBuildZip(data)).bytes).toEqual(result.bytes);
  });
  it('Z8: rejects DXF curves without explicit approximation atomically and prevents raw DXF extras', async () => {
    const data = input();
    data.dxfPatterns = [
      {
        path: 'pattern/bad.dxf',
        paths: [{ d: 'M0 0Q10 10 20 0' }],
        bounds: { width: 80, height: 80 },
      },
    ];
    const invalid = await toBuildZip(data);
    expect(invalid.ok).toBe(false);
    expect(invalid.bytes).toBeUndefined();
    expect(invalid.error).toContain('DXF_QUADRATIC_REQUIRES_EXPLICIT_TOLERANCE');
    delete data.dxfPatterns;
    data.files!.push({ path: 'pattern/raw.dxf', bytes: new Uint8Array() });
    expect((await toBuildZip(data)).error).toContain('BUNDLE_EXTRA_EXTENSION');
  });
  it('Z9: subjects generated DXF paths to extension, traversal and collision checks', async () => {
    for (const path of ['pattern/bad.txt', '../bad.dxf', 'NUL.dxf']) {
      const data = input();
      data.dxfPatterns = [
        { path, paths: [{ d: 'M0 0L10 10' }], bounds: { width: 80, height: 80 } },
      ];
      expect((await toBuildZip(data)).ok).toBe(false);
    }
    const data = input();
    const item = {
      path: 'pattern/a.dxf',
      paths: [{ d: 'M0 0L10 10' }],
      bounds: { width: 80, height: 80 },
    };
    data.dxfPatterns = [item, { ...item, path: 'PATTERN/A.DXF' }];
    expect((await toBuildZip(data)).error).toContain('BUNDLE_DUPLICATE_PATH');
  });

  it('snapshots sidecar subarrays and project name before asynchronous compression', async () => {
    const backing = new Uint8Array(300_002);
    for (let i = 0; i < backing.length; i++) backing[i] = i % 251;
    const bytes = backing.subarray(1, -1),
      expected = bytes.slice();
    const data = input();
    data.project = 'original';
    data.files = [{ path: 'data.txt', bytes }];
    const pending = toBuildZip(data);
    backing.fill(42);
    data.project = 'changed';
    data.files[0]!.path = 'changed.txt';
    const result = await pending;
    expect(result.ok, result.error).toBe(true);
    const entries = unzipSync(result.bytes!);
    expect(entries['data.txt']).toEqual(expected);
    expect(entries['changed.txt']).toBeUndefined();
    expect(JSON.parse(strFromU8(entries['manifest.json']!)).project).toBe('original');
    expect(result.filename).toContain('original');
    expect(result.filename).not.toContain('changed');
    expect(backing.byteLength).toBe(300_002);
  });

  it.each([
    ['notes.txt', 'notes.txt/info.txt'],
    ['notes.txt/info.txt', 'notes.txt'],
    ['NOTES.TXT', 'notes.txt/info.txt'],
    ['café.txt/info.txt', 'cafe\u0301.txt'],
    ['README.txt/info.txt', 'other.txt'],
    ['manifest.json/info.txt', 'other.txt'],
  ])('rejects file/directory collisions for %s and %s', async (a, b) => {
    const data = input();
    data.files = [
      { path: a, bytes: new Uint8Array([1]) },
      { path: b, bytes: new Uint8Array([2]) },
    ];
    const result = await toBuildZip(data);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('BUNDLE_PATH_CONFLICT');
    expect(result.bytes).toBeUndefined();
  });
  it('allows shared directories and filenames that merely share a prefix', async () => {
    const data = input();
    data.files = [
      { path: 'notes.txt', bytes: new Uint8Array([1]) },
      { path: 'notes.txt.backup/info.txt', bytes: new Uint8Array([2]) },
      { path: 'notes.txt.backup/other.txt', bytes: new Uint8Array([3]) },
    ];
    const result = await toBuildZip(data);
    expect(result.ok, result.error).toBe(true);
    expect(unzipSync(result.bytes!)['notes.txt.backup/other.txt']).toEqual(new Uint8Array([3]));
  });

  it('counts generated README and manifest toward the archive entry budget', async () => {
    const data = input();
    data.files = Array.from({ length: BUNDLE_LIMITS.files - 2 }, (_, i) => ({
      path: `notes/${i}.txt`,
      bytes: new Uint8Array(),
    }));
    const result = await toBuildZip(data);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('BUNDLE_TOO_MANY_FILES');
    expect(result.bytes).toBeUndefined();
  });

  it('rejects an excessive file count before accessing any mesh payload', async () => {
    const data = input();
    Object.defineProperty(data.meshes[0]!, 'mesh', {
      get: () => {
        throw Error('MESH_SHOULD_NOT_BE_READ');
      },
    });
    data.files = Array.from({ length: BUNDLE_LIMITS.files }, (_, i) => ({
      path: `${i}.txt`,
      bytes: new Uint8Array(),
    }));
    const result = await toBuildZip(data);
    expect(result.error).toContain('BUNDLE_TOO_MANY_FILES');
    expect(result.bytes).toBeUndefined();
  });
  it('rejects excessive sidecar byte sizes before accessing mesh payloads or copying buffers', async () => {
    const data = input();
    Object.defineProperty(data.meshes[0]!, 'mesh', {
      get: () => {
        throw Error('MESH_SHOULD_NOT_BE_READ');
      },
    });
    // Synthetic size avoids a 64MiB test allocation; no byte data may be read or copied.
    const bytes = new Uint8Array();
    Object.defineProperty(bytes, 'byteLength', { value: BUNDLE_LIMITS.fileBytes + 1 });
    data.files = [{ path: 'large.txt', bytes }];
    const result = await toBuildZip(data);
    expect(result.error).toContain('BUNDLE_FILE_TOO_LARGE');
    expect(result.bytes).toBeUndefined();
  });

  it.each([
    [['../unsafe.txt'], 'BUNDLE_UNSAFE_PATH'],
    [['same.txt', 'SAME.TXT'], 'BUNDLE_DUPLICATE_PATH'],
    [['parent.txt/child.txt', 'parent.txt'], 'BUNDLE_PATH_CONFLICT'],
  ])('preflights sidecar paths %j before reading mesh data', (paths, code) => {
    const data = input();
    Object.defineProperty(data.meshes[0]!, 'mesh', {
      get: () => {
        throw Error('MESH_MUST_NOT_BE_READ');
      },
    });
    data.files = paths.map((path) => ({ path, bytes: new Uint8Array() }));
    return toBuildZip(data).then((result) => {
      expect(result.ok).toBe(false);
      expect(result.error).toContain(code);
      expect(result.bytes).toBeUndefined();
    });
  });

  it.each([
    'COM¹.txt',
    'com².txt',
    'CoM³.txt',
    'LPT¹.txt',
    'lpt².txt',
    'LPT³.txt',
    'folder/COM¹/report.txt',
  ])('rejects Windows superscript device alias %s', async (path) => {
    const data = input();
    data.files = [{ path, bytes: new Uint8Array() }];
    const result = await toBuildZip(data);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('BUNDLE_UNSAFE_PATH');
    expect(result.bytes).toBeUndefined();
  });
  it('permits ordinary names that merely resemble device aliases', async () => {
    const data = input();
    data.files = ['COM10.txt', 'LPT0.txt', 'my-COM1.txt', 'COM⁴.txt'].map((path) => ({
      path,
      bytes: new Uint8Array([1]),
    }));
    const result = await toBuildZip(data);
    expect(result.ok, result.error).toBe(true);
    expect(unzipSync(result.bytes!)['COM10.txt']).toEqual(new Uint8Array([1]));
  });
});

describe('generated orthogonal cutter DXF bundle boundaries', () => {
  const boundary = () => ({
    path: 'boundaries/cutter.dxf',
    points: [
      [0, 0],
      [80, 0],
      [80, 30],
      [30, 30],
      [30, 80],
      [0, 80],
    ] as [number, number][],
    options: { heightMm: 20, wallMm: 1.6, tipMm: 0.6 },
  });
  it('generates explicit mm DXF and accounts for it in the manifest', async () => {
    const result = await toBuildZip({ ...input(), orthogonalCutterBoundaries: [boundary()] });
    expect(result.ok, result.error).toBe(true);
    const files = unzipSync(result.bytes!),
      dxf = files['boundaries/cutter.dxf']!;
    expect(new DxfParser().parseSync(strFromU8(dxf))!.header['$INSUNITS']).toBe(4);
    expect(JSON.parse(strFromU8(files['manifest.json']!)).files).toContainEqual({
      path: 'boundaries/cutter.dxf',
      bytes: dxf.byteLength,
    });
  });
  it.each([
    {
      name: 'traversal',
      entry: { ...boundary(), path: '../cutter.dxf' },
      error: 'BUNDLE_UNSAFE_PATH',
    },
    {
      name: 'extension',
      entry: { ...boundary(), path: 'cutter.exe' },
      error: 'BUNDLE_DXF_EXTENSION',
    },
    {
      name: 'geometry',
      entry: { ...boundary(), options: { heightMm: 20, wallMm: 12, tipMm: 0.6 } },
      error: 'ORTHOGONAL_CUTTER_DXF_INVALID_GEOMETRY',
    },
  ])('rejects $name atomically', async ({ entry, error }) => {
    const result = await toBuildZip({ ...input(), orthogonalCutterBoundaries: [entry] });
    expect(result.ok).toBe(false);
    expect(result.bytes).toBeUndefined();
    expect(result.error).toContain(error);
  });
  it('applies duplicate and total file limits to generated boundaries', async () => {
    for (const [entries, error] of [
      [[boundary(), boundary()], 'BUNDLE_DUPLICATE_PATH'],
      [
        Array.from({ length: BUNDLE_LIMITS.files }, (_, i) => ({
          ...boundary(),
          path: `${i}.dxf`,
        })),
        'BUNDLE_TOO_MANY_FILES',
      ],
    ] as const) {
      const result = await toBuildZip({ ...input(), orthogonalCutterBoundaries: [...entries] });
      expect(result.ok).toBe(false);
      expect(result.bytes).toBeUndefined();
      expect(result.error).toContain(error);
    }
  });
  it('still rejects raw DXF sidecars rather than bypassing generated geometry validation', async () => {
    const result = await toBuildZip({
      ...input(),
      files: [{ path: 'raw.dxf', bytes: new TextEncoder().encode('not validated') }],
    });
    expect(result.ok).toBe(false);
    expect(result.bytes).toBeUndefined();
    expect(result.error).toContain('BUNDLE_EXTRA_EXTENSION');
  });
});
