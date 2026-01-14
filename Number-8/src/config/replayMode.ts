import type GameScene from '../scene/GameScene';

export type ReplayMode = 'strict' | 'debug';

function getQueryParam(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

export function getReplayMode(): ReplayMode {
  const explicit =
    (getQueryParam('replay') || getQueryParam('replayMode') || '').trim().toLowerCase();

  if (explicit === 'strict') return 'strict';
  if (explicit === 'debug' || explicit === 'test') return 'debug';

  try {
    const stored = String(window.localStorage?.getItem('replayMode') ?? '').trim().toLowerCase();
    if (stored === 'strict') return 'strict';
    if (stored === 'debug' || stored === 'test') return 'debug';
  } catch {}

  // Default: strict (debug/test must be explicitly enabled via query/localStorage)
  return 'debug';
}

export function setReplayMode(mode: ReplayMode) {
  try {
    window.localStorage?.setItem('replayMode', mode);
  } catch {}
}

export function buildReplayStartData(opts: { mode: ReplayMode; gameScene?: GameScene | null }) {
  const gs = opts.gameScene ?? null;

  const getTotalLevels = (): number => {
    const n =
      (gs as any)?.totalLevels ??
      (gs as any)?.TOTAL_LEVELS ??
      (typeof (gs as any)?.getLevelCount === 'function' ? (gs as any).getLevelCount() : undefined);
    return Number.isFinite(n) && n > 0 ? n : 5;
  };

  const totalLevels = getTotalLevels();
  const currentIndex = Number((gs as any)?.levelIndex ?? 0) || 0;
  let levelIndex = Math.floor(Math.random() * totalLevels);
  if (totalLevels > 1 && levelIndex === currentIndex) {
    levelIndex = (levelIndex + 1 + Math.floor(Math.random() * (totalLevels - 1))) % totalLevels;
  }

  if (opts.mode === 'strict') {
    return {
      score: 0,
      // Strict: always restart from the first level of stage 1.
      levelIndex: 0,
    } as any;
  }

  // debug/test: random start level
  return {
    score: 0,
    levelIndex,
  } as any;
}
