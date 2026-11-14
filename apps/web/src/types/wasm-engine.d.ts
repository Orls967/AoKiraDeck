declare module '@/wasm/aokira_engine' {
  export default function init(module_or_path?: unknown): Promise<unknown>;
  export function engine_version(): string;
  export class AokiraSimEngine {
    constructor(workcellJson?: string);
    load_scenario(scenarioJson: string): string;
    command(action: string): string;
    step_ticks(tickCount: number): string;
    set_joints(anglesJson: string): string;
    solve_ik(targetPoseJson: string, apply: boolean): string;
    set_gripper(open: boolean): string;
    get_snapshot_json(): string;
    get_metrics_json(): string;
  }
}
