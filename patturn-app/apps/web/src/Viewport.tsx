import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Mesh } from '@patturn/kernel';

interface Props {
  mesh: Mesh | null;
  mode: 'form' | 'mold';
}

/** three.js viewport: dark studio, mm grid, clay-colored form. */
export function Viewport({ mesh, mode }: Props) {
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

  // swap geometry when mesh changes
  useEffect(() => {
    const st = stateRef.current;
    if (!st.scene) return;
    if (st.current) {
      st.scene.remove(st.current);
      st.current.geometry.dispose();
      (st.current.material as THREE.Material).dispose();
      st.current = undefined;
    }
    if (!mesh) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: mode === 'mold' ? 0xb8b0a4 : 0xc4622d,
      roughness: mode === 'mold' ? 0.9 : 0.55,
      metalness: 0.02,
      side: THREE.DoubleSide,
      flatShading: false,
    });
    const m = new THREE.Mesh(geo, mat);
    st.scene.add(m);
    st.current = m;
  }, [mesh, mode]);

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />;
}
