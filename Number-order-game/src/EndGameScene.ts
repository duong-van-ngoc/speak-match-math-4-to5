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
    },
    onReplay: function (this: any, scene: any) {
        (window as any).__replayFromEndGame__ = true;
        AudioManager.stopAll();
        (irukaGame as any).retryFromStart?.();
        resetHubProgress?.();
        // Force stop scenes to ensure a clean state
        scene.scene.stop('GameScene');
        scene.scene.start('GameScene', {
            score: 0,
        });
        (window as any).ensureBgmStarted?.();
    },
    onRetry: function (this: any, scene: any) {
        (window as any).__replayFromEndGame__ = true;
        AudioManager.stopAll();
        (irukaGame as any).retryFromStart?.();
        resetHubProgress?.();
        scene.scene.stop('GameScene');
        scene.scene.start('GameScene', {
            score: 0,
        });
        (window as any).ensureBgmStarted?.();
    },
    reportComplete: (payload: any) => {
        const gameData = (irukaGame as any).prepareSubmitData?.() || {};
        const trackerData = (window as any)._getMatchedTrackerData?.() || {};
        const mergedData = { ...gameData, ...trackerData };

        const finalPayload = {
            ...payload,
            ...mergedData,
            extras: {
                ...(payload.extras || {}),
                stats: {
                    ...(payload.extras?.stats || {}),
                    ...mergedData,
                },
            },
        };
        sdk.complete(finalPayload);
    },
} as any);
