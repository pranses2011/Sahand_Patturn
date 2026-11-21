import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadContentType, requestBrowserDownload } from './browser-download';

function setup() {
  const anchor={href:'',download:'',click:vi.fn()};
  const create=vi.fn(()=>anchor),makeUrl=vi.fn((_blob:Blob)=> 'blob:download'),revoke=vi.fn();
  vi.stubGlobal('document',{createElement:create});
  vi.stubGlobal('URL',{createObjectURL:makeUrl,revokeObjectURL:revoke});
  vi.useFakeTimers();
  return {anchor,create,makeUrl,revoke};
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('Browser download URL lifecycle',()=>{
  it.each([
    ['pattern.SVG','image/svg+xml'],['dimensions.pdf','application/pdf'],['library.json','application/json'],
    ['build.zip','application/zip'],['form.stl','model/stl'],['parts.obj','text/plain'],['pattern.dxf','image/vnd.dxf'],
    ['project.patturn','application/octet-stream'],['no-extension','application/octet-stream'],
    ['archive.svg.exe','application/octet-stream'],['toString','application/octet-stream'],
    ['file.__proto__','application/octet-stream'],
  ])('uses a bounded content type for %s',(name,expected)=>{
    expect(downloadContentType(name)).toBe(expected);
  });
  it('requests the named download and revokes exactly the created URL after the grace period',async()=>{
    const h=setup(),bytes=new Uint8Array([99,1,2,88]);
    requestBrowserDownload('pattern.svg',bytes.subarray(1,3));bytes.fill(7);
    expect(h.create).toHaveBeenCalledWith('a');expect(h.anchor.download).toBe('pattern.svg');
    expect(h.anchor.click).toHaveBeenCalledOnce();expect(h.revoke).not.toHaveBeenCalled();
    const blob=h.makeUrl.mock.calls[0]![0];
    expect(blob.type).toBe('image/svg+xml');
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1,2]);
    vi.advanceTimersByTime(999);expect(h.revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);expect(h.revoke).toHaveBeenCalledExactlyOnceWith('blob:download');
  });
  it('releases the URL immediately and preserves a click failure for retry handling',()=>{
    const h=setup(),error=new Error('click failed');h.anchor.click.mockImplementation(()=>{throw error;});
    expect(()=>requestBrowserDownload('a.svg',new Uint8Array([1]))).toThrow(error);
    expect(h.revoke).toHaveBeenCalledExactlyOnceWith('blob:download');expect(vi.getTimerCount()).toBe(0);
  });
  it('releases the URL if anchor setup fails before click',()=>{
    const h=setup();Object.defineProperty(h.anchor,'download',{set(){throw Error('setup failed');}});
    expect(()=>requestBrowserDownload('a.svg',new Uint8Array([1]))).toThrow('setup failed');
    expect(h.anchor.click).not.toHaveBeenCalled();expect(h.revoke).toHaveBeenCalledExactlyOnceWith('blob:download');
  });
  it('does not revoke a URL that was never created',()=>{
    const h=setup();h.makeUrl.mockImplementation(()=>{throw Error('URL failed');});
    expect(()=>requestBrowserDownload('a.svg',new Uint8Array([1]))).toThrow('URL failed');
    expect(h.revoke).not.toHaveBeenCalled();expect(h.anchor.click).not.toHaveBeenCalled();
  });
});
