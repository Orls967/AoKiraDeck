import type { ComponentId } from '@/types/workcell';
import type { SimulationSnapshot } from '@/types/simulation';
import { WORKCELL_CONFIG } from '@/config/workcell';

interface WebGLFallbackViewProps {
  snapshot?: SimulationSnapshot | null;
  selectedComponentId?: ComponentId | null;
  onSelectComponent?: (id: ComponentId) => void;
  reason?: string;
}

/**
 * 2D SVG engineering schematic fallback (Top Plan + Front Elevation)
 * rendered when WebGL2/WebGL1 is unavailable or context is lost (AC-17).
 */
export function WebGLFallbackView({
  snapshot,
  selectedComponentId,
  onSelectComponent,
  reason = 'WebGL rendering unavailable in current browser environment — displaying live 2D CAD schematic.',
}: WebGLFallbackViewProps) {
  const toTopX = (x: number) => 200 + x * 110;
  const toTopY = (z: number) => 150 + z * 110;

  const toFrontX = (x: number) => 200 + x * 110;
  const toFrontY = (y: number) => 240 - y * 110;

  const links = snapshot?.linkWorldPoses ?? [];
  const tcp = snapshot?.tcpWorldPose?.position ?? { x: 0, y: 0.827, z: -0.524 };
  const workpieces = snapshot?.workpieces ?? [];
  const isCollision = snapshot?.collision.severity === 'COLLISION';
  const isNearCollision = snapshot?.collision.severity === 'NEAR_COLLISION';
  const strokeArm = isCollision ? '#EF4444' : isNearCollision ? '#F59E0B' : '#EA580C';

  const topPoints = links
    .map((p) => `${toTopX(p.position.x).toFixed(1)},${toTopY(p.position.z).toFixed(1)}`)
    .concat(`${toTopX(tcp.x).toFixed(1)},${toTopY(tcp.z).toFixed(1)}`)
    .join(' ');

  const frontPoints = links
    .map((p) => `${toFrontX(p.position.x).toFixed(1)},${toFrontY(p.position.y).toFixed(1)}`)
    .concat(`${toFrontX(tcp.x).toFixed(1)},${toFrontY(tcp.y).toFixed(1)}`)
    .join(' ');

  const selectClass = (id: ComponentId) =>
    selectedComponentId === id ? 'stroke-[#36C5D9] stroke-[2.5]' : 'stroke-[#334155] stroke-[1.2]';

  return (
    <div
      data-testid="webgl-fallback-view"
      className="flex h-full w-full flex-col justify-between bg-[#0B0F14] p-4 text-[#F1F5F9]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#F59E0B]/40 bg-[#141B23] px-3 py-2 text-xs">
        <span className="font-mono uppercase tracking-wider text-[#F59E0B]">
          2D Engineering Fallback Mode
        </span>
        <span className="text-[#94A3B8]">{reason}</span>
      </div>

      <div className="mt-3 grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
        <div className="panel-surface flex flex-col p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-[#94A3B8]">
            <span className="font-mono uppercase">Top Plan View (X-Z WorldFrame)</span>
            <span className="font-mono tabular-nums">
              TCP: ({tcp.x.toFixed(3)}, {tcp.z.toFixed(3)}) m
            </span>
          </div>
          <svg viewBox="0 0 400 300" className="h-full w-full rounded bg-[#0B0F14]">
            <rect
              x={toTopX(-1.6)}
              y={toTopY(-1.2)}
              width={3.2 * 110}
              height={2.4 * 110}
              fill="none"
              className={`${selectClass('safety-fence')} cursor-pointer`}
              strokeDasharray="6 4"
              onClick={() => onSelectComponent?.('safety-fence')}
            />
            <rect
              x={toTopX(-1.46)}
              y={toTopY(-0.04)}
              width={1.0 * 110}
              height={0.24 * 110}
              fill="#181C22"
              className={`${selectClass('input-conveyor')} cursor-pointer`}
              onClick={() => onSelectComponent?.('input-conveyor')}
            />
            <rect
              x={toTopX(0.46)}
              y={toTopY(-0.04)}
              width={1.0 * 110}
              height={0.24 * 110}
              fill="#181C22"
              className={`${selectClass('output-conveyor')} cursor-pointer`}
              onClick={() => onSelectComponent?.('output-conveyor')}
            />
            <rect
              x={toTopX(-0.2)}
              y={toTopY(-0.74)}
              width={0.4 * 110}
              height={0.36 * 110}
              fill="#1C2631"
              className={`${selectClass('processing-station')} cursor-pointer`}
              onClick={() => onSelectComponent?.('processing-station')}
            />
            <circle
              cx={toTopX(0)}
              cy={toTopY(0)}
              r={WORKCELL_CONFIG.staticObstacles[0].halfExtents.x * 110}
              fill="#1E242B"
              className={`${selectClass('robot-pedestal')} cursor-pointer`}
              onClick={() => onSelectComponent?.('robot-pedestal')}
            />
            {links.length > 0 && (
              <polyline
                fill="none"
                stroke={strokeArm}
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={topPoints}
                className="cursor-pointer"
                onClick={() => onSelectComponent?.('robot-arm')}
              />
            )}
            <circle
              cx={toTopX(tcp.x)}
              cy={toTopY(tcp.z)}
              r="5"
              fill="#36C5D9"
              className="cursor-pointer"
              onClick={() => onSelectComponent?.('gripper')}
            />
            {workpieces.map((wp) => (
              <rect
                key={wp.id}
                x={toTopX(wp.poseWorld.position.x) - 5}
                y={toTopY(wp.poseWorld.position.z) - 5}
                width="10"
                height="10"
                fill={wp.status === 'PROCESSED_READY' || wp.status === 'ON_OUTPUT_CONVEYOR' ? '#36C5D9' : '#CBD5E1'}
                className="cursor-pointer"
                onClick={() => onSelectComponent?.('workpiece')}
              />
            ))}
          </svg>
        </div>

        <div className="panel-surface flex flex-col p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-[#94A3B8]">
            <span className="font-mono uppercase">Front Elevation (X-Y WorldFrame)</span>
            <span className="font-mono tabular-nums">
              TCP Y: {tcp.y.toFixed(3)} m
            </span>
          </div>
          <svg viewBox="0 0 400 280" className="h-full w-full rounded bg-[#0B0F14]">
            <line x1="16" y1={toFrontY(0)} x2="384" y2={toFrontY(0)} stroke="#243242" strokeWidth="1" />
            <rect
              x={toFrontX(-0.22)}
              y={toFrontY(0.45)}
              width={0.44 * 110}
              height={0.45 * 110}
              fill="#1E242B"
              className={selectClass('robot-pedestal')}
            />
            <rect
              x={toFrontX(-1.46)}
              y={toFrontY(0.72)}
              width={1.0 * 110}
              height={0.1 * 110}
              fill="#181C22"
              className={selectClass('input-conveyor')}
            />
            <rect
              x={toFrontX(0.46)}
              y={toFrontY(0.72)}
              width={1.0 * 110}
              height={0.1 * 110}
              fill="#181C22"
              className={selectClass('output-conveyor')}
            />
            <rect
              x={toFrontX(-0.2)}
              y={toFrontY(0.72)}
              width={0.4 * 110}
              height={0.72 * 110}
              fill="#1C2631"
              className={selectClass('processing-station')}
            />
            {links.length > 0 && (
              <polyline
                fill="none"
                stroke={strokeArm}
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={frontPoints}
              />
            )}
            <circle cx={toFrontX(tcp.x)} cy={toFrontY(tcp.y)} r="5" fill="#36C5D9" />
            {workpieces.map((wp) => (
              <rect
                key={wp.id}
                x={toFrontX(wp.poseWorld.position.x) - 4}
                y={toFrontY(wp.poseWorld.position.y) - 4}
                width="8"
                height="8"
                fill="#CBD5E1"
              />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
