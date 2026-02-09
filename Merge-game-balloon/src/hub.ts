import { game as irukaGame } from "@iruka-edu/mini-game-sdk";
import { GAME_DATA } from "./data/gameData";

const COLOR_LEVELS_COUNT = 2;
const HUB_TOTAL_QUESTIONS =
  GAME_DATA.ballsBags[0] +
  GAME_DATA.ballsBags[1] +
  GAME_DATA.marblesBags[0] +
  GAME_DATA.marblesBags[1] +
  COLOR_LEVELS_COUNT;

const hubProgress = {
  total: HUB_TOTAL_QUESTIONS,
  completed: 0,
  score: 0,
};

let sdkInstance: {
  score: (score: number, delta?: number) => void;
  progress: (payload: { levelIndex: number; total: number; score: number }) => void;
  requestSave: (payload: { score: number; levelIndex: number }) => void;
} | null = null;

export function setSdk(sdk: typeof sdkInstance) {
  sdkInstance = sdk;
}

function setHubWindowState(score: number) {
  const state = (window as any).irukaGameState || {
    startTime: Date.now(),
    currentScore: 0,
  };
  state.currentScore = score;
  state.currentLevelIndex = hubProgress.completed;
  state.attemptFinalized = false;
  (window as any).irukaGameState = state;
}

function pushHubProgress(scoreDelta = 1) {
  hubProgress.score += scoreDelta;
  hubProgress.completed = Math.min(hubProgress.completed + 1, hubProgress.total);
  setHubWindowState(hubProgress.score);
  if (!sdkInstance) return;
  sdkInstance.score(hubProgress.score, scoreDelta);
  sdkInstance.progress({
    levelIndex: hubProgress.completed,
    total: hubProgress.total,
    score: hubProgress.score,
  });
  sdkInstance.requestSave({
    score: hubProgress.score,
    levelIndex: hubProgress.completed,
  });
}

function resetHubProgressState() {
  hubProgress.completed = 0;
  hubProgress.score = 0;
  const now = Date.now();
  (window as any).irukaGameState = {
    startTime: now,
    currentScore: 0,
    currentLevelIndex: 0,
    attemptFinalized: false,
  };
  if (!sdkInstance) return;
  sdkInstance.score(0, 0);
  sdkInstance.progress({
    levelIndex: 0,
    total: hubProgress.total,
    score: 0,
  });
}

export function initHubState() {
  hubProgress.total = HUB_TOTAL_QUESTIONS;
  irukaGame.setTotal?.(hubProgress.total);
  resetHubProgressState();
}

export function startHubQuestion() {
  irukaGame.startQuestionTimer?.();
}

export function finishHubQuestion(success = true, scoreDelta = 1) {
  irukaGame.finishQuestionTimer?.();
  if (!success) return;
  irukaGame.recordCorrect?.({ scoreDelta });
  pushHubProgress(scoreDelta);
}

export function recordHubWrong() {
  irukaGame.finishQuestionTimer?.();
  irukaGame.recordWrong?.();
}

export function resetHubAttempt() {
  resetHubProgressState();
}

export function finalizeHubAttempt() {
  const state = (window as any).irukaGameState;
  if (state?.attemptFinalized) return;
  irukaGame.finalizeAttempt();
  if (state) {
    state.attemptFinalized = true;
  } else {
    (window as any).irukaGameState = {
      startTime: Date.now(),
      currentScore: hubProgress.score,
      currentLevelIndex: hubProgress.completed,
      attemptFinalized: true,
    };
  }
}
