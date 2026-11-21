import { z } from 'zod';

export const LOCAL_PROFILE_KEY = 'patturn:local-profile:v1';
const Profile = z.object({
  name: z.string().trim().max(80),
  email: z.union([z.literal(''), z.email().max(254)]),
  showName: z.boolean(),
}).strict();
export type LocalProfile = z.infer<typeof Profile>;
export const EMPTY_LOCAL_PROFILE: LocalProfile = {name:'',email:'',showName:false};
interface ProfileStorage {
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
  removeItem(key:string):void;
}
const Document = z.object({version:z.literal(1),profile:Profile}).strict();

/** Optional local identity, not authentication. Never embedded in project exports. */
export class LocalProfileRepo {
  constructor(private storage:ProfileStorage) {}
  load():LocalProfile {
    const raw=this.storage.getItem(LOCAL_PROFILE_KEY);
    if(raw===null)return {...EMPTY_LOCAL_PROFILE};
    if(raw.length>8192)throw Error('LOCAL_PROFILE_TOO_LARGE');
    return Document.parse(JSON.parse(raw)).profile;
  }
  save(input:LocalProfile):LocalProfile {
    const profile=Profile.parse({...input,email:input.email.trim()});
    this.load(); // Refuse to overwrite corrupt or inaccessible existing data.
    const document=JSON.stringify({version:1,profile});
    if(this.storage.getItem(LOCAL_PROFILE_KEY)!==document)this.storage.setItem(LOCAL_PROFILE_KEY,document);
    return profile;
  }
  clear():void { this.storage.removeItem(LOCAL_PROFILE_KEY); }
}
