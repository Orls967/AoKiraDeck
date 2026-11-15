import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * README screenshot gallery. See `playwright.screenshots.config.ts` for usage.
 *
 * SHOTS_TARGET=pages -> live GitHub Pages build (Rust/WASM in the browser, API offline)
 * SHOTS_TARGET=api   -> local build wired to FastAPI (Python enrichment & optimization)
 */
const TARGET = process.env.SHOTS_TARGET ?? 'pages';
const OUT_DIR = path.resolve(process.cwd(), '../../docs/screenshots');
mkdirSync(OUT_DIR, { recursive: true });

const file = (name: string) => path.join(OUT_DIR, `${name}.png`);

async function settle(page: Page, ms = 1200) {
  await page.waitForTimeout(ms);
}

async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  await page.screenshot({ path: file(name), fullPage: opts.fullPage ?? false });
}

async function shotOf(locator: Locator, name: string) {
  await locator.scrollIntoViewIfNeeded();
  await locator.screenshot({ path: file(name) });
}

async function waitForEngine(page: Page) {
  await expect(page.getByText(/^(READY|RUNNING)$/).first()).toBeVisible();
  const canvas = page.locator('canvas').first();
  await expect
    .poll(async () => (await canvas.boundingBox())?.width ?? 0)
    .toBeGreaterThan(300);
  await settle(page, 1500);
}

async function nav(page: Page, label: RegExp) {
  await page.getByRole('link', { name: label }).first().click();
  await settle(page, 800);
}

async function cameraPreset(page: Page, label: RegExp) {
  await page
    .getByRole('toolbar', { name: 'Camera Presets' })
    .first()
    .getByRole('button', { name: label })
    .click();
  await settle(page, 1600);
}

async function runCycles(page: Page, quantity: number) {
  await page.getByRole('button', { name: /^Fixed$/i }).click();
  const qty = page.getByLabel(/Target Quantity/i);
  await qty.fill(String(quantity));
  await page.getByRole('button', { name: /^4x$/i }).click();
  await page.getByRole('button', { name: /^Start$/i }).click();
}

test.describe('Live GitHub Pages (browser-only mode)', () => {
  test.skip(TARGET !== 'pages', 'pages target only');

  test('01 Overview', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'AoKira', level: 1 })).toBeVisible();
    const telemetry = page.getByTestId('overview-telemetry-strip');
    await expect
      .poll(async () => {
        const m = ((await telemetry.textContent()) ?? '').match(/t = (\d+\.\d+)s/);
        return m ? parseFloat(m[1]) : 0;
      })
      .toBeGreaterThan(4.5);
    await shot(page, '01-overview-hero');
    await shotOf(telemetry, '01-overview-telemetry');

    await cameraPreset(page, /Top$/);
    await shot(page, '01-overview-camera-top');
    await cameraPreset(page, /Front$/);
    await shot(page, '01-overview-camera-front');
  });

  test('02 Digital Twin', async ({ page }) => {
    await page.goto('./digital-twin');
    await waitForEngine(page);
    await shot(page, '02-twin-default');

    const canvasPanel = page.locator('canvas').first();
    for (const [label, name] of [
      [/1\s*Isometric/i, 'iso'],
      [/2\s*Front/i, 'front'],
      [/3\s*Side/i, 'side'],
      [/4\s*Top/i, 'top'],
    ] as const) {
      await cameraPreset(page, label);
      await shotOf(canvasPanel, `02-twin-camera-${name}`);
    }
    await cameraPreset(page, /1\s*Isometric/i);

    await page.getByRole('button', { name: /Two-Finger Parallel Gripper/i }).first().click();
    await expect(page.getByTestId('component-info-panel')).toHaveText(/gripper/);
    await settle(page, 1500);
    await shot(page, '02-twin-select-gripper');

    await page.getByRole('button', { name: 'Isolate 6-Axis Articulated Robot' }).click();
    await settle(page, 1500);
    await shot(page, '02-twin-isolate-robot');
    await page.getByRole('button', { name: /Reset View/i }).click();
    await settle(page);

    await page.getByLabel('Collision Volumes').check();
    await page.getByLabel('Reach Envelope').check();
    await settle(page, 1500);
    await shot(page, '02-twin-overlays');
    await page.getByLabel('Collision Volumes').uncheck();
    await page.getByLabel('Reach Envelope').uncheck();

    await page.getByLabel('Exploded View').fill('70');
    await settle(page, 1800);
    await shot(page, '02-twin-exploded');
    await page.getByLabel('Exploded View').fill('0');
    await settle(page);

    await page.getByLabel(/J1 Base Yaw/i).fill('45');
    await page.getByLabel(/J2 Shoulder Pitch/i).fill('35');
    await page.getByLabel(/J3 Elbow Pitch/i).fill('-15');
    await page.getByLabel(/J5 Wrist Pitch/i).fill('40');
    await settle(page, 1500);
    await shot(page, '02-twin-joint-jog');

    await page.getByRole('button', { name: 'Input Hover' }).click();
    await page.getByRole('button', { name: /Solve & Apply IK/i }).click();
    await expect(page.getByText(/Solved within/i)).toBeVisible();
    await settle(page, 1800);
    await shot(page, '02-twin-ik-solved');

    await page.getByLabel(/^x \(m\)/i).fill('2.500');
    await page.getByLabel(/^y \(m\)/i).fill('1.500');
    await page.getByLabel(/^z \(m\)/i).fill('2.500');
    await page.getByRole('button', { name: /Solve & Apply IK/i }).click();
    await expect(page.getByText(/UNREACHABLE_TARGET/i).first()).toBeVisible();
    await settle(page, 600);
    await shot(page, '02-twin-ik-unreachable');
  });

  test('03 Simulation Lab + 04 Analytics (offline)', async ({ page }) => {
    await page.goto('./analytics');
    await expect(page.getByTestId('analytics-empty-state')).toBeVisible();
    await settle(page, 800);
    await shot(page, '04-analytics-empty');

    await nav(page, /03 Simulation Lab/i);
    await waitForEngine(page);
    await shot(page, '03-sim-ready');

    await runCycles(page, 3);
    const stepper = page.getByTestId('stage-stepper');
    await expect(stepper).toBeVisible();
    // Grab a mid-cycle frame while the robot carries the billet.
    await expect(page.getByText('TRANSFER_TO_STATION').first()).toBeVisible({ timeout: 30_000 });
    await settle(page, 400);
    await shot(page, '03-sim-running');

    await expect(page.getByText('COMPLETED', { exact: true }).first()).toBeVisible({
      timeout: 90_000,
    });
    await settle(page, 1200);
    await shot(page, '03-sim-completed');
    await shotOf(page.getByTestId('simulation-event-log'), '03-sim-event-log');

    await page.getByRole('link', { name: /Open Performance Analytics/i }).click();
    await expect(page.getByTestId('analytics-kpi-grid')).toBeVisible();
    await expect(page.getByTestId('backend-unavailable-banner')).toBeVisible();
    await settle(page, 1500);
    await shot(page, '04-analytics-offline', { fullPage: true });

    // Fault handling: scenario B, continuous mode, collision overlay, then E-Stop.
    await nav(page, /03 Simulation Lab/i);
    await page.getByRole('button', { name: /^Reset$/i }).click();
    await settle(page, 800);
    await page.getByLabel('Scenario Preset').selectOption({ label: 'Scenario B: Faster Robot Motion' });
    await page.getByRole('button', { name: /^Continuous$/i }).click();
    await page.getByRole('button', { name: /^Collisions$/i }).click();
    await page.getByRole('button', { name: /^2x$/i }).click();
    await page.getByRole('button', { name: /^Start$/i }).click();
    await page.waitForTimeout(3500);
    await page.getByRole('button', { name: /E-Stop Fault Trigger/i }).click();
    await expect(page.getByTestId('active-fault-banner')).toBeVisible();
    await settle(page, 800);
    await shot(page, '03-sim-estop-fault');
  });

  test('05 Optimization (offline)', async ({ page }) => {
    await page.goto('./optimization');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('optimization-unavailable-banner')).toBeVisible();
    await settle(page, 1500);
    await shot(page, '05-optimization-offline', { fullPage: true });
  });
});

test.describe('Mobile (live GitHub Pages)', () => {
  test.skip(TARGET !== 'pages', 'pages target only');
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('06 Mobile', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await settle(page, 4000);
    await shot(page, '06-mobile-overview');
    await page.getByRole('button', { name: /Open navigation menu/i }).click();
    await settle(page, 600);
    await shot(page, '06-mobile-nav');

    await page.goto('./simulation');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await settle(page, 3000);
    await shot(page, '06-mobile-simulation');

    await page.goto('./digital-twin');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await settle(page, 3000);
    await shot(page, '06-mobile-digital-twin');
  });
});

test.describe('With FastAPI backend (local)', () => {
  test.skip(TARGET !== 'api', 'api target only');

  test('04 Analytics with Python enrichment', async ({ page }) => {
    await page.goto('./simulation');
    await waitForEngine(page);
    await expect(page.getByText('API Online')).toBeVisible();
    await runCycles(page, 3);
    await expect(page.getByText('COMPLETED', { exact: true }).first()).toBeVisible({
      timeout: 90_000,
    });
    await settle(page, 800);
    await page.getByRole('link', { name: /Open Performance Analytics/i }).click();

    const enrichment = page.getByTestId('backend-enrichment-panel');
    await expect(enrichment).toContainText('VERIFIED PARITY');
    await settle(page, 1800);
    await shot(page, '04-analytics-kpis');
    await shot(page, '04-analytics-full', { fullPage: true });
    await shotOf(enrichment, '04-analytics-python-enrichment');
  });

  test('05 Optimization Center', async ({ page }) => {
    await page.goto('./optimization');
    await expect(page.getByText('API Online')).toBeVisible();
    await settle(page, 800);
    await shot(page, '05-optimization-default', { fullPage: true });

    await page.getByRole('button', { name: /Compare Scenarios/i }).click();
    await expect(page.getByTestId('scenario-comparison-table')).toBeVisible();
    await settle(page, 1500);
    await shot(page, '05-optimization-compare', { fullPage: true });

    await page.getByRole('button', { name: 'Balanced', exact: true }).click();
    await page.getByRole('button', { name: /Run Optimization/i }).click();
    const card = page.getByTestId('recommended-config-card');
    await expect(card).toBeVisible();
    await settle(page, 1500);
    await shotOf(card, '05-optimization-result');

    // Min Cycle vs Balanced vs Min Energy on the same bounds, plus the trade-off map.
    await page.getByRole('button', { name: /Compare Objectives/i }).click();
    const objectives = page.getByTestId('objective-comparison');
    await expect(objectives.locator('tbody tr')).toHaveCount(3);
    await settle(page, 1500);
    await shotOf(objectives, '05-optimization-objectives');
    await shotOf(page.getByTestId('tradeoff-map'), '05-optimization-tradeoff-map');
    await shot(page, '05-optimization-recommendation', { fullPage: true });

    await page.getByLabel(/Min Throughput/i).fill('100000');
    await page.getByRole('button', { name: /Run Optimization/i }).click();
    await expect(page.getByTestId('optimization-error-banner')).toContainText('INFEASIBLE_OPTIMIZATION');
    await settle(page, 800);
    await shotOf(page.getByTestId('optimization-error-banner'), '05-optimization-infeasible');

    await page.getByTestId('load-optimized-btn').click();
    await expect(page).toHaveURL(/\/simulation$/);
    await expect(page.getByLabel('Scenario Preset')).toHaveValue(/-optimized$/);
    await waitForEngine(page);
    await shot(page, '05-optimization-loaded-into-lab');
  });

  test('07 API docs', async ({ page }) => {
    const apiBase = process.env.SHOTS_API_URL ?? 'http://127.0.0.1:8000';
    await page.goto(`${apiBase}/api/v1/docs`);
    await expect(page.getByText(/AoKira Analytics/i).first()).toBeVisible();
    await settle(page, 1200);
    await shot(page, '07-api-swagger');
  });
});
