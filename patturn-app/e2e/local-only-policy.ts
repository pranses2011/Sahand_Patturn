import { writeFile } from 'node:fs/promises';
import type { TestInfo, BrowserContext } from '@playwright/test';

/** Browser lab policy, not an OS firewall or installed-desktop offline claim. */
export async function localOnlyPolicy(context: BrowserContext, baseURL: string) {
  const origin = new URL(baseURL).origin;
  const blocked: { url: string; method: string }[] = [];
  const localRequests: string[] = [];
  await context.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      url.origin === origin &&
      ['http:', 'https:'].includes(url.protocol) &&
      ['GET', 'HEAD'].includes(request.method())
    ) {
      localRequests.push(url.pathname);
      await route.continue();
    } else if (['data:', 'blob:'].includes(url.protocol)) {
      await route.continue();
    } else {
      blocked.push({ url: request.url(), method: request.method() });
      await route.abort('blockedbyclient');
    }
  });
  await context.routeWebSocket('**/*', (socket) => {
    blocked.push({ url: socket.url(), method: 'WEBSOCKET' });
    socket.close({ code: 1008, reason: 'Local assets only' });
  });
  return { blocked, localRequests };
}

export async function writeLocalOnlyAudit(
  info: TestInfo,
  name: string,
  audit: Awaited<ReturnType<typeof localOnlyPolicy>>,
) {
  const reportPath = info.outputPath(`offline-${name}-audit.json`);
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        scope:
          'Fresh browser context, service workers blocked by test configuration; local GET/HEAD assets only, external/write requests and all WebSockets denied. Local web-server access remains allowed. Not an OS firewall or installed Windows offline evidence.',
        ...audit,
      },
      null,
      2,
    ),
  );
  await info.attach(`offline-${name}-audit`, { path: reportPath, contentType: 'application/json' });
}
