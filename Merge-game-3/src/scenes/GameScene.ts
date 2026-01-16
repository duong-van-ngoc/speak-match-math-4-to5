
import Phaser from 'phaser';
import { GAME_DATA } from '../data/gameData';
import { FLOW_GO_END, FLOW_GO_CIRCLE_MARK, FLOW_GO_COUNT, type FlowEndPayload } from '../flow/events';

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    // Bắt đầu từ scene tô màu
    this.launchColor();

    // Hiển thị nút chơi lại ở góc trên bên phải khi vào GameScene
    (window as any).setGameButtonsVisible?.(true);

    // Lắng nghe các sự kiện chuyển luồng
    this.game.events.on(FLOW_GO_CIRCLE_MARK, this.launchCircleMark, this);
    this.game.events.on(FLOW_GO_COUNT, this.launchCount, this);
    this.game.events.on(FLOW_GO_END, this.launchEnd, this);

    // nếu scene bị shutdown/restart thì remove listener
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(FLOW_GO_CIRCLE_MARK, this.launchCircleMark, this);
      this.game.events.off(FLOW_GO_COUNT, this.launchCount, this);
      this.game.events.off(FLOW_GO_END, this.launchEnd, this);
      // Ẩn nút khi rời khỏi GameScene
      (window as any).setGameButtonsVisible?.(false);
    });
  }

  private launchColor() {
    this.scene.launch('ColorScene', { gameData: GAME_DATA });
    this.scene.bringToTop('ColorScene');
  }

  private launchCircleMark() {
    this.scene.stop('ColorScene');
    this.scene.launch('CircleMarkScene', { gameData: GAME_DATA });
    this.scene.bringToTop('CircleMarkScene');
  }

  private launchCount(data?: { levels?: any[] }) {
    this.scene.stop('CircleMarkScene');
    this.scene.stop('ColorScene');
    const payload = { gameData: GAME_DATA, ...(data ?? {}) };
    this.scene.launch('CountConnectScene', payload);
    this.scene.bringToTop('CountConnectScene');
  }

    private launchEnd(payload: FlowEndPayload) {
      this.scene.stop('CountConnectScene');
      this.scene.stop('CircleMarkScene');
      this.scene.stop('ColorScene');

      // mở EndGameScene của bạn, truyền payload nếu muốn show kết quả
      this.scene.launch('EndGameScene', { payload });
      this.scene.bringToTop('EndGameScene');
    }
  }
