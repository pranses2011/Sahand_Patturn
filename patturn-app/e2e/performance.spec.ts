import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus, platform, arch } from 'node:os';

interface Sample {
  lcpMs: number;
  firstGeometryDrawMs: number;
  domContentLoadedMs: number;
  jsTransferBytes: number;
  jsResourceBytes: number;
  lcpElement: string | null;
}

test('measure three fresh-context editor loads without changing application state', async ({
  browser,
  baseURL,
}, testInfo) => {
  const samples: Sample[] = [];
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        const state = { lcpMs: 0, lcpElement: null as string | null, firstGeometryDrawMs: 0 };
        Object.assign(window, { performanceSample: state });
        const record = (entries: PerformanceEntry[]) => {
          for (const entry of entries) {
            const candidate = entry as PerformanceEntry & { element?: Element };
            state.lcpMs = candidate.startTime;
            // No text, user data or DOM serialization is written to the report.
            state.lcpElement = candidate.element?.tagName ?? null;
          }
        };
        const observer = new PerformanceObserver((list) => record(list.getEntries()));
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
        Object.assign(window, { flushPerformanceSample: () => record(observer.takeRecords()) });
        const proto = WebGL2RenderingContext.prototype;
        const draw = proto.drawElements;
        proto.drawElements = function (
          ...args: Parameters<WebGL2RenderingContext['drawElements']>
        ) {
          const result = draw.apply(this, args);
          if (!state.firstGeometryDrawMs && args[0] === this.TRIANGLES && args[1] > 0)
            state.firstGeometryDrawMs = performance.now();
          return result;
        };
      });
      await page.goto(baseURL ?? 'http://127.0.0.1:4173', { waitUntil: 'load' });
      await expect(page.locator('.viewport canvas')).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as unknown as { performanceSample: Sample }).performanceSample
                .firstGeometryDrawMs,
          ),
        )
        .toBeGreaterThan(0);
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      // Fixed observation window after first geometry draw; no input that would end LCP observation.
      await page.waitForTimeout(1000);
      const sample = await page.evaluate(() => {
        const state = window as unknown as {
          performanceSample: Sample;
          flushPerformanceSample: () => void;
        };
        state.flushPerformanceSample();
        const navigation = performance.getEntriesByType(
          'navigation',
        )[0] as PerformanceNavigationTiming;
        const scripts = (
          performance.getEntriesByType('resource') as PerformanceResourceTiming[]
        ).filter((entry) => new URL(entry.name).pathname.endsWith('.js'));
        return {
          ...state.performanceSample,
          domContentLoadedMs: navigation.domContentLoadedEventEnd,
          jsTransferBytes: scripts.reduce((sum, entry) => sum + entry.transferSize, 0),
          jsResourceBytes: scripts.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
        };
      });
      expect(errors).toEqual([]);
      expect(sample.lcpMs).toBeGreaterThan(0);
      expect(sample.jsResourceBytes).toBeGreaterThan(0);
      samples.push(sample);
    } finally {
      await context.close();
    }
  }
  const manifest = await readFile('apps/web/dist/.vite/manifest.json');
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[1]!;
  const report = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    environment: {
      browser: browser.version(),
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      renderer: 'SwiftShader',
      viewport: { width: 1365, height: 768 },
      cpuThrottling: 'none',
      networkThrottling: 'none',
    },
    manifestSha256: createHash('sha256').update(manifest).digest('hex'),
    scope:
      'Three fresh browser contexts; empty browser storage/cache, warm server/OS caches. Local production preview. LCP observed through one second after first geometry draw and font readiness; first indexed triangle draw is separately measured, not LCP or GPU completion. Not installed Windows, mobile, physical GPU or field evidence.',
    samples,
    median: {
      lcpMs: median(samples.map((s) => s.lcpMs)),
      firstGeometryDrawMs: median(samples.map((s) => s.firstGeometryDrawMs)),
    },
    roadmapLcpTargetMs: 2000,
    enforcingTimingBudget: false,
  };
  await mkdir('.cache', { recursive: true });
  await writeFile('.cache/browser-performance.json', JSON.stringify(report, null, 2) + '\n');
  await testInfo.attach('browser-performance', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  console.log(JSON.stringify(report.median));
});
