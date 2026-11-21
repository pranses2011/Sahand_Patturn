import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { unwrapCylinder, type Mesh } from '@patturn/kernel';
import type { Path } from '@patturn/patterns';

interface Props {
  mesh: Mesh | null;
  mode: 'form' | 'mold';
  /** when set, the pattern is wrapped onto the form (cylindrical UV) */
  pattern?: { paths: Path[]; tileW: number; strokeMm: number } | null;
}

/** Rasterise one pattern tile (mm) to a repeating canvas texture. */
function buildPatternTexture(paths: Path[], tileW: number, strokeMm: number): THREE.Texture {
  const pxPerMm = Math.min(16, Math.max(2, Math.round(512 / tileW)));
  const size = Math.round(tileW * pxPerMm);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.scale(size / tileW, size / tileW); // work in mm
  ctx.fillStyle = '#1c1917';
  ctx.strokeStyle = '#1c1917';
  ctx.lineWidth = strokeMm;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const p of paths) {
    const path = new Path2D(p.d);
    if (p.fill) ctx.fill(path);
    else ctx.stroke(path);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** three.js viewport: dark studio, mm grid, clay-colored form. */
export function Viewport({ mesh, mode, pattern }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    controls?: OrbitControls;
    current?: THREE.Mesh;
    raf?: number;
  }>({});

  // init once
  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#14110e');

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
    camera.position.set(180, 160, 240);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 74, 0);

    // lights
    scene.add(new THREE.AmbientLight(0xfff4e6, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(120, 220, 80);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xcfe4ee, 0.5);
    fill.position.set(-140, 60, -100);
    scene.add(fill);

    // mm grid (10mm major)
    const grid = new THREE.GridHelper(400, 40, 0x4a423a, 0x2a2521);
    scene.add(grid);
    // axes hint
    const axes = new THREE.AxesHelper(60);
    (axes.material as THREE.Material).opacity = 0.5;
    (axes.material as THREE.Material).transparent = true;
    scene.add(axes);

    const st = stateRef.current;
    st.renderer = renderer;
    st.scene = scene;
    st.camera = camera;
    st.controls = controls;

    const onResize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    onResize();
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    const loop = () => {
      st.raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(st.raf!);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, []);

  // swap geometry when mesh / pattern changes
  useEffect(() => {
    const st = stateRef.current;
    if (!st.scene) return;
    if (st.current) {
      st.scene.remove(st.current);
      st.current.geometry.dispose();
      const oldMat = st.current.material as THREE.Material;
      if (st.current.userData['tex']) (st.current.userData['tex'] as THREE.Texture).dispose();
      oldMat.dispose();
      st.current = undefined;
    }
    if (!mesh) return;

    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geo.computeVertexNormals(); // smooth normals while still indexed

    const mat = new THREE.MeshStandardMaterial({
      color: mode === 'mold' ? 0xb8b0a4 : 0xc4622d,
      roughness: mode === 'mold' ? 0.9 : 0.55,
      metalness: 0.02,
      side: THREE.DoubleSide,
      flatShading: false,
    });

    let tex: THREE.Texture | undefined;
    if (pattern && mode === 'form') {
      // cylindrical unwrap → per-corner UVs (seam-safe) → de-indexed geometry
      const un = unwrapCylinder(mesh, { tileW: pattern.tileW });
      geo = geo.toNonIndexed();
      const nCorner = geo.attributes['position']!.count;
      const uv = new Float32Array(nCorner * 2);
      const scale = 1 / pattern.tileW; // mm → tile units for RepeatWrapping
      for (let i = 0; i < nCorner; i++) {
        uv[i * 2] = un.cornerUvs[i * 2]! * scale;
        uv[i * 2 + 1] = un.cornerUvs[i * 2 + 1]! * scale;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeVertexNormals(); // per-corner (still visually smooth enough at 96 seg)
      tex = buildPatternTexture(pattern.paths, pattern.tileW, pattern.strokeMm);
      mat.map = tex; // white bg × clay color = clay form; dark lines × clay = dark grooves
      mat.roughness = 0.6;
    }

    const m = new THREE.Mesh(geo, mat);
    if (tex) m.userData['tex'] = tex;
    st.scene.add(m);
    st.current = m;
  }, [mesh, mode, pattern]);

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />;
}
