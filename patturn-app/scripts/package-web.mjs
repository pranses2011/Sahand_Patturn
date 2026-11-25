import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import { createHash } from 'node:crypto';
export async function webArchive(folder, metadata) {
  const files = {};
  async function visit(relative = '') {
    for (const item of await readdir(path.join(folder, relative), { withFileTypes: true })) {
      if (item.name === '.vite') continue;
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (item.isDirectory()) await visit(name);
      else if (item.isFile())
        files[name] = [
          await readFile(path.join(folder, name)),
          { mtime: new Date('2000-01-01T00:00:00Z') },
        ];
      else throw Error('WEB_RELEASE_UNEXPECTED_FILE');
    }
  }
  await visit();
  if (!files['index.html']) throw Error('WEB_RELEASE_INDEX_MISSING');
  files['README-WEB.txt'] = [
    strToU8(
      'نسخهٔ وب آزمایشی Patturn — نصب/ارتقای دستی\nZIP را در یک پوشهٔ تازه استخراج و ریشهٔ آن را با HTTP استاتیک سرو کنید؛ بازکردن مستقیم index.html با file:// پشتیبانی نمی‌شود. برای نمونه: python -m http.server 8080\nبرای ارتقا فایل‌های وب را کامل جایگزین و صفحه را بازخوانی کنید؛ پیش از ارتقا از پروژه‌ها فایل پشتیبان بگیرید. اطلاعات مرورگر به origin وابسته است؛ تغییر دامنه/پورت آن را منتقل نمی‌کند.\nاین بسته PWA یا آپدیت خودکار نیست. نسخهٔ ویندوز و راهنمای محدودیت‌ها در Release هستند.\n',
    ),
    { mtime: new Date('2000-01-01T00:00:00Z') },
  ];
  files['release-info.json'] = [
    strToU8(
      JSON.stringify({ ...metadata, experimental: true, automaticUpdate: false }, null, 2) + '\n',
    ),
    { mtime: new Date('2000-01-01T00:00:00Z') },
  ];
  return zipSync(files, { level: 6 });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const bytes = await webArchive(path.join(root, 'apps/web/dist'), {
    version,
    commit: process.env.GITHUB_SHA ?? null,
  });
  const output = path.join(root, '.cache/release');
  await mkdir(output, { recursive: true });
  const name = `patturn-web-${version}.zip`;
  await writeFile(path.join(output, name), bytes);
  await writeFile(
    path.join(output, 'WEB-SHA256SUMS.txt'),
    createHash('sha256').update(bytes).digest('hex') + '  ' + name + '\n',
  );
  console.log(path.join(output, name));
}
