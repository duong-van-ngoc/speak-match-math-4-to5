import { sdk } from './main';
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
        play: (k) => AudioManager.play(k),
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

        // Finalize state as pass (completed)
        (irukaGame as any).finalizeAttempt?.("pass");

        // Report Complete Immediately on Enter
        if (!(window as any)._endGameReportSent) {
            (window as any)._endGameReportSent = true;

            const stats = (irukaGame as any).prepareSubmitData?.() || {};
            sdk.complete({
                timeMs: Date.now() - ((window as any).irukaGameState?.startTime ?? Date.now()),
                extras: {
                    reason: "completed",
                    stats
                }
            });
        }
    },
    reportComplete: (payload: any) => {

        sdk.complete(payload);
    },
});


