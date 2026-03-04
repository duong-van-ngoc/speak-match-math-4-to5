/**
 * LineMaskManager - Quản lý white boxes che các dòng chưa đọc
 * 
 * Logic:
 * - Tạo 6 boxes dựa trên LINES config (dùng cạnh dưới làm tâm)
 * - Ban đầu hiển thị các dòng đọc xong + dòng đang đọc
 * - Ẩn các dòng chưa đọc
 * - Khi replay (nhấn speaker): hiện tất cả content
 * - Sau khi replay audio xong: ẩn lại các dòng chưa đọc
 */
import Phaser from 'phaser';
import { GameConstants } from '../../consts/GameConstants';

export type LineState = 'completed' | 'current' | 'pending';

export class LineMaskManager {
    private scene: Phaser.Scene;
    private masks: Phaser.GameObjects.Rectangle[] = [];
    private lineStates: LineState[] = [];
    private currentLineIndex: number = 0;  // Dòng hiện tại bé đang đọc

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.createMasks();
        this.resetStates();
    }

    /**
     * Tạo 6 white boxes dựa trên LINES config
     * Sử dụng tâm giữa box (CENTER_Y) làm mốc tọa độ
     * 
     * Cách tính: box.y = line.y - OFFSET_Y_UP (tâm box nằm phía trên baseline)
     */
    private createMasks(): void {
        const CFG = GameConstants.SPEAK_SCENE;
        const MASK_CFG = CFG.LINE_MASKS;
        const LINES = CFG.READING_FINGER.LINES;

        const w = this.scene.scale.width;
        const h = this.scene.scale.height;

        console.log('[LineMaskManager] Creating masks with config:', MASK_CFG);

        for (let i = 0; i < LINES.length; i++) {
            const line = LINES[i];

            // Box width: từ startX đến endX + padding 2 bên
            const boxWidth = w * (line.endX - line.startX + MASK_CFG.PADDING_X * 2);
            const boxHeight = h * MASK_CFG.BOX_HEIGHT;

            // TÂM GIỮA box X: giữa khoảng startX đến endX  
            const centerX = w * ((line.startX + line.endX) / 2);

            // TÂM GIỮA box Y: line.y là baseline (chân chữ), box nằm phía trên
            // OFFSET_Y_UP là khoảng cách từ baseline lên tâm box
            const centerY = h * (line.y - MASK_CFG.OFFSET_Y_UP);

            console.log(`[LineMaskManager] Line ${i}: centerX=${centerX.toFixed(0)}, centerY=${centerY.toFixed(0)}, w=${boxWidth.toFixed(0)}, h=${boxHeight.toFixed(0)}`);

            const mask = this.scene.add.rectangle(
                centerX,
                centerY,
                boxWidth,
                boxHeight,
                MASK_CFG.BOX_COLOR,
                MASK_CFG.BOX_ALPHA
            )
                .setOrigin(0.5, 0.5)  // Origin tại TÂM GIỮA
                .setDepth(100)
                .setVisible(false);  // DEBUG: Hiện luôn để căn chỉnh

            this.masks.push(mask);
        }
    }

    /**
     * Reset states: dòng 0 = current, còn lại = pending
     */
    resetStates(): void {
        this.currentLineIndex = 0;
        this.lineStates = [];

        const total = GameConstants.SPEAK_SCENE.LINE_READING.TOTAL_LINES;
        for (let i = 0; i < total; i++) {
            this.lineStates.push(i === 0 ? 'current' : 'pending');
        }
    }

    /**
     * Hiển thị masks cho chế độ reading
     * - Dòng completed: không che
     * - Dòng current: không che
     * - Dòng pending: che (white box)
     */
    showMasksForReading(): void {
        for (let i = 0; i < this.masks.length; i++) {
            const shouldMask = this.lineStates[i] === 'pending';
            this.masks[i].setVisible(shouldMask);
        }
    }

    /**
     * Hiện dòng tiếp theo sau khi đọc xong dòng hiện tại
     * - Dòng hiện tại chuyển thành completed
     * - Dòng tiếp theo chuyển thành current
     */
    revealNextLine(): void {
        // Cập nhật state dòng hiện tại
        if (this.currentLineIndex < this.lineStates.length) {
            this.lineStates[this.currentLineIndex] = 'completed';
        }

        // Chuyển sang dòng tiếp
        this.currentLineIndex++;

        // Cập nhật state dòng tiếp
        if (this.currentLineIndex < this.lineStates.length) {
            this.lineStates[this.currentLineIndex] = 'current';
        }

        // Cập nhật visibility
        this.showMasksForReading();
    }

    /**
     * Hiện toàn bộ content (khi replay bằng speaker)
     */
    showAllContent(): void {
        for (const mask of this.masks) {
            mask.setVisible(false);
        }
    }

    /**
     * Ẩn các dòng chưa đọc (sau khi replay audio xong)
     */
    hideUnreadLines(): void {
        this.showMasksForReading();
    }

    /**
     * Getter: số dòng đã hoàn thành
     */
    get completedCount(): number {
        return this.lineStates.filter(s => s === 'completed').length;
    }

    /**
     * Getter: dòng hiện tại (đang đọc)
     */
    get currentLine(): number {
        return this.currentLineIndex;
    }

    /**
     * Getter: có còn dòng chưa đọc không
     */
    get hasMoreLines(): boolean {
        return this.currentLineIndex < this.lineStates.length;
    }

    /**
     * Getter: đã đọc xong tất cả chưa
     */
    get isAllCompleted(): boolean {
        return this.lineStates.every(s => s === 'completed');
    }

    /**
     * Cleanup
     */
    destroy(): void {
        for (const mask of this.masks) {
            mask.destroy();
        }
        this.masks = [];
        this.lineStates = [];
    }
}
