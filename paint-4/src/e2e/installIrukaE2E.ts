/* eslint-disable @typescript-eslint/no-explicit-any */
import { game } from "@iruka-edu/mini-game-sdk";
import { __testSpy } from "@iruka-edu/mini-game-sdk";


declare global {
  interface Window {
    __irukaSpy?: any;
    __irukaTest?: any;
  }
}


export function isE2EEnabled(): boolean {
  const qs = new URLSearchParams(window.location.search);
  const v = (qs.get("e2e") || "").toLowerCase();
  return v === "1" || v === "true";
}




function clampInt(n: any, def = 1) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return def;
  return Math.floor(x);
}


/**
 * sdk: instance createGameSdk trong game của bạn
 * (file này không cần import runtime, vì bạn đã có sdk ở chỗ khác)
 */
export function installIrukaE2E(sdk: {
  score: (score: number, delta?: number) => void;
  complete: (payload: { score?: number; timeMs: number; extras?: any }) => void;
}) {
  if (!isE2EEnabled()) return;


  // enable spy + expose
  const spy = __testSpy;
  if (spy?.enable) {
    spy.enable();
    window.__irukaSpy = spy;
  }


  const t0 = performance.now();


  window.__irukaTest = {
    setTotal(n: number) { game.setTotal(n); },
    startQ(n = 1) { for (let i=0;i<n;i++) game.startQuestionTimer(); },
    finishQ(n = 1) { for (let i=0;i<n;i++) game.finishQuestionTimer(); },
    makeWrong(n = 1) {
      n = clampInt(n, 1);
      for (let i = 0; i < n; i++) game.recordWrong();
    },


    makeCorrect(n = 1) {
      n = clampInt(n, 1);
      for (let i = 0; i < n; i++) game.recordCorrect({ scoreDelta: 1 });


      const snap = game.getStatsSnapshot();
      sdk.score(snap.finalScore);
    },


    useHint(n = 1) {
      n = clampInt(n, 1);
      for (let i = 0; i < n; i++) game.addHint();
    },


    finish() {
      game.finalizeAttempt();
      const submit = game.prepareSubmitData();
      const timeMs = Math.round(performance.now() - t0);


      sdk.complete({
        score: submit.finalScore,
        timeMs,
        extras: submit,
      });
    },


    snapshot() {
      return {
        stats: game.getStatsSnapshot(),
        submit: game.prepareSubmitData(),
        spySummary: spy?.getSummary?.(),
      };
    },
  };
}
