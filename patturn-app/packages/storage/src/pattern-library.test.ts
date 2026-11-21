import { describe, it, expect } from 'vitest';
import { PatternLibraryRepo, PATTERN_LIBRARY_KEY } from './index.js';
function setup() {
  const data = new Map<string,string>();
  const storage = {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
  return {data,storage,repo:new PatternLibraryRepo(storage,['wave','grid'])};
}
const recipe={name:'موج ریز',patternId:'wave',tileSize:12};
describe('Named pattern recipes',()=>{
  it('saves, reloads and deletes recipes without retaining mutable references',()=>{
    const {repo,storage}=setup();expect(repo.list()).toEqual([]);
    const result=repo.save(recipe);result[0]!.tileSize=90;
    expect(new PatternLibraryRepo(storage,['wave']).list()).toEqual([recipe]);
    expect(repo.delete(recipe.name)).toEqual([]);
  });
  it('rejects duplicates and invalid or unknown recipes without overwriting',()=>{
    const {repo,data}=setup();repo.save(recipe);const before=data.get(PATTERN_LIBRARY_KEY);
    for(const input of [{...recipe,name:' '},{...recipe,tileSize:NaN},{...recipe,patternId:'unknown'},recipe])expect(()=>repo.save(input)).toThrow();
    expect(data.get(PATTERN_LIBRARY_KEY)).toBe(before);
  });
  it('bounds entries to 30 and rejects oversized storage',()=>{
    const {repo,data}=setup();for(let i=0;i<30;i++)repo.save({...recipe,name:`نسخه ${i}`});
    expect(()=>repo.save({...recipe,name:'جدید'})).toThrow('LIBRARY_FULL');
    data.set(PATTERN_LIBRARY_KEY,' '.repeat(32769));expect(()=>repo.list()).toThrow('LIBRARY_TOO_LARGE');
  });
  it('never silently replaces corrupted storage on save or delete',()=>{
    const {repo,data}=setup();for(const raw of ['{', '{"version":2,"entries":[]}', JSON.stringify({version:1,entries:[recipe,recipe]})]){
      data.set(PATTERN_LIBRARY_KEY,raw);expect(()=>repo.save(recipe)).toThrow();expect(()=>repo.delete(recipe.name)).toThrow();expect(data.get(PATTERN_LIBRARY_KEY)).toBe(raw);
    }
  });
  it('propagates denied writes without claiming success',()=>{
    const repo=new PatternLibraryRepo({getItem:()=>null,setItem:()=>{throw Error('quota');}},['wave']);
    expect(()=>repo.save(recipe)).toThrow('quota');
  });
  it('renames in place while preserving pattern, tile size and neighboring entries',()=>{
    const {repo}=setup();repo.save(recipe);repo.save({...recipe,name:'دوم',patternId:'grid'});
    expect(repo.rename(recipe.name,'  نام جدید  ')).toEqual([{...recipe,name:'نام جدید'},{...recipe,name:'دوم',patternId:'grid'}]);
    expect(repo.list()[0]!.name).toBe('نام جدید');
  });
  it('rejects duplicate, missing and invalid rename without changing stored bytes',()=>{
    const {repo,data}=setup();repo.save(recipe);repo.save({...recipe,name:'دوم'});const before=data.get(PATTERN_LIBRARY_KEY);
    for(const [old,next] of [[recipe.name,'دوم'],['missing','new'],[recipe.name,' '],[recipe.name,'x'.repeat(61)]]){
      expect(()=>repo.rename(old!,next!)).toThrow();expect(data.get(PATTERN_LIBRARY_KEY)).toBe(before);
    }
  });
  it('does not write an unchanged normalized name',()=>{
    const {repo,storage}=setup();repo.save(recipe);storage.setItem=()=>{throw Error('should not write');};
    expect(repo.rename(recipe.name,` ${recipe.name} `)[0]).toEqual(recipe);
  });
  it('retains old bytes on a denied rename and never replaces corrupt data',()=>{
    const {repo,storage,data}=setup();repo.save(recipe);const before=data.get(PATTERN_LIBRARY_KEY);
    storage.setItem=()=>{throw Error('denied');};
    expect(()=>repo.rename(recipe.name,'new')).toThrow('denied');expect(data.get(PATTERN_LIBRARY_KEY)).toBe(before);
    data.set(PATTERN_LIBRARY_KEY,'{broken');expect(()=>repo.rename(recipe.name,'new')).toThrow();expect(data.get(PATTERN_LIBRARY_KEY)).toBe('{broken');
  });

});
