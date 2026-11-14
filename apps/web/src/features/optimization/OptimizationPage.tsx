import { PRESET_SCENARIOS } from '@/config/scenarios';

export function OptimizationPage() {
  return (
    <section className="mx-auto max-w-[1920px] p-6">
      <div className="panel-surface p-6">
        <p className="font-mono text-xs uppercase tracking-wider text-[#36C5D9]">
          05 / Optimization Center
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold">
          Multi-Scenario Comparison &amp; Optimization
        </h1>
        <p className="mt-2 text-sm text-[#94A3B8]">
          {PRESET_SCENARIOS.length} canonical baseline/variant presets loaded.
        </p>
      </div>
    </section>
  );
}
