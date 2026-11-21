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
  it('does not create an empty storage document when deleting from an absent library',()=>{
    const {repo,storage,data}=setup();
    storage.setItem=()=>{throw Error('unexpected write');};
    expect(repo.delete('missing')).toEqual([]);expect(data.has(PATTERN_LIBRARY_KEY)).toBe(false);
  });
  it('preserves exact stored bytes and neighbors on a repeated or missing delete',()=>{
    const {repo,storage,data}=setup();repo.save(recipe);repo.save({...recipe,name:'دوم',patternId:'grid'});
    repo.delete(recipe.name);
    const before=data.get(PATTERN_LIBRARY_KEY)!;
    // Deliberate whitespace must survive a no-op, not be normalized by a write.
    data.set(PATTERN_LIBRARY_KEY,`  ${before}  `);
    storage.setItem=()=>{throw Error('quota');};
    expect(repo.delete(recipe.name)).toEqual([{...recipe,name:'دوم',patternId:'grid'}]);
    expect(data.get(PATTERN_LIBRARY_KEY)).toBe(`  ${before}  `);
  });
  it('does not hide a failed real deletion or change the original stored data',()=>{
    const {repo,storage,data}=setup();repo.save(recipe);const before=data.get(PATTERN_LIBRARY_KEY);
    storage.setItem=()=>{throw Error('denied');};
    expect(()=>repo.delete(recipe.name)).toThrow('denied');
    expect(data.get(PATTERN_LIBRARY_KEY)).toBe(before);expect(repo.list()).toEqual([recipe]);
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

  it('updates recipe values in place without changing its name or neighbors',()=>{
    const {repo}=setup();repo.save(recipe);repo.save({...recipe,name:'دوم'});
    expect(repo.update(recipe.name,{patternId:'grid',tileSize:60})).toEqual([
      {...recipe,patternId:'grid',tileSize:60},{...recipe,name:'دوم'},
    ]);
  });
  it('rejects invalid or missing updates and retains previous bytes on denied writes',()=>{
    const {repo,data,storage}=setup();repo.save(recipe);const before=data.get(PATTERN_LIBRARY_KEY);
    for(const [name,values] of [[recipe.name,{patternId:'unknown',tileSize:12}],[recipe.name,{patternId:'wave',tileSize:NaN}],['missing',{patternId:'wave',tileSize:12}]] as const){
      expect(()=>repo.update(name,values)).toThrow();expect(data.get(PATTERN_LIBRARY_KEY)).toBe(before);
    }
    storage.setItem=()=>{throw Error('quota');};
    expect(()=>repo.update(recipe.name,{patternId:'grid',tileSize:60})).toThrow('quota');expect(data.get(PATTERN_LIBRARY_KEY)).toBe(before);
  });
  it('does not write when updating unchanged values',()=>{
    const {repo,storage}=setup();repo.save(recipe);storage.setItem=()=>{throw Error('should not write');};
    expect(repo.update(recipe.name,{patternId:recipe.patternId,tileSize:recipe.tileSize})).toEqual([recipe]);
  });

  it('exports every recipe in a versioned deterministic UTF-8 document without changing storage',()=>{
    const {repo,data}=setup();repo.save(recipe);repo.save({...recipe,name:'شبکه',patternId:'grid',tileSize:60});
    const before=data.get(PATTERN_LIBRARY_KEY),bytes=repo.exportDocument();
    expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual({format:'patturn-pattern-library',version:1,entries:repo.list()});
    expect(repo.exportDocument()).toEqual(bytes);expect(data.get(PATTERN_LIBRARY_KEY)).toBe(before);
  });
  it('exports an empty library but refuses corrupted stored data without overwriting it',()=>{
    const {repo,data}=setup();expect(JSON.parse(new TextDecoder().decode(repo.exportDocument())).entries).toEqual([]);
    data.set(PATTERN_LIBRARY_KEY,'{broken');expect(()=>repo.exportDocument()).toThrow();expect(data.get(PATTERN_LIBRARY_KEY)).toBe('{broken');
  });

  it('previews without writing and merges backup entries once while preserving existing order',()=>{
    const source=setup();source.repo.save(recipe);source.repo.save({...recipe,name:'grid',patternId:'grid'});
    const {repo,data}=setup();repo.save(recipe);const before=data.get(PATTERN_LIBRARY_KEY),bytes=source.repo.exportDocument();
    expect(repo.previewImport(bytes)).toEqual({added:1,total:2});expect(data.get(PATTERN_LIBRARY_KEY)).toBe(before);
    expect(repo.importDocument(bytes)).toEqual(source.repo.list());expect(repo.previewImport(bytes).added).toBe(0);
  });
  it('rejects conflicting names and changes between preview and commit without overwriting',()=>{
    const source=setup();source.repo.save(recipe);const bytes=source.repo.exportDocument();
    const {repo,data}=setup();expect(repo.previewImport(bytes).added).toBe(1);
    repo.save({...recipe,tileSize:60});const before=data.get(PATTERN_LIBRARY_KEY);
    expect(()=>repo.importDocument(bytes)).toThrow('LIBRARY_IMPORT_CONFLICT');expect(data.get(PATTERN_LIBRARY_KEY)).toBe(before);
  });
  it('rejects invalid backups and oversized or invalid UTF-8 bytes without touching storage',()=>{
    const {repo,data}=setup();repo.save(recipe);const before=data.get(PATTERN_LIBRARY_KEY);
    const encode=(input:unknown)=>new TextEncoder().encode(JSON.stringify(input));
    for(const bytes of [new Uint8Array(65537),new Uint8Array([255]),encode({}),encode({format:'patturn-pattern-library',version:2,entries:[]}),
      encode({format:'patturn-pattern-library',version:1,entries:[recipe,recipe]}),
      encode({format:'patturn-pattern-library',version:1,entries:[{...recipe,patternId:'unknown'}]})]){
      expect(()=>repo.importDocument(bytes)).toThrow();expect(data.get(PATTERN_LIBRARY_KEY)).toBe(before);
    }
  });
  it('enforces merged capacity and preserves existing bytes on denied imports',()=>{
    const source=setup();source.repo.save(recipe);const bytes=source.repo.exportDocument();
    const {repo,data,storage}=setup();for(let i=0;i<30;i++)repo.save({...recipe,name:`row ${i}`});
    const before=data.get(PATTERN_LIBRARY_KEY);expect(()=>repo.importDocument(bytes)).toThrow('LIBRARY_FULL');expect(data.get(PATTERN_LIBRARY_KEY)).toBe(before);
    data.delete(PATTERN_LIBRARY_KEY);storage.setItem=()=>{throw Error('quota');};expect(()=>repo.importDocument(bytes)).toThrow('quota');expect(data.has(PATTERN_LIBRARY_KEY)).toBe(false);
  });

});
