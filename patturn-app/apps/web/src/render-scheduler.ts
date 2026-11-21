/** Coalesced on-demand frames. render() may invalidate again (OrbitControls damping).
 * Disposal prevents queued or stale callbacks from reviving an unmounted viewport.
 */
export function createRenderScheduler(render: () => void,
  request: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancel: (id: number) => void = cancelAnimationFrame) {
  let pending: number | null = null;
  let disposed = false;
  let paused = false;
  let generation = 0;
  return {
    invalidate() {
      if (disposed || paused || pending !== null) return;
      const frameGeneration = generation;
      pending = request(() => {
        if (frameGeneration !== generation) return;
        pending = null;
        if (!disposed && !paused) render();
      });
    },
    setPaused(value: boolean) {
      if (disposed || paused === value) return;
      paused = value;
      generation++;
      if (pending !== null) cancel(pending);
      pending = null;
      if (!paused) this.invalidate();
    },
    dispose() {
      generation++;
      disposed = true;
      if (pending !== null) cancel(pending);
      pending = null;
    },
  };
}
