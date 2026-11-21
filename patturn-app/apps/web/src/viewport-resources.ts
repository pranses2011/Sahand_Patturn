import type { Object3D, BufferGeometry, Material, Texture } from 'three';

/** Release resources owned by one viewport object; shared helper materials/maps only once. */
export function disposeViewportObject(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((node) => {
    const renderable = node as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    if (renderable.geometry) geometries.add(renderable.geometry);
    const mats = renderable.material ? (Array.isArray(renderable.material) ? renderable.material : [renderable.material]) : [];
    for (const mat of mats) {
      materials.add(mat);
      const map = (mat as Material & { map?: Texture | null }).map;
      if (map) textures.add(map);
    }
    const texture = node.userData['tex'] as Texture | undefined;
    if (texture) textures.add(texture);
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
