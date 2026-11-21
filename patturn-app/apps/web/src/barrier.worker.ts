import { buildOffsetBarrier } from '@patturn/molds';
import type { Mesh } from '@patturn/kernel';

self.onmessage = async (event: MessageEvent<Mesh>) => {
  try {
    // Coarser bounded resolution keeps nonconvex Minkowski calculations practical.
    const result = await buildOffsetBarrier(event.data, { segments: 16 });
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error) });
  }
};
