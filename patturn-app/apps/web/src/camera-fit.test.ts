import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { cameraFit } from './camera-fit';

describe('Perspective model framing',()=>{
  it.each([0.3,1,2.5])('contains all translated bounding-box corners at aspect %s',(aspect)=>{
    const bounds=new Box3(new Vector3(-80,25,-40),new Vector3(220,310,90));
    const fit=cameraFit(bounds,45,aspect)!;
    const camera=new PerspectiveCamera(45,aspect,fit.near,fit.far);
    camera.position.copy(fit.center).add(new Vector3(1,1,1).normalize().multiplyScalar(fit.distance));
    camera.lookAt(fit.center);camera.updateMatrixWorld();
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
      const p=new Vector3(x,y,z).project(camera);
      expect(Math.abs(p.x)).toBeLessThan(1);expect(Math.abs(p.y)).toBeLessThan(1);expect(Math.abs(p.z)).toBeLessThan(1);
    }
  });
  it('rejects empty/nonfinite bounds and invalid projection parameters',()=>{
    const box=new Box3(new Vector3(),new Vector3(1,1,1));
    expect(cameraFit(new Box3(),45,1)).toBeNull();
    for(const [fov,aspect] of [[0,1],[180,1],[45,0],[45,NaN]])expect(cameraFit(box,fov!,aspect!)).toBeNull();
    expect(cameraFit(new Box3(new Vector3(),new Vector3(Infinity,1,1)),45,1)).toBeNull();
  });
  it('handles a point without a zero clipping range',()=>{
    const fit=cameraFit(new Box3(new Vector3(2,3,4),new Vector3(2,3,4)),45,1)!;
    expect(fit.center.toArray()).toEqual([2,3,4]);expect(fit.far).toBeGreaterThan(fit.near);expect(fit.near).toBeGreaterThan(0);
  });
  it('keeps model center inside depth range after interactive zoom in and out',()=>{
    const bounds=new Box3(new Vector3(-100,-100,-100),new Vector3(100,100,100));
    const fit=cameraFit(bounds,45,1)!;
    const camera=new PerspectiveCamera(45,1,fit.near,fit.far);
    for(const distance of [fit.distance/10,fit.distance,fit.distance*5]){
      camera.position.copy(fit.center).add(new Vector3(0,0,distance));
      camera.lookAt(fit.center);camera.updateMatrixWorld();
      const depth=fit.center.clone().project(camera).z;
      expect(depth).toBeGreaterThan(-1);expect(depth).toBeLessThan(1);
    }
    expect(fit.near).toBeLessThan(1);expect(fit.far).toBeGreaterThanOrEqual(5000);
  });

});
