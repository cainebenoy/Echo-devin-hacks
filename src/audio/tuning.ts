import { WALL_PROPS, type WallMaterial } from '../world/materials';

export interface Tuning {
  rays: number;            // N
  bins: number;            // B
  echoTimeScale: number;   // 1..6
  echoGain: number;
  clickGain: number;
  reverbAmount: number;
  maxDist: number;
  nearWallBoost: number;
  nearWallDist: number;
  clickCooldownMs: number;
  walkSpeed: number;
  waterSpeedMul: number;
  materialReflectivity: Record<WallMaterial, number>;
  materialCutoff: Record<WallMaterial, number>;
}

export function defaultTuning(): Tuning {
  return {
    rays: 180,
    bins: 24,
    echoTimeScale: 5,
    echoGain: 1.15,
    clickGain: 0.35,
    reverbAmount: 0.08,
    maxDist: 20,
    nearWallBoost: 1.4,
    nearWallDist: 1.5,
    clickCooldownMs: 350,
    walkSpeed: 1.1,
    waterSpeedMul: 0.6,
    materialReflectivity: {
      stone: WALL_PROPS.stone.reflectivity,
      wood: WALL_PROPS.wood.reflectivity,
      sacks: WALL_PROPS.sacks.reflectivity,
    },
    materialCutoff: {
      stone: WALL_PROPS.stone.cutoff,
      wood: WALL_PROPS.wood.cutoff,
      sacks: WALL_PROPS.sacks.cutoff,
    },
  };
}

const KEY = 'echo.tuning';

export function loadTuning(): Tuning {
  const t = defaultTuning();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return t;
    const saved = JSON.parse(raw) as Partial<Tuning>;
    return {
      ...t,
      ...saved,
      materialReflectivity: { ...t.materialReflectivity, ...(saved.materialReflectivity ?? {}) },
      materialCutoff: { ...t.materialCutoff, ...(saved.materialCutoff ?? {}) },
    };
  } catch {
    return t;
  }
}

export function saveTuning(t: Tuning): void {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* private mode */ }
}

export function resetTuning(): Tuning {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return defaultTuning();
}
