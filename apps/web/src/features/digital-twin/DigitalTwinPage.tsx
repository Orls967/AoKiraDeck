import { WORKCELL_CONFIG } from '@/config/workcell';

export function DigitalTwinPage() {
  return (
    <section className="mx-auto max-w-[1920px] p-6">
      <div className="panel-surface p-6">
        <p className="font-mono text-xs uppercase tracking-wider text-[#36C5D9]">
          02 / Digital Twin
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold">
          3D Workcell CAD &amp; Joint Inspector
        </h1>
        <p className="mt-2 text-sm text-[#94A3B8]">
          Workcell {WORKCELL_CONFIG.workcellId} ready for Phase 2 3D scene mounting.
        </p>
      </div>
    </section>
  );
}
