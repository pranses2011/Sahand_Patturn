import { z } from 'zod';
import type { HistoryStorage } from './history.js';

export const FEATURE_REQUESTS_KEY='patturn:feature-requests:v1';
const Entry=z.object({id:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),text:z.string().trim().min(1).max(240),votes:z.number().int().min(0).max(9999),createdAt:z.number().int().min(0).max(8640000000000000)}).strict();
export type FeatureRequest=z.infer<typeof Entry>;
const Document=z.object({version:z.literal(1),entries:z.array(Entry).max(30)}).strict();

/** Private local ideas; votes are counters on this device, not community votes. */
export class FeatureRequestRepo {
  constructor(private storage:HistoryStorage){}
  list():FeatureRequest[]{
    const raw=this.storage.getItem(FEATURE_REQUESTS_KEY);if(raw===null)return [];
    if(raw.length>32768)throw Error('REQUESTS_TOO_LARGE');
    const entries=Document.parse(JSON.parse(raw)).entries;
    if(new Set(entries.map((entry)=>entry.id)).size!==entries.length)throw Error('REQUESTS_DUPLICATE_ID');
    return entries;
  }
  private write(entries:FeatureRequest[]):FeatureRequest[]{
    const document=Document.parse({version:1,entries});
    this.storage.setItem(FEATURE_REQUESTS_KEY,JSON.stringify(document));return document.entries;
  }
  add(text:string,createdAt=Date.now()):FeatureRequest[]{
    const entries=this.list();if(entries.length>=30)throw Error('REQUESTS_FULL');
    const id=Math.max(0,...entries.map((entry)=>entry.id))+1;
    const entry=Entry.parse({id,text,votes:0,createdAt});
    if(entries.some((item)=>item.text===entry.text))throw Error('REQUESTS_DUPLICATE_TEXT');
    return this.write([...entries,entry]);
  }
  vote(id:number):FeatureRequest[]{
    const entries=this.list(),entry=entries.find((item)=>item.id===id);
    if(!entry)throw Error('REQUESTS_NOT_FOUND');
    if(entry.votes===9999)return entries;
    return this.write(entries.map((item)=>item.id===id ? {...item,votes:item.votes+1} : item));
  }
  exportDocument():Uint8Array{
    return new TextEncoder().encode(JSON.stringify({format:'patturn-local-feature-requests',version:1,entries:this.list()},null,2));
  }
}
export function sortFeatureRequests(entries:readonly FeatureRequest[],mode:'top'|'new'):FeatureRequest[]{
  return [...entries].sort((a,b)=>(mode==='top' ? b.votes-a.votes : 0)||b.createdAt-a.createdAt||b.id-a.id);
}
