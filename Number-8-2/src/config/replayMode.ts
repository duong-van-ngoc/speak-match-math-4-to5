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
  return 'strict';
}

export function setReplayMode(mode: ReplayMode) {
  try {
    window.localStorage?.setItem('replayMode', mode);
  } catch {}
}

export function buildReplayStartData(opts: { mode: ReplayMode; gameScene?: GameScene | null }) {
  if (opts.mode === 'strict') {
    return {
      score: 0,
      startStage: 0,
      connectSixStart: 0,
    } as any;
  }

  // debug/test: random start stage and pack
  const startStage = Math.floor(Math.random() * 2);
  const connectSixStart = Math.floor(Math.random() * 2);
  return {
    score: 0,
    startStage,
    connectSixStart,
  } as any;
}
