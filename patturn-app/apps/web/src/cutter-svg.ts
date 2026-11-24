import type { CutterPoint } from '@patturn/kernel';
/** Deliberately narrow XML subset, not a general SVG renderer. Geometry is never injected as markup. */
export function cutterSvgPoints(text: string): CutterPoint[] {
  if (text.length > 64 * 1024 || /<!DOCTYPE|<!ENTITY|<\?/i.test(text))
    throw Error('CUTTER_SVG_UNSUPPORTED');
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw Error('CUTTER_SVG_INVALID');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg')
    throw Error('CUTTER_SVG_UNSUPPORTED');
  const allowedRoot = ['xmlns', 'width', 'height', 'viewBox'];
  if (Array.from(root.attributes).some((a) => !allowedRoot.includes(a.name)))
    throw Error('CUTTER_SVG_UNSUPPORTED');
  if (root.children.length !== 1 || root.children[0]!.localName !== 'polygon')
    throw Error('CUTTER_SVG_UNSUPPORTED');
  const polygon = root.children[0]!;
  if (
    polygon.namespaceURI !== root.namespaceURI ||
    polygon.children.length ||
    Array.from(polygon.attributes).some((a) => a.name !== 'points')
  )
    throw Error('CUTTER_SVG_UNSUPPORTED');
  if (Array.from(root.childNodes).some((n) => n.nodeType === 3 && n.textContent?.trim()))
    throw Error('CUTTER_SVG_UNSUPPORTED');
  const dimension = (value: string | null) => {
    if (!value || !/^\d+(?:\.\d+)?mm$/.test(value)) throw Error('CUTTER_SVG_REQUIRE_MM');
    const number = Number(value.slice(0, -2));
    if (number <= 0 || number > 1000) throw Error('CUTTER_SVG_REQUIRE_MM');
    return number;
  };
  const width = dimension(root.getAttribute('width')),
    height = dimension(root.getAttribute('height'));
  const numbers = (value: string | null) => {
    if (!value || !value.trim()) throw Error('CUTTER_SVG_INVALID');
    // Require comma/space separation; reject malformed commas and unsupported units/tokens.
    const number = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
    if (!new RegExp(`^\\s*${number}(?:(?:\\s*,\\s*|\\s+)${number})*\\s*$`).test(value))
      throw Error('CUTTER_SVG_INVALID');
    const result = value
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (result.some((n) => !Number.isFinite(n) || Math.abs(n) > 10000))
      throw Error('CUTTER_SVG_INVALID');
    return result;
  };
  const box = numbers(root.getAttribute('viewBox'));
  if (box.length !== 4 || box[2]! <= 0 || box[3]! <= 0) throw Error('CUTTER_SVG_INVALID');
  if (Math.abs(width / box[2]! - height / box[3]!) > 1e-9)
    throw Error('CUTTER_SVG_NONUNIFORM_SCALE');
  const coordinates = numbers(polygon.getAttribute('points'));
  if (coordinates.length < 6 || coordinates.length > 130 || coordinates.length % 2)
    throw Error('CUTTER_SVG_INVALID');
  const points: CutterPoint[] = [];
  for (let i = 0; i < coordinates.length; i += 2)
    points.push([
      ((coordinates[i]! - box[0]!) * width) / box[2]!,
      ((coordinates[i + 1]! - box[1]!) * height) / box[3]!,
    ]);
  if (points.some((p) => p[0] < 0 || p[0] > width || p[1] < 0 || p[1] > height))
    throw Error('CUTTER_SVG_CLIPPED');
  if (polygon.textContent?.trim()) throw Error('CUTTER_SVG_UNSUPPORTED');
  return points;
}
