import { describe, it, expect } from 'vitest';
import { gzipSync, strToU8, gunzipSync } from 'fflate';
import { encodeEditorProject, decodeEditorProject, MAX_PROJECT_FILE_BYTES, MAX_PROJECT_JSON_BYTES } from './index.js';
import { SCHEMA_VERSION, type EditorState } from '@patturn/schema';
const state: EditorState = { profileMode: 'vase', segments: 96, wall: 4, shrink: 12, fill: 80, patternId: 'dot-grid', tileSize: 40 };
const pack = (o: unknown) => gzipSync(strToU8(JSON.stringify(o)));
const doc = () => ({ format: 'patturn-editor', version: 1, schemaVersion: SCHEMA_VERSION, unit: 'mm', state });

describe('Portable editor project', () => {
  it('S1: compressed deterministic round-trip preserves all implemented settings, no meshes', () => {
    const bytes = encodeEditorProject(state);
    expect(bytes).toEqual(encodeEditorProject(state));
    expect(decodeEditorProject(bytes, ['dot-grid'])).toEqual(state);
    expect(JSON.parse(new TextDecoder().decode(gunzipSync(bytes)))).toEqual(doc());
    expect(new TextDecoder().decode(gunzipSync(bytes))).not.toContain('positions');
  });
  it('S2: rejects future versions, wrong units, formats, unknown fields and unknown patterns', () => {
    for (const change of [{ version: 2 }, { schemaVersion: 999 }, { unit: 'in' }, { format: 'other' }, { mesh: {} }]) {
      expect(() => decodeEditorProject(pack({ ...doc(), ...change }), ['dot-grid'])).toThrow();
    }
    expect(() => decodeEditorProject(encodeEditorProject(state), ['stripes'])).toThrow('PROJECT_UNKNOWN_PATTERN');
  });
  it('S3: validates numeric bounds, enums and prevents nonfinite encoded input', () => {
    for (const change of [{ segments: 1 }, { segments: 12.5 }, { wall: 0 }, { shrink: 99 }, { fill: -1 }, { tileSize: 0 }, { profileMode: 'other' }, { fill: NaN }]) {
      expect(() => encodeEditorProject({ ...state, ...change } as EditorState)).toThrow();
      expect(() => decodeEditorProject(pack({ ...doc(), state: { ...state, ...change } }), ['dot-grid'])).toThrow();
    }
  });
  it('S4: rejects corrupt, truncated, non-gzip and malformed JSON', () => {
    const valid = encodeEditorProject(state);
    const corrupt = valid.slice(); corrupt[corrupt.length - 8]! ^= 1;
    expect(() => decodeEditorProject(corrupt, ['dot-grid'])).toThrow('PROJECT_CHECKSUM_MISMATCH');
    for (const bytes of [new Uint8Array(), strToU8('{}'), valid.slice(0, 20), gzipSync(strToU8('not json'))]) {
      expect(() => decodeEditorProject(bytes, ['dot-grid'])).toThrow();
    }
  });
  it('S5: limits compressed and decompressed sizes including highly compressible input', () => {
    expect(() => decodeEditorProject(new Uint8Array(MAX_PROJECT_FILE_BYTES + 1), ['dot-grid'])).toThrow('PROJECT_FILE_TOO_LARGE');
    expect(() => decodeEditorProject(gzipSync(strToU8(' '.repeat(MAX_PROJECT_JSON_BYTES + 1))), ['dot-grid'])).toThrow('PROJECT_JSON_TOO_LARGE');
  });
});
