
import Phaser from 'phaser';
import { GAME_DATA } from '../data/gameData';
import { FLOW_GO_END, type FlowEndPayload } from '../flow/events';

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    // Start directly at the Front/Behind task (ColorScene)
    this.launchColor();

    // Hiển thị nút chơi lại ở góc trên bên phải khi vào GameScene
    (window as any).setGameButtonsVisible?.(true);

    this.game.events.on(FLOW_GO_END, this.launchEnd, this);

    // nếu scene bị shutdown/restart thì remove listener
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(FLOW_GO_END, this.launchEnd, this);
      // Ẩn nút khi rời khỏi GameScene
      (window as any).setGameButtonsVisible?.(false);
    });
  }

  private launchColor() {
    this.scene.launch('ColorScene', { gameData: GAME_DATA });
    this.scene.bringToTop('ColorScene');
  }

  private launchEnd(payload: FlowEndPayload) {
    this.scene.stop('ColorScene');

    // mở EndGameScene của bạn, truyền payload nếu muốn show kết quả
    this.scene.launch('EndGameScene', { payload });
    this.scene.bringToTop('EndGameScene');
  }
}
