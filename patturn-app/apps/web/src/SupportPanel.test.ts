import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTHOR } from '@patturn/config';
import { SupportPanel } from './SupportPanel';
afterEach(()=>vi.unstubAllGlobals());
describe('Optional local support panel',()=>{
  it('shows the configured recipient and grouped card without a payment form or remote content',()=>{
    const html=renderToStaticMarkup(createElement(SupportPanel));
    for(const value of [AUTHOR.name,AUTHOR.card,AUTHOR.phone,AUTHOR.email,AUTHOR.site])expect(html).toContain(value);
    expect(html).toContain('اختیاری');expect(html).toContain('فعال‌سازی لایسنس انجام نمی‌دهد');
    expect(html).toContain('dir="ltr"');expect(html).not.toMatch(/<form|<iframe|<script|https?:/);
  });
  it.each([true,false])('reports clipboard success=%s using only the raw configured number',async(success)=>{
    const writeText=vi.fn().mockImplementation(()=>success ? Promise.resolve() : Promise.reject(Error('denied')));
    vi.stubGlobal('navigator',{clipboard:{writeText}});
    let tree!:ReturnType<typeof create>;act(()=>{tree=create(createElement(SupportPanel));});
    await act(async()=>tree.root.findByType('button').props.onClick());
    expect(writeText).toHaveBeenCalledExactlyOnceWith(AUTHOR.cardRaw);
    expect(tree.root.findByType('button').props.disabled).toBe(false);
    if(success)expect(tree.root.findByProps({role:'status'}).children.join('')).toContain('کپی شد');
    else expect(tree.root.findByProps({role:'alert'}).children.join('')).toContain('دستی انتخاب');
    act(()=>tree.unmount());
  });
  it('offers manual copying when the clipboard API is missing',async()=>{
    vi.stubGlobal('navigator',{});
    let tree!:ReturnType<typeof create>;act(()=>{tree=create(createElement(SupportPanel));});
    await act(async()=>tree.root.findByType('button').props.onClick());
    expect(tree.root.findByProps({role:'alert'}).children.join('')).toContain('کپی خودکار در دسترس نیست');
    act(()=>tree.unmount());
  });
});
