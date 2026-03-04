/**
 * DebugGrid - Utility để vẽ lưới debug giúp căn chỉnh UI
 * Comment khi lên production
 */
import Phaser from 'phaser';
import { GameConstants } from '../consts/GameConstants';

export interface DebugGridConfig {
    showGrid?: boolean;          // Hiển thị lưới %
    showReadingLines?: boolean;  // Hiển thị 6 đường reading finger
    gridStep?: number;           // Khoảng cách giữa các đường (default: 5%)
}

export class DebugGrid {
    private scene: Phaser.Scene;
    private graphics: Phaser.GameObjects.Graphics;
    private labels: Phaser.GameObjects.Text[] = [];
    private enabled: boolean = true;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.graphics = scene.add.graphics().setDepth(999);
    }

    /**
     * Vẽ tất cả debug elements
     */
    draw(config: DebugGridConfig = {}): void {
        if (!this.enabled) return;

        const { showGrid = true, showReadingLines = true, gridStep = 5 } = config;

        if (showGrid) {
            this.drawFullGrid(gridStep);
        }
        if (showReadingLines) {
            this.drawReadingLines();
        }
    }

    /**
     * Vẽ lưới % toàn màn hình
     */
    private drawFullGrid(step: number = 5): void {
        const w = this.scene.scale.width;
        const h = this.scene.scale.height;

        const majorColor = 0xFF0000;   // 0%, 50%, 100%
        const quarterColor = 0x0000FF; // 25%, 75%
        const minorColor = 0x00FF00;   // Others

        // Đường ngang
        for (let i = 0; i <= 100; i += step) {
            const y = h * (i / 100);
            const isMajor = i % 50 === 0;
            const isQuarter = i % 25 === 0;

            if (isMajor) {
                this.graphics.lineStyle(2, majorColor, 0.8);
            } else if (isQuarter) {
                this.graphics.lineStyle(1.5, quarterColor, 0.6);
            } else {
                this.graphics.lineStyle(1, minorColor, 0.3);
            }

            this.graphics.beginPath();
            this.graphics.moveTo(0, y);
            this.graphics.lineTo(w, y);
            this.graphics.strokePath();

            if (i % 10 === 0) {
                const label = this.scene.add.text(10, y + 2, `${i}%`, {
                    fontSize: '14px',
                    color: isMajor ? '#FF0000' : (isQuarter ? '#0000FF' : '#00FF00'),
                    backgroundColor: '#000000AA'
                }).setDepth(1000);
                this.labels.push(label);
            }
        }

        // Đường dọc
        for (let i = 0; i <= 100; i += step) {
            const x = w * (i / 100);
            const isMajor = i % 50 === 0;
            const isQuarter = i % 25 === 0;

            if (isMajor) {
                this.graphics.lineStyle(2, majorColor, 0.8);
            } else if (isQuarter) {
                this.graphics.lineStyle(1.5, quarterColor, 0.6);
            } else {
                this.graphics.lineStyle(1, minorColor, 0.3);
            }

            this.graphics.beginPath();
            this.graphics.moveTo(x, 0);
            this.graphics.lineTo(x, h);
            this.graphics.strokePath();

            if (i % 10 === 0 && i !== 0) {
                const label = this.scene.add.text(x + 2, 10, `${i}%`, {
                    fontSize: '14px',
                    color: isMajor ? '#FF0000' : (isQuarter ? '#0000FF' : '#00FF00'),
                    backgroundColor: '#000000AA'
                }).setDepth(1000);
                this.labels.push(label);
            }
        }

        // Center cross
        this.graphics.lineStyle(3, 0xFFFF00, 1);
        this.graphics.beginPath();
        this.graphics.moveTo(w / 2 - 30, h / 2);
        this.graphics.lineTo(w / 2 + 30, h / 2);
        this.graphics.moveTo(w / 2, h / 2 - 30);
        this.graphics.lineTo(w / 2, h / 2 + 30);
        this.graphics.strokePath();

        // Screen size label
        const sizeLabel = this.scene.add.text(w - 150, h - 30, `${Math.round(w)} x ${Math.round(h)}`, {
            fontSize: '16px',
            color: '#FFFFFF',
            backgroundColor: '#000000CC'
        }).setDepth(1000);
        this.labels.push(sizeLabel);
    }


    /**
     * Bật/tắt debug grid
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.graphics.setVisible(enabled);
        this.labels.forEach(label => label.setVisible(enabled));
    }

    /**
     * Xóa tất cả debug elements
     */
    destroy(): void {
        this.graphics.destroy();
        this.labels.forEach(label => label.destroy());
        this.labels = [];
    }

    /**
     * Vẽ 6 đường reading finger lines
     */
    private drawReadingLines(): void {
        const w = this.scene.scale.width;
        const h = this.scene.scale.height;
        const CFG = GameConstants.SPEAK_SCENE.READING_FINGER;

        CFG.LINES.forEach((line, index) => {
            const startX = w * line.startX;
            const endX = w * line.endX;
            const lineY = h * line.y;

            // Đường line (cam đậm)
            this.graphics.lineStyle(4, 0xFF6600, 1);
            this.graphics.beginPath();
            this.graphics.moveTo(startX, lineY);
            this.graphics.lineTo(endX, lineY);
            this.graphics.strokePath();

            // Điểm bắt đầu (xanh)
            this.graphics.fillStyle(0x00FF00, 1);
            this.graphics.fillCircle(startX, lineY, 8);

            // Điểm kết thúc (đỏ)
            this.graphics.fillStyle(0xFF0000, 1);
            this.graphics.fillCircle(endX, lineY, 8);

            // Label số thứ tự
            const numLabel = this.scene.add.text(startX - 50, lineY - 25, `L${index + 1}`, {
                fontSize: '18px',
                fontStyle: 'bold',
                color: '#FF6600',
                backgroundColor: '#000000CC'
            }).setDepth(1000);
            this.labels.push(numLabel);

            // Label tọa độ Y%
            const yLabel = this.scene.add.text(endX + 15, lineY - 8, `y:${(line.y * 100).toFixed(0)}%`, {
                fontSize: '12px',
                color: '#FFCC00',
                backgroundColor: '#000000AA'
            }).setDepth(1000);
            this.labels.push(yLabel);
        });
    }

}
