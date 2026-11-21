import { describe, expect, it, vi } from 'vitest';
import { EMPTY_LOCAL_PROFILE, LOCAL_PROFILE_KEY, LocalProfileRepo } from './local-profile.js';
function setup(){
  const data=new Map<string,string>();
  const storage={getItem:(key:string)=>data.get(key)??null,setItem:vi.fn((key:string,value:string)=>{data.set(key,value);}),removeItem:vi.fn((key:string)=>{data.delete(key);})};
  return {data,storage,repo:new LocalProfileRepo(storage)};
}
const profile={name:'نام محلی',email:'person@example.com',showName:true};
describe('Optional local profile',()=>{
  it('returns isolated defaults without writing and round-trips trimmed explicit edits',()=>{
    const {repo,storage}=setup();const empty=repo.load();empty.name='changed';expect(repo.load()).toEqual(EMPTY_LOCAL_PROFILE);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(repo.save({...profile,name:` ${profile.name} `,email:` ${profile.email} `})).toEqual(profile);
    const result=repo.load();result.name='mutated';expect(repo.load()).toEqual(profile);
    repo.save(profile);expect(storage.setItem).toHaveBeenCalledTimes(1);
  });
  it.each([{...profile,name:'x'.repeat(81)},{...profile,email:'bad'},{...profile,showName:'yes'},{...profile,unknown:true}])('rejects invalid profile %j without changing saved bytes',(input)=>{
    const {repo,data}=setup();repo.save(profile);const before=data.get(LOCAL_PROFILE_KEY);
    expect(()=>repo.save(input as typeof profile)).toThrow();expect(data.get(LOCAL_PROFILE_KEY)).toBe(before);
  });
  it.each(['{broken',JSON.stringify({version:2,profile}),' '.repeat(8193)])('preserves corrupt existing data until explicit deletion',(raw)=>{
    const {repo,data}=setup();data.set(LOCAL_PROFILE_KEY,raw);
    expect(()=>repo.load()).toThrow();expect(()=>repo.save(profile)).toThrow();expect(data.get(LOCAL_PROFILE_KEY)).toBe(raw);
    repo.clear();expect(repo.load()).toEqual(EMPTY_LOCAL_PROFILE);
  });
  it('deletes only the profile key, leaving project and library data alone',()=>{
    const {repo,data,storage}=setup();data.set('patturn:editor-history:v1','history');data.set('patturn:pattern-library:v1','library');
    repo.save(profile);repo.clear();expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(LOCAL_PROFILE_KEY);
    expect([...data.values()]).toEqual(['history','library']);
  });
  it('propagates denied reads without attempting a write',()=>{
    const {repo,storage}=setup();storage.getItem=()=>{throw Error('read denied');};
    expect(()=>repo.load()).toThrow('read denied');expect(()=>repo.save(profile)).toThrow('read denied');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('does not claim success or destroy stored bytes when writes or deletion are denied',()=>{
    const {repo,storage,data}=setup();repo.save(profile);const before=data.get(LOCAL_PROFILE_KEY);
    storage.setItem.mockImplementation(()=>{throw Error('denied');});storage.removeItem.mockImplementation(()=>{throw Error('denied');});
    expect(()=>repo.save({...profile,name:'new'})).toThrow('denied');expect(()=>repo.clear()).toThrow('denied');
    expect(data.get(LOCAL_PROFILE_KEY)).toBe(before);
  });
});
