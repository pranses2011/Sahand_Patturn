export type EditorSection = 'form' | 'pattern' | 'mold' | 'export';
const SECTIONS: {id:EditorSection;label:string}[] = [
  {id:'form',label:'🏺 فرم'}, {id:'pattern',label:'🔷 الگو'},
  {id:'mold',label:'🧱 قالب'}, {id:'export',label:'📤 خروجی'},
];

/** Native buttons retain Tab / Shift+Tab / Enter / Space semantics; not ARIA tabs. */
export function EditorNavigation({section,onChange}:{section:EditorSection;onChange:(section:EditorSection)=>void}) {
  return <nav aria-label="بخش‌های طراحی"><ul className="parts">
    {SECTIONS.map(({id,label})=><li key={id}>
      <button type="button" aria-current={section===id?'page':undefined} onClick={()=>onChange(id)}>{label}</button>
    </li>)}
  </ul></nav>;
}
