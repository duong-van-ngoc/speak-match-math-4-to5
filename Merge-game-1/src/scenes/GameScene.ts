
import Phaser from 'phaser';
import { GAME_DATA } from '../data/gameData';
import { FLOW_GO_COLOR, FLOW_GO_END, type FlowEndPayload } from '../flow/events';

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    // luôn đảm bảo GameScene đứng sau điều phối
    // Normal mode: Start with CountConnectScene
    this.launchCount();

    // Hiển thị nút chơi lại ở góc trên bên phải khi vào GameScene
    (window as any).setGameButtonsVisible?.(true);

    this.game.events.on(FLOW_GO_COLOR, this.launchColor, this);
    this.game.events.on(FLOW_GO_END, this.launchEnd, this);

    // nếu scene bị shutdown/restart thì remove listener
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(FLOW_GO_COLOR, this.launchColor, this);
      this.game.events.off(FLOW_GO_END, this.launchEnd, this);
      // Ẩn nút khi rời khỏi GameScene
      (window as any).setGameButtonsVisible?.(false);
    });
  }

  private launchCount() {
    this.scene.stop('ColorScene');
    this.scene.stop('EndGameScene'); // tên scene end của bạn
    this.scene.launch('CountConnectScene', { gameData: GAME_DATA });
    this.scene.bringToTop('CountConnectScene');
  }

  private launchColor() {
    this.scene.stop('CountConnectScene');
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
