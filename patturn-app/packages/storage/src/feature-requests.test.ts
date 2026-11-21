import { describe, expect, it, vi } from 'vitest';
import { FEATURE_REQUESTS_KEY, FeatureRequestRepo, sortFeatureRequests } from './feature-requests.js';
function setup(){
  const data=new Map<string,string>(),storage={getItem:(key:string)=>data.get(key)??null,setItem:vi.fn((key:string,value:string)=>{data.set(key,value);})};
  return {data,storage,repo:new FeatureRequestRepo(storage)};
}
describe('Private local feature requests',()=>{
  it('adds trimmed ideas with stable IDs and re-reads the latest votes',()=>{
    const {repo,storage}=setup();expect(repo.list()).toEqual([]);expect(storage.setItem).not.toHaveBeenCalled();
    repo.add(' اول ',100);repo.add('دوم',100);repo.vote(1);
    const another=new FeatureRequestRepo(storage);another.vote(1);
    expect(repo.list()[0]).toEqual({id:1,text:'اول',votes:2,createdAt:100});
    const entries=repo.list();entries[0]!.text='mutation';expect(repo.list()[0]!.text).toBe('اول');
  });
  it('sorts Top/New stably without mutating storage order',()=>{
    const {repo}=setup();repo.add('old',100);repo.add('new',200);repo.add('tie',200);repo.vote(1);
    const entries=repo.list();expect(sortFeatureRequests(entries,'top').map((item)=>item.id)).toEqual([1,3,2]);
    expect(sortFeatureRequests(entries,'new').map((item)=>item.id)).toEqual([3,2,1]);expect(entries.map((item)=>item.id)).toEqual([1,2,3]);
  });
  it('rejects duplicate or invalid text and bounds entries and vote counts',()=>{
    const {repo,data,storage}=setup();repo.add('first',0);
    for(const text of ['first',' ','x'.repeat(241)])expect(()=>repo.add(text)).toThrow();
    for(let i=1;i<30;i++)repo.add(`idea ${i}`,i);expect(()=>repo.add('overflow')).toThrow('REQUESTS_FULL');
    const document=JSON.parse(data.get(FEATURE_REQUESTS_KEY)!);document.entries[0].votes=9999;
    data.set(FEATURE_REQUESTS_KEY,JSON.stringify(document));storage.setItem.mockClear();
    expect(repo.vote(1)[0]!.votes).toBe(9999);expect(storage.setItem).not.toHaveBeenCalled();expect(()=>repo.vote(500)).toThrow('REQUESTS_NOT_FOUND');
  });
  it('never overwrites corrupt, duplicate-ID or oversized existing storage',()=>{
    const {repo,data}=setup();const entry={id:1,text:'test',votes:0,createdAt:0};
    for(const raw of ['{broken',' '.repeat(32769),JSON.stringify({version:1,entries:[entry,entry]})]){
      data.set(FEATURE_REQUESTS_KEY,raw);expect(()=>repo.add('new')).toThrow();expect(()=>repo.vote(1)).toThrow();expect(data.get(FEATURE_REQUESTS_KEY)).toBe(raw);
    }
  });
  it('preserves bytes when writes are denied',()=>{
    const {repo,data,storage}=setup();repo.add('first');const before=data.get(FEATURE_REQUESTS_KEY);
    storage.setItem.mockImplementation(()=>{throw Error('quota');});expect(()=>repo.vote(1)).toThrow('quota');
    expect(()=>repo.add('second')).toThrow('quota');expect(data.get(FEATURE_REQUESTS_KEY)).toBe(before);
  });
  it('exports a versioned deterministic JSON without changing votes or order',()=>{
    const {repo,storage}=setup();repo.add('idea',10);repo.vote(1);storage.setItem.mockClear();
    const first=repo.exportDocument();expect(repo.exportDocument()).toEqual(first);
    expect(JSON.parse(new TextDecoder().decode(first))).toEqual({format:'patturn-local-feature-requests',version:1,entries:[{id:1,text:'idea',votes:1,createdAt:10}]});
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
