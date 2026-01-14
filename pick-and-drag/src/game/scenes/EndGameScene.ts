import { hideGameButtons, sdk } from '../../main';
import { phaser } from '@iruka-edu/mini-game-sdk';
import AudioManager from '../../audio/AudioManager';
import { game } from "@iruka-edu/mini-game-sdk";

const { createEndGameScene } = phaser;
game.prepareSubmitData();

function exitGame(payload: { score?: number; timeMs?: number; extras?: any } = {}) {
    game.finalizeAttempt("quit");
    const stats = game.prepareSubmitData();
    const timeMs =
        payload.timeMs ?? Date.now() - ((window as any).irukaGameState?.startTime ?? Date.now());

    sdk.complete({
        score: payload.score ?? stats.finalScore ?? 0,
        timeMs,
        extras: {
            ...(payload.extras ?? {}),
            reason: "user_exit",
            stats,
        },
    });
}

export const EndGameScene = createEndGameScene({
    sceneKey: 'EndGameScene',
    assets: {
        banner: {
            key: 'banner_congrat',
            url: 'assets/images/ui/banner_congrat.png',
        },
        icon: { key: 'icon', url: 'assets/images/ui/icon.png' },
        replayBtn: { key: 'btn_reset', url: 'assets/images/ui/btn_reset.png' },
        exitBtn: { key: 'btn_exit', url: 'assets/images/ui/btn_exit.png' },
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
    replaySceneKey: 'LessonScene',
    onEnter: () => hideGameButtons(),
    reportComplete: (payload) => {
        exitGame(payload);
    },
    onLeave: () => {
        exitGame({
            timeMs: Date.now() - ((window as any).irukaGameState?.startTime ?? Date.now()),
        });
    },
});
