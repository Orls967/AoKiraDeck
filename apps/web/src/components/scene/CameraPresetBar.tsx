import { useEffect } from 'react';
import { Camera } from 'lucide-react';
import { useTwinUiStore, type CameraPreset } from '@/stores/useTwinUiStore';
import { CAMERA_PRESETS } from './sceneHelpers';

const PRESET_ORDER: { id: CameraPreset; shortcut: string }[] = [
  { id: 'ISOMETRIC', shortcut: '1' },
  { id: 'FRONT', shortcut: '2' },
  { id: 'SIDE', shortcut: '3' },
  { id: 'TOP', shortcut: '4' },
];

interface CameraPresetBarProps {
  compact?: boolean;
}

export function CameraPresetBar({ compact = false }: CameraPresetBarProps) {
  const cameraPreset = useTwinUiStore((s) => s.cameraPreset);
  const setCameraPreset = useTwinUiStore((s) => s.setCameraPreset);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      const match = PRESET_ORDER.find((p) => p.shortcut === e.key);
      if (match) {
        setCameraPreset(match.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setCameraPreset]);

  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-md border border-[#243242] bg-[#0B0F14]/90 p-1 backdrop-blur-sm"
      role="toolbar"
      aria-label="Camera Presets"
    >
      <Camera className="mx-1.5 h-3.5 w-3.5 text-[#94A3B8]" aria-hidden="true" />
      {PRESET_ORDER.map(({ id, shortcut }) => {
        const active = cameraPreset === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setCameraPreset(id)}
            aria-pressed={active}
            className={`rounded font-mono transition-colors ${
              compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'
            } ${
              active
                ? 'bg-[#36C5D9]/20 text-[#36C5D9] ring-1 ring-[#36C5D9]/40'
                : 'text-[#94A3B8] hover:bg-[#1C2631] hover:text-[#F1F5F9]'
            }`}
          >
            {!compact && <span className="mr-1 text-[#64748B]">{shortcut}</span>}
            {CAMERA_PRESETS[id].label}
          </button>
        );
      })}
    </div>
  );
}
