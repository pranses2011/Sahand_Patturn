import { describe, expect, it, vi } from 'vitest';
import { Group, Mesh, BufferGeometry, MeshStandardMaterial, Texture, GridHelper, AxesHelper } from 'three';
import { disposeViewportObject } from './viewport-resources';

describe('Viewport resource ownership',()=>{
  it('releases shared geometry, material and texture once per owned subtree',()=>{
    const geometry=new BufferGeometry(),texture=new Texture(),material=new MeshStandardMaterial({map:texture});
    const root=new Group(),a=new Mesh(geometry,material),b=new Mesh(geometry,[material,material]);
    a.userData['tex']=texture;root.add(a,b);
    const gd=vi.spyOn(geometry,'dispose'),md=vi.spyOn(material,'dispose'),td=vi.spyOn(texture,'dispose');
    disposeViewportObject(root);
    expect(gd).toHaveBeenCalledTimes(1);expect(md).toHaveBeenCalledTimes(1);expect(td).toHaveBeenCalledTimes(1);
  });
  it('handles helpers with array materials and releases their buffers',()=>{
    const root=new Group(),grid=new GridHelper(),axes=new AxesHelper();root.add(grid,axes);
    const gs=vi.spyOn(grid.geometry,'dispose'),as=vi.spyOn(axes.geometry,'dispose');
    const mats=[...(Array.isArray(grid.material)?grid.material:[grid.material]),...(Array.isArray(axes.material)?axes.material:[axes.material])];
    const spies=mats.map((m)=>vi.spyOn(m,'dispose'));
    disposeViewportObject(root);
    expect(gs).toHaveBeenCalledTimes(1);expect(as).toHaveBeenCalledTimes(1);
    for(const spy of spies)expect(spy).toHaveBeenCalledTimes(1);
  });
  it('does not dispose resources belonging to a sibling viewport',()=>{
    const a=new Mesh(new BufferGeometry(),new MeshStandardMaterial());
    const b=new Mesh(new BufferGeometry(),new MeshStandardMaterial());
    const spy=vi.spyOn(b.geometry,'dispose');
    disposeViewportObject(a);expect(spy).not.toHaveBeenCalled();
    disposeViewportObject(b);expect(spy).toHaveBeenCalledTimes(1);
  });
});
