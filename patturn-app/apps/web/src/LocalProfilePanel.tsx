import { useEffect, useState } from 'react';
import { EMPTY_LOCAL_PROFILE, LocalProfileRepo } from '@patturn/storage';

export function LocalProfilePanel() {
  const [profile,setProfile]=useState({...EMPTY_LOCAL_PROFILE});
  const [draft,setDraft]=useState({...EMPTY_LOCAL_PROFILE});
  const [readable,setReadable]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const repo=()=>new LocalProfileRepo(window.localStorage);
  const load=()=>{
    try {
      const next=repo().load();setProfile(next);setDraft(next);setReadable(true);setError('');setMessage('');
    } catch {
      setReadable(false);setError('پروفایل محلی خوانده نشد؛ دادهٔ قبلی بازنویسی نمی‌شود. دوباره بخوانید یا با تأیید، پروفایل را حذف کنید.');
    }
  };
  useEffect(load,[]);
  return <details className="local-profile">
    <summary>پروفایل محلی و تنظیمات نمایش نام</summary>
    <p className="hint">اختیاری، فقط روی همین دستگاه و پروفایل مرورگر؛ حساب آنلاین یا احراز هویت نیست. نام و ایمیل به سرور یا فایل پروژه و خروجی ساخت افزوده نمی‌شوند. رمز یا اطلاعات حساس وارد نکنید.</p>
    {profile.showName && profile.name && <p>پروفایل محلی: {profile.name}</p>}
    <form onSubmit={(event)=>{
      event.preventDefault();if(!readable)return;
      try {
        const next=repo().save(draft);setProfile(next);setDraft(next);setError('');setMessage('پروفایل فقط روی همین دستگاه ذخیره شد.');
      } catch {setMessage('');setError('پروفایل ذخیره نشد؛ نام باید حداکثر ۸۰ نویسه و ایمیل خالی یا معتبر باشد. دسترسی و فضای ذخیره را هم بررسی کنید؛ دادهٔ قبلی پاک نشده است.');}
    }}>
      <label>نام پروفایل محلی<input value={draft.name} maxLength={80} autoComplete="off" onChange={(event)=>setDraft({...draft,name:event.currentTarget.value})} /></label>
      <label>ایمیل پروفایل محلی<input type="email" dir="ltr" value={draft.email} maxLength={254} autoComplete="off" onChange={(event)=>setDraft({...draft,email:event.currentTarget.value})} /></label>
      <label><input type="checkbox" checked={draft.showName} onChange={(event)=>setDraft({...draft,showName:event.currentTarget.checked})} />نمایش نام ذخیره‌شده در این بخش</label>
      <button type="submit" className="btn" disabled={!readable}>ذخیرهٔ پروفایل محلی</button>
    </form>
    <button type="button" className="btn" onClick={load}>بازخوانی پروفایل محلی</button>
    <button type="button" className="btn" onClick={()=>{
      if(!window.confirm('پروفایل محلی و تنظیم نمایش نام حذف شود؟ پروژه، تاریخچه و کتابخانهٔ الگو حذف نمی‌شوند.'))return;
      try {
        repo().clear();setProfile({...EMPTY_LOCAL_PROFILE});setDraft({...EMPTY_LOCAL_PROFILE});setReadable(true);setError('');setMessage('پروفایل محلی حذف شد؛ پروژه تغییر نکرد.');
      } catch {setMessage('');setError('پروفایل حذف نشد؛ دسترسی به ذخیرهٔ محلی را بررسی کنید.');}
    }}>حذف پروفایل محلی</button>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </details>;
}
