// src/scenes/underline/UnderlineCharScene.ts
import { SceneKeys } from '../../consts/Keys';
import SceneBase from '../SceneBase';
import { GameUtils } from '../../utils/GameUtils';

/**
 * UnderlineCharScene - Màn gạch chân ký tự
 * TODO: Implement logic game đầy đủ
 */
export default class UnderlineCharScene extends SceneBase {
    constructor() {
        super(SceneKeys.UnderlineScene);
    }

    create() {
        this.setupSystem();
        this.setupBackgroundAndAudio('assets/images/bg/background_match_1.png');
        this.createUI();

        this.startWithAudio(() => {
            this.initGameFlow();
        });
    }

    protected createUI(): void {
        const w = GameUtils.getW(this);
        const h = GameUtils.getH(this);

        // Bảng trắng
        this.add.image(w * 0.5, h * 0.54, 'board')
            .setScale(0.7)
            .setDepth(1);

        // Banner
        this.add.image(w * 0.5, h * 0.01, 'underline_banner')
            .setScale(0.65)
            .setOrigin(0.5, 0)
            .setDepth(10);

        // Text tạm thời
        this.add.text(w * 0.5, h * 0.5, 'UnderlineScene - Sẵn sàng', {
            fontSize: '32px',
            color: '#333',
            fontFamily: 'Arial'
        }).setOrigin(0.5).setDepth(10);

        this.showButtons();
    }

    protected initGameFlow(): void {
        this.isGameActive = true;
        this.playBgm();
        this.idleManager.start();

        console.log('[UnderlineScene] Luồng game đã khởi tạo');
        // TODO: Implement logic gạch chân ký tự
    }

    protected showIdleHint(): void {
        console.log('[UnderlineScene] Gợi ý idle được kích hoạt');
    }

    update(_time: number, delta: number) {
        if (this.idleManager) {
            this.idleManager.update(delta);
        }
    }

    shutdown() {
        this.cleanupScene();
    }
}
