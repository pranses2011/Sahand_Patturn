import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page, type TestInfo } from '@playwright/test';

/** Attach incomplete checks too: zero automated violations is not AA certification. */
async function audit(page: Page, info: TestInfo, state: string) {
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const reportPath = info.outputPath(`accessibility-${state}.json`);
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        state,
        engine: report.testEngine,
        environment: report.testEnvironment,
        tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
        passedRules: report.passes.length,
        inapplicableRules: report.inapplicable.length,
        violations: report.violations,
        incomplete: report.incomplete,
        limitation:
          'Automated Chromium scan only; not manual keyboard/screen-reader or physical contrast certification.',
      },
      null,
      2,
    ),
  );
  await info.attach(`accessibility-${state}.json`, {
    contentType: 'application/json',
    path: reportPath,
  });
  expect(
    report.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })),
    state,
  ).toEqual([]);
}

test('WCAG automated scan covers four editor sections and all ten expanded tools', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('radio', { name: 'حرفه‌ای', exact: true }).check();
  await audit(page, info, 'form-pro');
  await page.locator('.btn.primary').hover();
  await audit(page, info, 'primary-hover');
  for (const [name, state] of [
    ['🔷 الگو', 'pattern-pro'],
    ['🧱 قالب', 'mold-pro'],
    ['📤 خروجی', 'export-pro'],
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    await audit(page, info, state!);
  }
  for (const selector of [
    '.chuck-tool',
    '.rounder-tool',
    '.horizontal-split-tool',
    '.jigsaw-tool',
    '.slab-tool',
    '.rib-tool',
    '.extruder-tool',
    '.loft-sweep-tool',
    '.image-trace-tool',
    '.foot-ring-tool',
  ]) {
    const panel = page.locator(selector);
    await panel.locator('summary').click();
    await expect(panel.locator('input').first()).toBeVisible();
    await audit(page, info, selector.slice(1));
  }
});

test('WCAG automated scan covers simple controls, open auxiliary panels and narrow layout', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await audit(page, info, 'form-simple');
  for (const selector of [
    '.local-profile',
    '.privacy-notice',
    '.feature-requests',
    '.update-panel',
  ]) {
    await page.locator(selector).locator('summary').click();
  }
  await audit(page, info, 'auxiliary-panels');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.locator('.saved-patterns > summary').click();
  await audit(page, info, 'saved-patterns');
  await page.setViewportSize({ width: 390, height: 844 });
  await audit(page, info, 'narrow-pattern');
});
