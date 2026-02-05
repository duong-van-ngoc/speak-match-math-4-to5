// src/utils/IdleManager.ts

export class IdleManager {
    private timer: number = 0;
    private threshold: number;      // Thời gian chờ (ms)
    private callback: () => void;   // Hàm sẽ gọi khi hết giờ
    private isActive: boolean = false;

    /**
     * @param thresholdMs Thời gian chờ (ví dụ 10000ms = 10s)
     * @param onIdleCallback Hàm thực thi khi người dùng không làm gì
     */
    constructor(thresholdMs: number, onIdleCallback: () => void) {
        this.threshold = thresholdMs;
        this.callback = onIdleCallback;
    }

    /**
     * Bắt đầu đếm giờ (thường gọi sau khi Voice hướng dẫn đọc xong)
     */
    public start() {
        this.isActive = true;
        this.timer = 0;
    }

    /**
     * Dừng đếm giờ (khi game kết thúc hoặc đang xem gợi ý)
     */
    public stop() {
        this.isActive = false;
        this.timer = 0;
    }

    /**
     * Reset lại đồng hồ về 0 (gọi khi người chơi chạm màn hình)
     */
    public reset() {
        if (this.isActive) {
            this.timer = 0;
        }
    }

    /**
     * Đặt hàm này trong update() của Scene
     */
    public update(delta: number) {
        if (!this.isActive) return;

        this.timer += delta;
        if (this.timer > this.threshold) {
            this.callback(); // Kích hoạt gợi ý
            this.timer = 0;  // Reset để đếm lại chu kỳ tiếp theo
        }
    }
}
