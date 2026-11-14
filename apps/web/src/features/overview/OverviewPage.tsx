import { Link } from 'react-router-dom';
import { WORKCELL_CONFIG } from '@/config/workcell';

export function OverviewPage() {
  return (
    <section className="mx-auto max-w-[1920px] p-6">
      <div className="panel-surface p-6">
        <p className="font-mono text-xs uppercase tracking-wider text-[#36C5D9]">
          01 / Overview
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          AoKira — Industrial Robotic Workcell Digital Twin
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[#94A3B8]">
          Design. Simulate. Optimize. Operate. Canonical workcell {WORKCELL_CONFIG.workcellId} with{' '}
          {WORKCELL_CONFIG.robot.dof}-axis manipulator.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/digital-twin"
            className="rounded bg-[#36C5D9] px-4 py-2 text-xs font-semibold text-[#0B0F14]"
          >
            Open Digital Twin
          </Link>
          <Link
            to="/simulation"
            className="rounded border border-[#243242] bg-[#1C2631] px-4 py-2 text-xs font-semibold text-[#F1F5F9]"
          >
            Launch Simulation Lab
          </Link>
        </div>
      </div>
    </section>
  );
}
