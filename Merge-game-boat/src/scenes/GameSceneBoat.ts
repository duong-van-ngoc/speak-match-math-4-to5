
import Phaser from 'phaser';
import { GAME_DATA } from '../data/gameData';
import { FLOW_GO_CIRCLE_MARK, FLOW_GO_END, type FlowEndPayload } from '../flow/events';

export class GameSceneBoat extends Phaser.Scene {
    constructor() { super('GameSceneBoat'); }

    create() {
        this.launchColor();
        (window as any).setGameButtonsVisible?.(true);

        // Only listen for Boat relevant events
        this.game.events.on(FLOW_GO_CIRCLE_MARK, this.launchCircleMark, this);
        this.game.events.on(FLOW_GO_END, this.launchEnd, this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(FLOW_GO_CIRCLE_MARK, this.launchCircleMark, this);
            this.game.events.off(FLOW_GO_END, this.launchEnd, this);
            (window as any).setGameButtonsVisible?.(false);
        });
    }

    private launchColor() {
        this.scene.launch('ColorSceneBoat', { gameData: GAME_DATA });
        this.scene.bringToTop('ColorSceneBoat');
    }

    private launchCircleMark() {
        this.scene.stop('ColorSceneBoat');
        this.scene.launch('CircleMarkScene', { gameData: GAME_DATA });
        this.scene.bringToTop('CircleMarkScene');
    }

    private launchEnd(payload: FlowEndPayload) {
        this.scene.stop('CircleMarkScene');
        this.scene.stop('ColorSceneBoat');

        this.scene.launch('EndGameScene', { payload });
        this.scene.bringToTop('EndGameScene');
    }
}
