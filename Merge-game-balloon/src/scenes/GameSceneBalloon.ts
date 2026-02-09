
import Phaser from 'phaser';
import { GAME_DATA } from '../data/gameData';
import { FLOW_GO_END, FLOW_GO_COUNT, type FlowEndPayload } from '../flow/events';

export class GameSceneBalloon extends Phaser.Scene {
    constructor() { super('GameSceneBalloon'); }

    create() {
        this.launchColor();
        (window as any).setGameButtonsVisible?.(true);

        // Only listen for Balloon relevant events
        this.game.events.on(FLOW_GO_COUNT, this.launchCount, this);
        this.game.events.on(FLOW_GO_END, this.launchEnd, this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(FLOW_GO_COUNT, this.launchCount, this);
            this.game.events.off(FLOW_GO_END, this.launchEnd, this);
            (window as any).setGameButtonsVisible?.(false);
        });
    }

    private launchColor() {
        this.scene.launch('ColorSceneBalloon', { gameData: GAME_DATA });
        this.scene.bringToTop('ColorSceneBalloon');
    }

    private launchCount(data?: { levels?: any[] }) {
        this.scene.stop('ColorSceneBalloon');
        const payload = { gameData: GAME_DATA, ...(data ?? {}) };
        this.scene.launch('CountConnectScene', payload);
        this.scene.bringToTop('CountConnectScene');
    }

    private launchEnd(payload: FlowEndPayload) {
        this.scene.stop('CountConnectScene');
        this.scene.stop('ColorSceneBalloon');

        this.scene.launch('EndGameScene', { payload });
        this.scene.bringToTop('EndGameScene');
    }
}
