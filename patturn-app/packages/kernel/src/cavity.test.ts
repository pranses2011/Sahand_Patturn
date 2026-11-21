import { describe, expect, it } from 'vitest';
import { radialCavityProfile, referenceOuterProfile, capacityMl, filledMl } from './index.js';

describe('Radial cavity metrics', () => {
  it('V1: reference at wall 4 preserves golden capacity and filled volume', () => {
    const cavity = radialCavityProfile(referenceOuterProfile(128), 4);
    expect(capacityMl(cavity)).toBeCloseTo(1131, 0);
    expect(filledMl(cavity, 0.8)).toBeCloseTo(958, 0);
    expect(cavity[0]!.y).toBe(0);
    expect(cavity.at(-1)!.r).toBeCloseTo(43.6965, 5);
  });
  it('V2: cylindrical capacity agrees with analytic radial thickness and raised floor', () => {
    const outer = [{r:0,y:-4},{r:50,y:-4},{r:50,y:100},{r:46,y:100}];
    const cavity = radialCavityProfile(outer, 4);
    expect(capacityMl(cavity)).toBeCloseTo(Math.PI*46**2*100/1000, 8);
    expect(filledMl(cavity, 0)).toBe(0);
    expect(filledMl(cavity, 1)).toBeCloseTo(capacityMl(cavity), 8);
  });
  it('V3: increasing wall reduces capacity, outer data unmodified; presets differ', () => {
    const outer=referenceOuterProfile(48), copy=JSON.stringify(outer);
    const volumes=[1,4,10,20].map((wall)=>capacityMl(radialCavityProfile(outer,wall)));
    for(let i=1;i<volumes.length;i++) expect(volumes[i]!).toBeLessThan(volumes[i-1]!);
    expect(JSON.stringify(outer)).toBe(copy);
    const cone=[{r:20,y:0},{r:50,y:100}];
    expect(capacityMl(radialCavityProfile(cone,4))).not.toBeCloseTo(volumes[1]!,0);
  });
  it('V4: clips a sloped segment exactly where the inner floor starts',()=>{
    expect(radialCavityProfile([{r:50,y:0},{r:40,y:10},{r:30,y:20}],4)[0]).toEqual({r:42,y:4});
  });
  it('V5: rejects impossible walls and nonmonotone or malformed silhouettes',()=>{
    for(const wall of [0,-1,NaN,100]) expect(()=>radialCavityProfile([{r:20,y:0},{r:10,y:50}],wall)).toThrow();
    expect(()=>radialCavityProfile([{r:20,y:0},{r:10,y:50}],15)).toThrow('WALL_CLOSES_CAVITY');
    expect(()=>radialCavityProfile([{r:20,y:10},{r:20,y:0}],4)).toThrow('NOT_MONOTONE');
  });
});
