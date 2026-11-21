import { describe, expect, it, vi } from 'vitest';
import { createRenderScheduler } from './render-scheduler';
function queue(){
  let id=0;const callbacks=new Map<number,FrameRequestCallback>();
  return {request:(fn:FrameRequestCallback)=>{callbacks.set(++id,fn);return id;},cancel:vi.fn((n:number)=>{callbacks.delete(n);}),
    get size(){return callbacks.size;},flush(){const pending=[...callbacks.values()];callbacks.clear();for(const fn of pending)fn(0);}};
}
describe('On-demand viewport render scheduling',()=>{
  it('coalesces invalidations and does not schedule idle frames',()=>{
    const q=queue(),render=vi.fn(),s=createRenderScheduler(render,q.request,q.cancel);
    for(let i=0;i<100;i++)s.invalidate();expect(q.size).toBe(1);
    q.flush();expect(render).toHaveBeenCalledTimes(1);expect(q.size).toBe(0);
    q.flush();expect(render).toHaveBeenCalledTimes(1);
  });
  it('allows damping to request the next frame during rendering, then settles',()=>{
    const q=queue();let count=0;
    const s=createRenderScheduler(()=>{count++;if(count<3)s.invalidate();},q.request,q.cancel);
    s.invalidate();q.flush();q.flush();q.flush();
    expect(count).toBe(3);expect(q.size).toBe(0);
  });
  it('cancels queued work and ignores invalidation or stale callbacks after disposal',()=>{
    const render=vi.fn();let callback!:FrameRequestCallback;
    const cancel=vi.fn();const s=createRenderScheduler(render,(fn)=>{callback=fn;return 7;},cancel);
    s.invalidate();s.dispose();expect(cancel).toHaveBeenCalledWith(7);
    callback(0);s.invalidate();expect(render).not.toHaveBeenCalled();
    s.dispose();expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('cancels hidden work, ignores hidden invalidations and refreshes once on resume',()=>{
    const q=queue(),render=vi.fn(),s=createRenderScheduler(render,q.request,q.cancel);
    s.invalidate();s.setPaused(true);expect(q.size).toBe(0);
    s.invalidate();s.invalidate();q.flush();expect(render).not.toHaveBeenCalled();
    s.setPaused(false);s.setPaused(false);expect(q.size).toBe(1);
    q.flush();expect(render).toHaveBeenCalledTimes(1);expect(q.size).toBe(0);
    s.dispose();s.setPaused(true);s.setPaused(false);expect(q.size).toBe(0);
  });
  it('ignores a cancelled stale callback without losing a newer resumed frame',()=>{
    const callbacks:FrameRequestCallback[]=[];const render=vi.fn();
    const s=createRenderScheduler(render,(fn)=>{callbacks.push(fn);return callbacks.length;},()=>{});
    s.invalidate();s.setPaused(true);s.setPaused(false);
    callbacks[0]!(0);s.invalidate();expect(callbacks).toHaveLength(2);
    callbacks[1]!(0);expect(render).toHaveBeenCalledTimes(1);
  });

});
