import { gzipSync, Gunzip, strToU8 } from 'fflate';
import { EditorState, PortableEditorProject, SCHEMA_VERSION } from '@patturn/schema';

export const MAX_PROJECT_FILE_BYTES = 256 * 1024;
export const MAX_PROJECT_JSON_BYTES = 64 * 1024;

/** Portable preset-editor document. Geometry is regenerated, never serialized. */
export function encodeEditorProject(state: EditorState): Uint8Array {
  const document = PortableEditorProject.parse({
    format: 'patturn-editor', version: 1, schemaVersion: SCHEMA_VERSION, unit: 'mm', state,
  });
  return gzipSync(strToU8(JSON.stringify(document)), { level: 6, mtime: 0 });
}

/** Bounded incremental inflate; reject unknown versions/fields before applying state. */
export function decodeEditorProject(bytes: Uint8Array, knownPatternIds: readonly string[]): EditorState {
  if (bytes.length > MAX_PROJECT_FILE_BYTES) throw new Error('PROJECT_FILE_TOO_LARGE');
  if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error('PROJECT_NOT_GZIP');
  const chunks: Uint8Array[] = [];
  let length = 0;
  const stream = new Gunzip((chunk) => {
    length += chunk.length;
    if (length > MAX_PROJECT_JSON_BYTES) throw new Error('PROJECT_JSON_TOO_LARGE');
    chunks.push(chunk);
  });
  // Small compressed chunks bound transient inflate allocations for untrusted files.
  for (let offset = 0; offset < bytes.length; offset += 64) {
    stream.push(bytes.subarray(offset, offset + 64), offset + 64 >= bytes.length);
  }
  const plain = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { plain.set(chunk, offset); offset += chunk.length; }
  // fflate's raw inflater does not verify the gzip trailer checksum for us.
  const trailer = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - 8, 8);
  let crc = 0xffffffff;
  for (const byte of plain) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  if (((crc ^ 0xffffffff) >>> 0) !== trailer.getUint32(0, true) || length !== trailer.getUint32(4, true)) {
    throw new Error('PROJECT_CHECKSUM_MISMATCH');
  }
  const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
  const document = PortableEditorProject.parse(parsed);
  if (!knownPatternIds.includes(document.state.patternId)) throw new Error('PROJECT_UNKNOWN_PATTERN');
  return document.state;
}
