
import Phaser from 'phaser';
import { GAME_DATA } from '../data/gameData';
import { FLOW_GO_COUNT } from '../flow/events';

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    // Bắt đầu từ scene tô màu
    this.launchColor();

    // Hiển thị nút chơi lại ở góc trên bên phải khi vào GameScene
    const win = window as unknown as { setGameButtonsVisible?: (visible: boolean) => void };
    win.setGameButtonsVisible?.(true);

    // Lắng nghe các sự kiện chuyển luồng
    this.game.events.on(FLOW_GO_COUNT, this.launchCount, this);

    // nếu scene bị shutdown/restart thì remove listener
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(FLOW_GO_COUNT, this.launchCount, this);
      // Ẩn nút khi rời khỏi GameScene
      win.setGameButtonsVisible?.(false);
    });
  }

    private launchColor() {
      this.scene.launch('ColorScene', { gameData: GAME_DATA });
      this.scene.bringToTop('ColorScene');
    }

    private launchCount(data: Record<string, unknown> = {}) {
      this.scene.stop('ColorScene');
      this.scene.launch('CountConnectScene', { gameData: GAME_DATA, ...data });
      this.scene.bringToTop('CountConnectScene');
    }
  }
