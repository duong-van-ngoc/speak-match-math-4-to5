import { sdk, resetHubProgress } from './main';
import { phaser, game as irukaGame } from '@iruka-edu/mini-game-sdk';
import AudioManager from './AudioManager';

const { createEndGameScene } = phaser;

export default createEndGameScene({
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
        play: (k: string) => AudioManager.play(k),
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
        (window as any).setGameButtonsVisible?.(false);
        (window as any).__replayFromEndGame__ = true;
        irukaGame.finalizeAttempt();
    },
    onReplay: function (this: any, scene: any) {
        (window as any).__replayFromEndGame__ = true;
        AudioManager.stopAll();
        irukaGame.retryFromStart?.();
        resetHubProgress?.();
        // Force stop scenes to ensure a clean state
        scene.scene.stop('BalanceScene');
        scene.scene.stop('GameScene');
        scene.scene.start('GameScene', {
            levelIndex: 0,
            score: 0,
            regenLevels: true,
        });
        (window as any).ensureBgmStarted?.();
    },
    onRetry: function (this: any, scene: any) {
        (window as any).__replayFromEndGame__ = true;
        AudioManager.stopAll();
        irukaGame.retryFromStart?.();
        resetHubProgress?.();
        scene.scene.stop('GameScene');
        scene.scene.start('GameScene', {
            levelIndex: 0,
            score: 0,
            regenLevels: true,
        });
        (window as any).ensureBgmStarted?.();
    },
    reportComplete: (payload: any) => {
        const stats = irukaGame.prepareSubmitData() as any;
        const retries = stats.retries ?? stats.retryCount ?? 0;
        const attempts = Math.max(stats.attempts ?? 0, retries + 1);

        const computedPayload = {
            ...stats,
            ...payload,
            hintsUsedTotal: stats.hints ?? stats.hintCount ?? 0,
            retriesTotal: retries,
            retries: retries,
            attemptsTotal: attempts,
            attempts: attempts,
            coreScoreFinal: payload.score ?? stats.score ?? stats.finalScore ?? 0,
            mistakesTotal: stats.mistakes ?? stats.mistakeCount ?? 0,
            accuracyFinal: stats.accuracy ?? 0,
            timeMs: Date.now() - ((window as any).irukaGameState?.startTime ?? Date.now()),
        };

        console.log('[EndGame] Final Report Payload:', computedPayload);
        sdk.complete(computedPayload);
    },
} as any);
