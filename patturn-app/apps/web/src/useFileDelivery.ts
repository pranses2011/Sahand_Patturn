import { useEffect, useRef, useState } from 'react';

export type DeliveryOutcome = 'saved' | 'cancelled' | 'requested';
export type FileWriter = (name: string, bytes: Uint8Array) => Promise<DeliveryOutcome>;

/** One native picker at a time. Failed bytes are retained only until retry/new request. */
export function useFileDelivery(write: FileWriter) {
  const busy = useRef(false);
  const failed = useRef<{name:string;bytes:Uint8Array} | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; failed.current = null; };
  }, []);
  const [status,setStatus] = useState<{pending:boolean;error:boolean;retryable:boolean;message:string}>({pending:false,error:false,retryable:false,message:''});
  const deliver = (name:string,bytes:Uint8Array, ownedSnapshot = false) => {
    if (!mounted.current || busy.current) return; // Never open another picker or replace the pending payload.
    // Own an immutable-by-convention snapshot, independent of the caller and writer.
    let snapshot: Uint8Array;
    try { snapshot = ownedSnapshot ? bytes : bytes.slice(); }
    catch {
      failed.current = null;
      setStatus({pending:false,error:true,retryable:false,message:`آماده‌سازی ${name} ناموفق بود؛ خروجی را دوباره بسازید. تنظیمات پروژه تغییر نکرد و ذخیره آغاز نشد.`});
      return;
    }
    busy.current = true;
    failed.current = null;
    setStatus({pending:true,error:false,retryable:false,message:`در حال ذخیرهٔ ${name}…`});
    void (async()=>{
      let writerStarted = false;
      try {
        const payload = snapshot.slice();
        writerStarted = true;
        const outcome = await write(name,payload);
        if (!mounted.current) return;
        const message = outcome === 'saved' ? `فایل ذخیره شد: ${name}` : outcome === 'cancelled'
          ? `ذخیره لغو شد؛ فایلی نوشته نشد: ${name}` : `درخواست دانلود به مرورگر ارسال شد: ${name}؛ ذخیرهٔ نهایی را در دانلودهای مرورگر بررسی کنید.`;
        setStatus({pending:false,error:false,retryable:false,message});
      } catch {
        if (!mounted.current) return;
        failed.current = {name,bytes:snapshot};
        setStatus({pending:false,error:true,retryable:true,message:writerStarted
          ? `ذخیرهٔ ${name} ناموفق بود؛ ممکن است فایل مقصد ناقص باشد. فضای آزاد و مجوز مسیر را بررسی و دوباره تلاش کنید.`
          : `آماده‌سازی نسخهٔ تحویل ${name} ناموفق بود؛ ذخیره آغاز نشد. نسخهٔ خروجی برای تلاش دوباره نگه داشته شد.`});
      } finally { busy.current = false; }
    })();
  };
  const discard = () => {
    if (!mounted.current || busy.current || !status.error) return;
    failed.current = null;
    setStatus({pending:false,error:false,retryable:false,message:'خروجی ناموفق کنار گذاشته شد؛ برای ذخیره، خروجی را دوباره بسازید. تنظیمات پروژه تغییر نکرد.'});
  };
  return {
    download:(name:string,bytes:Uint8Array)=>deliver(name,bytes),
    status,discard,
    // This payload is already owned; only copy for the untrusted writer, never
    // re-copy the retry snapshot and risk discarding it on allocation failure.
    retry:()=>{const file=failed.current;if(file)deliver(file.name,file.bytes,true);},
  };
}
