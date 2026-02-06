// src/utils/GameUtils.ts
import Phaser from 'phaser';

export class GameUtils {
    /**
     * Lấy chiều rộng màn hình game
     */
    static getW(scene: Phaser.Scene): number {
        return scene.scale.width;
    }

    /**
     * Lấy chiều cao màn hình game
     */
    static getH(scene: Phaser.Scene): number {
        return scene.scale.height;
    }

    /**
     * Lấy tọa độ X theo phần trăm (0.0 -> 1.0)
     * Ví dụ: pctX(this, 0.5) => Giữa màn hình theo chiều ngang
     */
    static pctX(scene: Phaser.Scene, percent: number): number {
        return scene.scale.width * percent;
    }

    /**
     * Lấy tọa độ Y theo phần trăm (0.0 -> 1.0)
     * Ví dụ: pctY(this, 0.1) => Cách mép trên 10%
     */
    static pctY(scene: Phaser.Scene, percent: number): number {
        return scene.scale.height * percent;
    }

    /**
     * Hàm tiện ích giúp canh giữa object nhanh (Optional)
     */
    static centerObj(scene: Phaser.Scene, object: Phaser.GameObjects.Image | Phaser.GameObjects.Text) {
        object.setPosition(scene.scale.width / 2, scene.scale.height / 2);
    }
}