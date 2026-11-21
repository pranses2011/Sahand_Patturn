import { act, create } from 'react-test-renderer';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useFileDelivery, type FileWriter, type DeliveryOutcome } from './useFileDelivery';
function setup(writer:FileWriter){
  let api!:ReturnType<typeof useFileDelivery>;
  function Host(){api=useFileDelivery(writer);return null;}
  let tree!:ReturnType<typeof create>;act(()=>{tree=create(createElement(Host));});
  return {get api(){return api;},tree};
}
const bytes=new Uint8Array([1,2,3]);
describe('Output delivery status and retry',()=>{
  it('prevents overlapping saves and reports success only after the writer resolves',async()=>{
    let done!:(result:DeliveryOutcome)=>void;
    const writer=vi.fn(()=>new Promise<DeliveryOutcome>((resolve)=>{done=resolve;}));
    const h=setup(writer);
    act(()=>{h.api.download('a.stl',bytes);h.api.download('b.stl',bytes);});
    expect(writer).toHaveBeenCalledTimes(1);expect(h.api.status.pending).toBe(true);
    await act(async()=>{done('saved');});
    expect(h.api.status.message).toContain('فایل ذخیره شد: a.stl');expect(h.api.status.pending).toBe(false);
    act(()=>h.tree.unmount());
  });
  it('retains the failed payload for explicit retry and releases the save lock',async()=>{
    const writer=vi.fn<FileWriter>().mockRejectedValueOnce(Error('disk full')).mockResolvedValue('saved');
    const h=setup(writer);
    await act(async()=>{h.api.download('a.zip',bytes);});
    expect(h.api.status.error).toBe(true);expect(h.api.status.message).toContain('ممکن است فایل مقصد ناقص باشد');
    await act(async()=>h.api.retry());
    expect(writer).toHaveBeenLastCalledWith('a.zip',bytes);expect(h.api.status.error).toBe(false);
    expect(h.api.status.message).toContain('ذخیره شد');act(()=>h.tree.unmount());
  });
  it.each(['cancelled','requested'] as const)('does not misreport %s as a saved file',async(outcome)=>{
    const h=setup(async()=>outcome);
    await act(async()=>{h.api.download('a.svg',bytes);});
    expect(h.api.status.message).not.toContain('فایل ذخیره شد');expect(h.api.status.error).toBe(false);
    expect(h.api.status.message).toContain(outcome==='cancelled'?'لغو شد':'درخواست دانلود');
    act(()=>h.tree.unmount());
  });
  it('discards failed retry bytes without writing and permits a fresh output',async()=>{
    const writer=vi.fn<FileWriter>().mockRejectedValueOnce(Error('disk full')).mockResolvedValue('saved');
    const h=setup(writer);
    await act(async()=>h.api.download('old.zip',bytes));
    act(()=>h.api.discard());
    expect(h.api.status.error).toBe(false);expect(h.api.status.message).toContain('کنار گذاشته شد');
    await act(async()=>h.api.retry());expect(writer).toHaveBeenCalledTimes(1);
    await act(async()=>h.api.download('fresh.zip',new Uint8Array([4])));
    expect(writer).toHaveBeenLastCalledWith('fresh.zip',new Uint8Array([4]));
    expect(h.api.status.message).toContain('فایل ذخیره شد: fresh.zip');
    act(()=>h.tree.unmount());
  });
  it('does not discard a pending write or falsely release its lock',async()=>{
    let reject!:(reason:Error)=>void;
    const writer=vi.fn<FileWriter>(()=>new Promise((_resolve,fail)=>{reject=fail;}));
    const h=setup(writer);act(()=>h.api.download('pending.zip',bytes));
    act(()=>{h.api.discard();h.api.download('overlap.zip',bytes);});
    expect(h.api.status.pending).toBe(true);expect(writer).toHaveBeenCalledTimes(1);
    await act(async()=>reject(Error('failed')));
    expect(h.api.status.error).toBe(true);
    act(()=>h.api.retry());expect(writer).toHaveBeenCalledTimes(2);
    await act(async()=>reject(Error('failed again')));
    act(()=>h.tree.unmount());
  });
  it.each(['resolve','reject'] as const)('ignores late %s after unmount without accepting more writes',async(result)=>{
    let resolve!:(result:DeliveryOutcome)=>void,reject!:(reason:Error)=>void;
    const writer=vi.fn<FileWriter>(()=>new Promise((ok,fail)=>{resolve=ok;reject=fail;}));
    const h=setup(writer);act(()=>h.api.download('pending.zip',bytes));
    const status=h.api.status;
    act(()=>h.tree.unmount());
    await act(async()=>{if(result==='resolve')resolve('saved');else reject(Error('late failure'));});
    act(()=>{h.api.retry();h.api.discard();h.api.download('after-unmount.zip',bytes);});
    expect(writer).toHaveBeenCalledTimes(1);expect(h.api.status).toBe(status);
  });
  it('drops a previously failed retry when the delivery owner unmounts',async()=>{
    const writer=vi.fn<FileWriter>().mockRejectedValue(Error('failed'));
    const h=setup(writer);await act(async()=>h.api.download('old.zip',bytes));
    expect(h.api.status.error).toBe(true);act(()=>h.tree.unmount());
    act(()=>{h.api.retry();h.api.discard();});expect(writer).toHaveBeenCalledTimes(1);
  });
  it('reports snapshot-copy failure without invoking the writer and permits a fresh request',async()=>{
    const writer=vi.fn<FileWriter>().mockResolvedValue('saved'),h=setup(writer);
    const input=new Uint8Array([1]);vi.spyOn(input,'slice').mockImplementation(()=>{throw new RangeError('allocation failed');});
    act(()=>h.api.download('large.zip',input));
    expect(writer).not.toHaveBeenCalled();expect(h.api.status.pending).toBe(false);
    expect(h.api.status.error).toBe(true);expect(h.api.status.retryable).toBe(false);
    expect(h.api.status.message).toContain('ذخیره آغاز نشد');
    act(()=>h.api.retry());expect(writer).not.toHaveBeenCalled();
    act(()=>h.api.discard());expect(h.api.status.error).toBe(false);
    await act(async()=>h.api.download('small.svg',bytes));
    expect(writer).toHaveBeenCalledExactlyOnceWith('small.svg',bytes);
    act(()=>h.tree.unmount());
  });
  it('does not offer an older failed file when a new snapshot cannot be copied',async()=>{
    const writer=vi.fn<FileWriter>().mockRejectedValueOnce(Error('write failed')).mockResolvedValue('saved');
    const h=setup(writer);await act(async()=>h.api.download('old.zip',bytes));
    expect(h.api.status.retryable).toBe(true);
    const input=new Uint8Array([4]);vi.spyOn(input,'slice').mockImplementation(()=>{throw Error('copy failed');});
    act(()=>h.api.download('new.zip',input));act(()=>h.api.retry());
    expect(writer).toHaveBeenCalledTimes(1);expect(h.api.status.retryable).toBe(false);
    expect(h.api.status.message).toContain('new.zip');act(()=>h.tree.unmount());
  });
  it('keeps the snapshot retryable when the writer payload copy fails before any write',async()=>{
    const writer=vi.fn<FileWriter>().mockResolvedValue('saved'),h=setup(writer);
    const original=Uint8Array.prototype.slice;let copies=0;
    const spy=vi.spyOn(Uint8Array.prototype,'slice').mockImplementation(function(this:Uint8Array,start?:number,end?:number){
      if(++copies===2)throw new RangeError('writer copy failed');
      return original.call(this,start,end);
    });
    try { await act(async()=>h.api.download('snapshot.zip',bytes)); }
    finally { spy.mockRestore(); }
    expect(writer).not.toHaveBeenCalled();expect(h.api.status.pending).toBe(false);
    expect(h.api.status.error).toBe(true);expect(h.api.status.retryable).toBe(true);
    expect(h.api.status.message).toContain('ذخیره آغاز نشد');
    expect(h.api.status.message).not.toContain('فایل مقصد ناقص');
    await act(async()=>h.api.retry());
    expect(writer).toHaveBeenCalledExactlyOnceWith('snapshot.zip',bytes);
    expect(h.api.status.error).toBe(false);act(()=>h.tree.unmount());
  });
  it('a new request supersedes a failed retry without changing the earlier payload',async()=>{
    const writer=vi.fn<FileWriter>().mockRejectedValueOnce(Error('denied')).mockResolvedValue('saved');
    const h=setup(writer);
    await act(async()=>h.api.download('old.stl',bytes));
    await act(async()=>h.api.download('new.svg',new Uint8Array([4])));
    await act(async()=>h.api.retry());expect(writer).toHaveBeenCalledTimes(2);
    act(()=>h.tree.unmount());
  });
  it('isolates repeated retries from caller and failing writer mutations of subarrays',async()=>{
    const backing=new Uint8Array([99,1,2,3,88]);
    const received:number[][]=[];
    let reject!:(reason:Error)=>void;
    const writer=vi.fn<FileWriter>((_name,payload)=>{
      received.push([...payload]);payload.fill(42);
      return new Promise((_resolve,fail)=>{reject=fail;});
    });
    const h=setup(writer);
    act(()=>h.api.download('snapshot.stl',backing.subarray(1,4)));
    backing.fill(7);
    await act(async()=>reject(Error('partial write')));
    act(()=>h.api.retry());
    expect(received).toEqual([[1,2,3],[1,2,3]]);
    await act(async()=>reject(Error('still full')));
    act(()=>h.api.retry());expect(received[2]).toEqual([1,2,3]);
    await act(async()=>reject(Error('still full')));
    act(()=>h.tree.unmount());
  });

});
