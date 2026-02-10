import * as MiniGameSDK from "@iruka-edu/mini-game-sdk";
const { phaser, game: sdkGameCore } = MiniGameSDK as any;
import { sdk, resetHubProgress } from "../main";
import AudioManager from "../AudioManager";

const { createEndGameScene } = (phaser as any);

function hideGameButtons() {
    (window as any).setGameButtonsVisible?.(false);
}

const EndGameScene = createEndGameScene({
    sceneKey: 'EndGameScene',
    assets: {
        banner: {
            key: 'banner_congrat',
            url: 'assets/bg_end/banner_congrat.png',
        },
        icon: { key: 'icon_end', url: 'assets/bg_end/icon.png' },
        replayBtn: { key: 'btn_reset', url: 'assets/bg_end/btn_reset.png' },
        exitBtn: { key: 'btn_exit', url: 'assets/bg_end/btn_exit.png' },
    },
    audio: {
        play: (k: string) => AudioManager.playWhenReady(k),
        stopAll: () => AudioManager.stopAll(),
    },
    sounds: {
        enter: 'complete',
        fireworks: 'fireworks',
        applause: 'applause',
        click: 'sfx_click',
    },
    replaySceneKey: 'GameScene',
    onEnter: () => {
        console.log('[EndGameScene] onEnter triggered');
        hideGameButtons();
        (window as any).__replayFromEndGame__ = true;

        if (!(window as any)._inEndGame) {
            console.log('[EndGameScene] Finalizing attempt');
            (window as any)._inEndGame = true;
            sdkGameCore.finalizeAttempt?.();
        } else {
            console.log('[EndGameScene] Already in EndGame (according to flag)');
        }
    },
    onReplay: function (this: any, scene: any) {
        console.log('[EndGameScene] onReplay triggered');
        (window as any).__replayFromEndGame__ = true;
        (window as any)._reportSent = false;
        (window as any)._inEndGame = false;
        AudioManager.stopAll();
        sdkGameCore.retryFromStart?.();
        resetHubProgress?.();

        // Reset capability/state to allow Hub to show exit popup again if it was 'complete'
        console.log('[EndGameScene] Calling sdk.ready() to reset Hub state');
        sdk.ready({
            capabilities: ["resize", "score", "complete", "save_load", "set_state", "stats", "hint", "quit"],
        });

        scene.scene.stop('EndGameScene');
        scene.scene.stop('GameScene');
        // scene.start('GameScene');
        // ensureBgmStarted will be called by ColorScene after delay to avoid race condition with stopAll
        // (window as any).ensureBgmStarted = undefined; // DO NOT DO THIS - it removes the function globally!
        scene.scene.start('GameScene');
    },
    onRetry: function (this: any, scene: any) {
        console.log('[EndGameScene] onRetry triggered');
        (window as any).__replayFromEndGame__ = true;
        (window as any)._reportSent = false;
        (window as any)._inEndGame = false;
        AudioManager.stopAll();
        sdkGameCore.retryFromStart?.();
        resetHubProgress?.();

        console.log('[EndGameScene] Calling sdk.ready() to reset Hub state');
        sdk.ready({
            capabilities: ["resize", "score", "complete", "save_load", "set_state", "stats", "hint", "quit"],
        });

        scene.scene.stop('EndGameScene');
        scene.scene.stop('GameScene');
        // scene.start('GameScene');
        // ensureBgmStarted will be called by ColorScene
        scene.scene.start('GameScene');
    },
    onExit: function (this: any) {
        console.log('[EndGameScene] onExit (X button) triggered');
        (window as any)._inEndGame = false;
        (window as any)._reportSent = false;
        // sdk.quit() should trigger Hub exit popup
        sdk.quit();
    },
    reportComplete: (payload: any) => {
        if ((window as any)._reportSent) return;
        (window as any)._reportSent = true;

        const stats = sdkGameCore.prepareSubmitData() as any;
        const retries = stats.retries ?? stats.retryCount ?? 0;
        // attemptsTotal: ensure at least 1, using stats.attempts if available
        const attempts = Math.max(1, stats.attempts ?? 0, retries + 1);

        const currentScore = payload.score ?? stats.score ?? stats.finalScore ?? 0;
        const completedLevels = payload.completedLevels ?? 0;

        // Persist and get Best Score (based on completed levels)
        const STORAGE_KEY = 'math_game_color_best_levels';
        let bestLevels = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
        if (completedLevels > bestLevels) {
            bestLevels = completedLevels;
            localStorage.setItem(STORAGE_KEY, bestLevels.toString());
        }

        const computedPayload = {
            ...stats,
            ...payload,
            hintsUsedTotal: stats.hints ?? stats.hintCount ?? 0,
            retriesTotal: retries,
            retries: retries,
            attemptsTotal: attempts,
            attempts: attempts,
            coreScoreFinal: currentScore,
            bestScore: bestLevels,
            mistakesTotal: stats.mistakes ?? stats.mistakeCount ?? 0,
            accuracyFinal: stats.accuracy ?? 0,
            timeMs: Date.now() - ((window as any).irukaGameState?.startTime ?? Date.now()),
        };

        console.log('[EndGame] Final Report Payload:', computedPayload);
        sdk.complete(computedPayload);
    },
} as any);

export default EndGameScene;
