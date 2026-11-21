import { useRef, useState } from 'react';

export type DeliveryOutcome = 'saved' | 'cancelled' | 'requested';
export type FileWriter = (name: string, bytes: Uint8Array) => Promise<DeliveryOutcome>;

/** One native picker at a time. Failed bytes are retained only until retry/new request. */
export function useFileDelivery(write: FileWriter) {
  const busy = useRef(false);
  const failed = useRef<{name:string;bytes:Uint8Array} | null>(null);
  const [status,setStatus] = useState<{pending:boolean;error:boolean;message:string}>({pending:false,error:false,message:''});
  const download = (name:string,bytes:Uint8Array) => {
    if (busy.current) return; // Never open another picker or replace the pending payload.
    // Own an immutable-by-convention snapshot, independent of the caller and writer.
    const snapshot = bytes.slice();
    busy.current = true;
    failed.current = null;
    setStatus({pending:true,error:false,message:`در حال ذخیرهٔ ${name}…`});
    void (async()=>{
      try {
        const outcome = await write(name,snapshot.slice());
        const message = outcome === 'saved' ? `فایل ذخیره شد: ${name}` : outcome === 'cancelled'
          ? `ذخیره لغو شد؛ فایلی نوشته نشد: ${name}` : `درخواست دانلود به مرورگر ارسال شد: ${name}؛ ذخیرهٔ نهایی را در دانلودهای مرورگر بررسی کنید.`;
        setStatus({pending:false,error:false,message});
      } catch {
        failed.current = {name,bytes:snapshot};
        setStatus({pending:false,error:true,message:`ذخیرهٔ ${name} ناموفق بود؛ ممکن است فایل مقصد ناقص باشد. فضای آزاد و مجوز مسیر را بررسی و دوباره تلاش کنید.`});
      } finally { busy.current = false; }
    })();
  };
  const discard = () => {
    if (busy.current || !failed.current) return;
    failed.current = null;
    setStatus({pending:false,error:false,message:'خروجی ناموفق کنار گذاشته شد؛ برای ذخیره، خروجی را دوباره بسازید. تنظیمات پروژه تغییر نکرد.'});
  };
  return {download,status,discard,retry:()=>{const file=failed.current;if(file)download(file.name,file.bytes);}};
}
