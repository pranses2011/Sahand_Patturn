import DxfParser from 'dxf-parser';
import { wave } from '@patturn/patterns';
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { encodeEditorProject, decodeEditorProject } from '@patturn/storage';
import { referenceOuterProfile, revolve } from '@patturn/kernel';
import { toBuildZip, toDimensionPdf, type BuildBundle } from './index.js';
const mesh = revolve(referenceOuterProfile(8), { segments: 16, closeBottom: true, closeTop: true });
const input = (): BuildBundle => ({ project: 'گلدان', meshes: [{ path: 'parts/part-1.stl', mesh }], instructions: 'راهنمای فارسی؛ واحد mm', files: [{ path: 'BOM.txt', bytes: new TextEncoder().encode('گچ و آب') }] });

describe('Build ZIP', () => {
  it('Z1: round-trip archive contains validated STL, UTF-8 guide, BOM and manifest', async () => {
    const data = input();
    const project = encodeEditorProject({ profileMode: 'reference', segments: 96, wall: 4, shrink: 12, fill: 80, patternId: 'dot-grid', tileSize: 40 });
    data.files!.push({ path: 'project.patturn', bytes: project });
    const pdf = await toDimensionPdf(referenceOuterProfile(8));
    data.files!.push({ path: 'dimensions/profile.pdf', bytes: pdf.bytes! });
    const out = await toBuildZip(data);
    expect(out.ok, out.error).toBe(true);
    const entries = unzipSync(out.bytes!);
    expect(Object.keys(entries).sort()).toEqual(['BOM.txt', 'README.txt', 'dimensions/profile.pdf', 'manifest.json', 'parts/part-1.stl', 'project.patturn']);
    expect(strFromU8(entries['README.txt']!)).toContain('راهنمای فارسی');
    const stl = entries['parts/part-1.stl']!;
    expect(stl.length).toBe(84 + mesh.indices.length / 3 * 50);
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
    data.meshes.push({ path: 'bad.stl', mesh: { positions: new Float32Array(), indices: new Uint32Array() } });
    const result = await toBuildZip(data);
    expect(result.ok).toBe(false);
    expect(result.bytes).toBeUndefined();
    expect(result.error).toContain('MESH_INVALID');
  });
  it('Z4: rejects traversal, reserved names, collisions and unvalidated STL extras', async () => {
    for (const path of ['../evil.stl', '/evil.stl', 'C:/evil.stl', 'a\\evil.stl', 'a//x.stl', 'NUL.stl']) {
      const data = input(); data.meshes[0]!.path = path;
      expect((await toBuildZip(data)).error).toContain('UNSAFE_PATH');
    }
    const data = input();
    data.files!.push({ path: 'readme.TXT', bytes: new Uint8Array() });
    expect((await toBuildZip(data)).error).toContain('DUPLICATE_PATH');
    data.files = [{ path: 'bad.stl', bytes: new Uint8Array() }];
    expect((await toBuildZip(data)).error).toContain('EXTRA_EXTENSION');
  });
  it('Z5: supports pre-cancel and active cancellation, no partial bytes', async () => {
    const controller = new AbortController(); controller.abort();
    expect((await toBuildZip(input(), controller.signal)).error).toBe('EXPORT_CANCELLED');
    const active = new AbortController();
    const pending = toBuildZip(input(), active.signal); active.abort();
    const result = await pending;
    expect(result.error).toBe('EXPORT_CANCELLED');
    expect(result.bytes).toBeUndefined();
  });
  it('Z6: validates named OBJ assemblies inside ZIP, rejecting invalid parts atomically', async () => {
    const data = input();
    data.assemblies = [{ path: 'obj/mold.obj', parts: [{ name: 'A', mesh }, { name: 'B', mesh, color: [1, 0, 0] }] }];
    const result = await toBuildZip(data);
    expect(result.ok).toBe(true);
    const files = unzipSync(result.bytes!);
    const text = strFromU8(files['obj/mold.obj']!);
    expect(text).toContain('o 1-A'); expect(text).toContain('o 2-B');
    data.assemblies[0]!.parts[1]!.mesh = { positions: new Float32Array(), indices: new Uint32Array() };
    const invalid = await toBuildZip(data);
    expect(invalid.ok).toBe(false); expect(invalid.bytes).toBeUndefined();
    expect(invalid.error).toContain('MESH_INVALID');
  });

  it('Z7: builds clipped DXF inside ZIP, records it in manifest and round-trips through independent reader', async () => {
    const data = input();
    const paths = wave.build({canvasW:80,canvasH:80,tileW:40,tileH:40,seed:42,params:{...wave.defaults}});
    data.dxfPatterns = [{path:'pattern/wave.dxf', paths, bounds:{width:80,height:80}, bezierToleranceMm:.05}];
    const result = await toBuildZip(data);
    expect(result.ok,result.error).toBe(true);
    const files = unzipSync(result.bytes!);
    const text = strFromU8(files['pattern/wave.dxf']!);
    expect(text).toContain('tolerance 0.05 mm');
    const doc = new DxfParser().parseSync(text)!;
    expect(doc.entities.length).toBeGreaterThan(0);
    expect(doc.entities.every((e)=>e.type==='LINE')).toBe(true);
    const manifest=JSON.parse(strFromU8(files['manifest.json']!));
    expect(manifest.files).toContainEqual({path:'pattern/wave.dxf',bytes:files['pattern/wave.dxf']!.length});
    expect((await toBuildZip(data)).bytes).toEqual(result.bytes);
  });
  it('Z8: rejects invalid DXF geometry atomically and prevents raw DXF extras', async () => {
    const data=input();
    data.dxfPatterns=[{path:'pattern/bad.dxf',paths:[{d:'M0 0Q10 10 20 0'}],bounds:{width:80,height:80}}];
    const invalid=await toBuildZip(data);
    expect(invalid.ok).toBe(false);expect(invalid.bytes).toBeUndefined();expect(invalid.error).toContain('DXF_UNSUPPORTED_COMMAND');
    delete data.dxfPatterns;
    data.files!.push({path:'pattern/raw.dxf',bytes:new Uint8Array()});
    expect((await toBuildZip(data)).error).toContain('BUNDLE_EXTRA_EXTENSION');
  });
  it('Z9: subjects generated DXF paths to extension, traversal and collision checks', async () => {
    for(const path of ['pattern/bad.txt','../bad.dxf','NUL.dxf']){
      const data=input();data.dxfPatterns=[{path,paths:[{d:'M0 0L10 10'}],bounds:{width:80,height:80}}];
      expect((await toBuildZip(data)).ok).toBe(false);
    }
    const data=input();const item={path:'pattern/a.dxf',paths:[{d:'M0 0L10 10'}],bounds:{width:80,height:80}};
    data.dxfPatterns=[item,{...item,path:'PATTERN/A.DXF'}];
    expect((await toBuildZip(data)).error).toContain('BUNDLE_DUPLICATE_PATH');
  });

});
