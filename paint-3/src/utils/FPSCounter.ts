import Phaser from 'phaser';

export default class FPSCounter {
    private scene: Phaser.Scene;
    private fpsText!: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.create();
    }

    private create() {
        // Tạo text FPS ở góc trái trên, độ sâu (depth) cao nhất để luôn nổi lên trên
        this.fpsText = this.scene.add.text(10, 10, 'FPS: 0', {
            font: '16px Arial',
            color: '#00ff00',
            backgroundColor: '#000000'
        }).setScrollFactor(0).setDepth(9999);
    }

    public update() {
        // Lấy FPS thực tế và làm tròn số
        const fps = Math.floor(this.scene.game.loop.actualFps);
        
        // Đổi màu cảnh báo nếu FPS tụt thấp
        if (fps < 30) {
            this.fpsText.setColor('#ff0000'); // Đỏ: Nguy hiểm
        } else if (fps < 50) {
            this.fpsText.setColor('#ffff00'); // Vàng: Cảnh báo
        } else {
            this.fpsText.setColor('#00ff00'); // Xanh: Tốt
        }

        this.fpsText.setText('FPS: ' + fps);
    }

    public destroy() {
        if (this.fpsText) {
            this.fpsText.destroy();
        }
    }
}
