import { expect, test, type Page } from '@playwright/test';

function trackRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`CONSOLE_ERROR: ${msg.text()}`);
    }
  });
  return errors;
}

test.describe('AoKira End-to-End Verification (E2E-01..05)', () => {
  test('E2E-01: Overview showcase renders 3D workcell, ticks live via Rust/WASM, and navigates cleanly', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'AoKira', level: 1 })).toBeVisible();
    await expect(page.getByText('API Online')).toBeVisible();

    // Non-zero canvas (waits for ResizeObserver initial mount expansion beyond default 300x150)
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    await expect
      .poll(async () => {
        const box = await canvas.boundingBox();
        return Math.min(box?.width ?? 0, box?.height ?? 0);
      })
      .toBeGreaterThan(300);

    // Wait for live simulation clock to advance beyond 0.20s in showcase mode
    const telemetry = page.getByTestId('overview-telemetry-strip');
    await expect
      .poll(async () => {
        const txt = (await telemetry.textContent()) ?? '';
        const match = txt.match(/t = (\d+\.\d+)s/);
        return match ? parseFloat(match[1]) : 0;
      })
      .toBeGreaterThan(0.2);

    // Measure live browser rAF frame rate over 1.2s during showcase
    const measuredFps = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let frames = 0;
          const start = performance.now();
          const step = () => {
            frames += 1;
            const elapsed = performance.now() - start;
            if (elapsed >= 1200) {
              resolve((frames * 1000) / elapsed);
            } else {
              requestAnimationFrame(step);
            }
          };
          requestAnimationFrame(step);
        }),
    );
    console.log(`[PERF] E2E-01 WebGL Canvas rAF FPS: ${measuredFps.toFixed(1)}`);
    expect(measuredFps).toBeGreaterThan(3);

    // Primary CTA transitions cleanly to Digital Twin
    await page.getByRole('link', { name: /Open Digital Twin/i }).click();
    await expect(page).toHaveURL(/\/digital-twin$/);
    expect(errors).toEqual([]);
  });

  test('E2E-02: Digital Twin tree selection, camera presets, overlays, 6-joint inspector, and IK solve/error', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/digital-twin');

    // Wait until WASM worker settles READY
    await expect(page.getByText(/WASM/).first()).toBeVisible();
    await expect(page.getByText('READY').first()).toBeVisible();

    // Select a component from Workcell Tree
    await page.getByRole('button', { name: /Two-Finger Parallel Gripper/i }).first().click();
    await expect(page.getByTestId('component-info-panel')).toHaveText(/gripper/);

    // Switch Camera Presets (Front, Side, Top, Isometric)
    for (const label of [/2\s*Front/i, /3\s*Side/i, /4\s*Top/i, /1\s*Isometric/i]) {
      const btn = page.getByRole('button', { name: label });
      await btn.click();
      await expect(btn).toHaveAttribute('aria-pressed', 'true');
    }

    // Toggle Collision Volumes + Exploded View slider
    const collisionToggle = page.getByLabel('Collision Volumes');
    await collisionToggle.click();
    await expect(collisionToggle).toBeChecked();

    const explodedSlider = page.getByLabel('Exploded View');
    await explodedSlider.fill('40');
    await expect(page.getByText('40%')).toBeVisible();

    // All 6 joints visible & interactive when READY
    const j1Slider = page.getByLabel(/J1 Base Yaw/i);
    await expect(j1Slider).toBeEnabled();
    await expect(page.getByLabel(/J6 Tool Flange Roll/i)).toBeVisible();

    // Solve reachable IK target
    await page.getByLabel(/^x \(m\)/i).fill('0.450');
    await page.getByLabel(/^y \(m\)/i).fill('0.900');
    await page.getByLabel(/^z \(m\)/i).fill('0.200');
    await page.getByRole('button', { name: /Solve & Apply IK/i }).click();
    await expect(page.getByText(/Solved within/i)).toBeVisible();

    // Unreachable target returns structured error (AC-07)
    await page.getByLabel(/^x \(m\)/i).fill('2.500');
    await page.getByLabel(/^y \(m\)/i).fill('1.500');
    await page.getByLabel(/^z \(m\)/i).fill('2.500');
    await page.getByRole('button', { name: /Solve & Apply IK/i }).click();
    await expect(page.getByText(/UNREACHABLE_TARGET/i)).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('E2E-03: Simulation Lab executes complete pick-and-place cycle and populates Analytics with Python enrichment', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/simulation');

    await expect(page.getByText('READY').first()).toBeVisible();

    // Single Cycle at 4x playback speed
    await page.getByRole('button', { name: /^Single$/i }).click();
    await page.getByRole('button', { name: /^4x$/i }).click();
    await page.getByRole('button', { name: /^Start$/i }).click();

    // Wait for cycle completion (13.02s sim time + return home -> COMPLETED run status)
    const eventLog = page.getByTestId('simulation-event-log');
    await expect(eventLog).toContainText('CYCLE_COMPLETED', { timeout: 25_000 });
    await expect(page.getByText('COMPLETED', { exact: true }).first()).toBeVisible();

    // Navigate directly to Performance Analytics
    await page.getByRole('link', { name: /Open Performance Analytics/i }).click();
    await expect(page).toHaveURL(/\/analytics$/);

    const kpiGrid = page.getByTestId('analytics-kpi-grid');
    await expect(kpiGrid).toBeVisible();
    await expect(kpiGrid).toContainText('1');
    await expect(kpiGrid).toContainText('ms');

    // Python Backend Enrichment populates bottleneck, synthetic energy breakdown & consistency parity
    const enrichment = page.getByTestId('backend-enrichment-panel');
    await expect(enrichment).toBeVisible();
    await expect(enrichment).toContainText('VERIFIED PARITY');
    await expect(enrichment).toContainText(/\d+(\.\d+)?\s+units/);
    await expect(enrichment).toContainText(
      'Synthetic engineering estimate only; not real electrical metering.',
    );

    expect(errors).toEqual([]);
  });

  test('E2E-04: Optimization Center compares presets, runs SciPy SLSQP, handles infeasible errors, and supports offline mode', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/optimization');

    await expect(page.getByText('API Online')).toBeVisible();

    // Compare A-D
    await page.getByRole('button', { name: /Compare Scenarios/i }).click();
    const compareTable = page.getByTestId('scenario-comparison-table');
    await expect(compareTable).toBeVisible();
    await expect(compareTable).toContainText('Scenario A: Baseline');
    await expect(compareTable).toContainText('Scenario B: Faster Robot Motion');

    // Run valid constrained optimization
    await page.getByRole('button', { name: /Run Optimization/i }).click();
    const recCard = page.getByTestId('recommended-config-card');
    await expect(recCard).toBeVisible();
    expect(errors).toEqual([]);

    // Intentional negative & offline tests: assert zero uncaught page errors
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Test INFEASIBLE_OPTIMIZATION diagnostic cleanly (returns expected HTTP 422)
    await page.getByLabel(/Min Throughput/i).fill('100000');
    await page.getByRole('button', { name: /Run Optimization/i }).click();
    await expect(page.getByTestId('optimization-error-banner')).toContainText(
      'INFEASIBLE_OPTIMIZATION',
    );

    // Deploy recommended config into Simulation Lab
    await page.getByTestId('load-optimized-btn').click();
    await expect(page).toHaveURL(/\/simulation$/);
    await expect(page.getByLabel('Scenario Preset')).toHaveValue(/-optimized$/);

    // Verify graceful API offline mode does not block WASM simulation or throw uncaught exceptions (AC-15)
    await page.route('**/api/v1/**', (route) => route.abort());
    await page.getByRole('link', { name: /04 Performance Analytics/i }).click();
    await page.getByRole('button', { name: /Check API/i }).click();
    await expect(page.getByTestId('backend-unavailable-banner')).toBeVisible();
    await page.getByRole('link', { name: /03 Simulation Lab/i }).click();
    await expect(page.getByRole('button', { name: /^Start$/i })).toBeEnabled();
    expect(pageErrors).toEqual([]);
  });

  test('E2E-05: Responsive mobile viewport (390x844) renders all 5 routes without horizontal overflow', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });

    for (const routePath of ['/', '/digital-twin', '/simulation', '/analytics', '/optimization']) {
      await page.goto(routePath, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    }

    // Verify mobile hamburger menu works cleanly
    await page.getByRole('button', { name: /Open navigation menu/i }).click();
    await expect(page.getByRole('navigation', { name: /Mobile Navigation/i })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
