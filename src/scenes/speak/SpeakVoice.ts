import Phaser from 'phaser';
import { GameConstants } from '../../consts/GameConstants';
import {
    VoiceHandler,
    type RecordingCompleteResult,
    type RecordingState,
} from '../../voice/VoiceHandler';

/**
 * Interface định nghĩa các callback khi kết thúc ghi âm hoặc xảy ra lỗi
 */
export interface SpeakVoiceCallbacks {
    onRecordingComplete: (result: RecordingCompleteResult) => void;
    onRecordingError: (error: string) => void;
}

/**
 * Lớp SpeakVoice chịu trách nhiệm quản lý UI (đồ họa) cho hành động ghi âm và giao tiếp với VoiceHandler.
 * Lớp này điều khiển các hiệu ứng liên quan đến nút microphone như đổi màu, nhấp nháy, thay đổi kích thước.
 */
export class SpeakVoice {
    private scene: Phaser.Scene;
    private voiceHandler!: VoiceHandler; // Đối tượng xử lý logic ghi âm từ microphone (MediaRecorder)
    private microBtn: Phaser.GameObjects.Image; // Nút microphone trên màn hình (đ ể đổi màu/scale)
    private recordingIndicator: Phaser.GameObjects.Graphics | null = null; // Vòng tròn nền báo hiệu đang thu âm phía sau mic
    private volumeBar: Phaser.GameObjects.Graphics; // Thanh hiển thị/vòng tròn phản hồi dựa trên âm lượng
    private callbacks: SpeakVoiceCallbacks; // Các hàm callback gọi ngược về scene chính khi có kết quả
    private isCurrentlyRecording = false; // Cờ kiểm soát xem có đang trong quá trình ghi âm không

    constructor(
        scene: Phaser.Scene,
        microBtn: Phaser.GameObjects.Image,
        volumeBar: Phaser.GameObjects.Graphics,
        callbacks: SpeakVoiceCallbacks
    ) {
        this.scene = scene;
        this.microBtn = microBtn;
        this.volumeBar = volumeBar;
        this.callbacks = callbacks;

        // Bắt đầu khởi tạo bộ thu âm
        this.setupVoiceHandler();
    }

    /**
     * Bắt đầu quá trình ghi âm thông qua VoiceHandler.
     */
    async startRecording(): Promise<void> {
        if (this.isCurrentlyRecording) return; // Nếu đang chạy thì từ chối gọi thêm

        this.isCurrentlyRecording = true;
        await this.voiceHandler.start(); // Yêu cầu VoiceHandler xin quyền mic và bắt đầu thu
    }

    /**
     * Dừng ghi âm chủ động (nếu người chơi bấm dừng hoặc hết giờ).
     */
    stopRecording(): void {
        this.voiceHandler.stop();
    }

    /**
     * Trả về check status để biết có đang thu hay không
     */
    get isRecording(): boolean {
        return this.isCurrentlyRecording;
    }

    /**
     * Đưa UI về trạng thái mặc định ban đầu: dừng rung, xóa độ trong suốt(tint), ẩn đồ họa thu âm.
     */
    resetToIdle(): void {
        this.isCurrentlyRecording = false;
        const cfg = GameConstants.SPEAK_SCENE;
        this.scene.tweens.killTweensOf(this.microBtn); // Hủy các hiệu ứng animation của mic
        this.microBtn.clearTint(); // Bỏ lớp màu phủ lên trên nút mic
        this.microBtn.setScale(cfg.MICRO.SCALE); // Set lại kích thước gốc
        this.hideRecordingIndicator(); // Ẩn hiệu ứng phía sau
    }

    /**
     * Hủy hoàn toàn lớp này, giải phóng bộ nhớ khi scene kết thúc.
     */
    destroy(): void {
        this.voiceHandler?.destroy();
        this.recordingIndicator?.destroy();
        this.volumeBar?.destroy();
    }

    /**
     * Setup các event callbacks vào VoiceHandler để nhận phản hồi về trạng thái, âm lượng,...
     */
    private setupVoiceHandler(): void {
        this.voiceHandler = new VoiceHandler({
            // Sự kiện khi VoiceHandler thay đổi trạng thái (bắt đầu, đang lấy mẫu ồn, đang thu thực sự, xử lý)
            onStateChange: (state) => this.onRecordingStateChange(state),
            // Sự kiện khi cường độ âm thanh từ thu âm thay đổi liên tục
            onVolumeChange: (volume, isAbove) => this.updateVolumeIndicator(volume, isAbove),
            // Sự kiện dội lại khi đã lấy được kết quả ghi âm gửi API
            onComplete: (result) => this.onRecordingComplete(result),
            // Sự kiện dội lại khi bị lỗi (không có quyền mic, lỗi MediaRecorder...)
            onError: (error) => this.onRecordingError(error),
        });
    }

    /**
     * Hàm xử lý cập nhật giao diện khi VoiceHandler phản hồi về state hiện tại
     */
    private onRecordingStateChange(state: RecordingState): void {
        const cfg = GameConstants.SPEAK_SCENE;

        switch (state) {
            case 'calibrating':
                // Trạng thái: đang đo lường tiếng ồn môi trường
                this.microBtn.setTint(0xffff00); // Overlay màu VÀNG lên nút Mic
                this.showRecordingIndicator(0xffff00); // Vẽ vòng tròn báo hiệu màu VÀNG
                break;

            case 'recording':
                // Trạng thái: Đang tiến hành ghi âm thực sự
                this.microBtn.setTint(0xff0000); // Overlay màu ĐỎ lên nút Mic
                this.showRecordingIndicator(0xfffde7); // Vẽ vòng tròn báo hiệu màu Trắng nhạt
                this.startMicPulse(); // Bắt đầu chạy tween phình ra thụt vào (Pulse) cho nút Mic
                break;

            case 'processing':
            case 'idle':
            case 'starting':
                // Các trạng thái khởi tạo hoặc hoàn thành: reset UI về ban đầu
                this.isCurrentlyRecording = false;
                this.scene.tweens.killTweensOf(this.microBtn);
                this.microBtn.clearTint();
                this.microBtn.setScale(cfg.MICRO.SCALE);
                this.hideRecordingIndicator();
                break;
        }
    }

    /**
     * Xử lý cập nhật phản hồi UI (Vòng tròn biến đổi) dựa trên cường độ giọng nói của bé.
     * @param volume Độ ồn (âm lượng) do Mic bắt được
     * @param isAboveThreshold Check xem âm lượng đó có phát ra thành tiếng lớn (vượt ngưỡng tạp âm) không
     */
    private updateVolumeIndicator(volume: number, isAboveThreshold: boolean): void {
        if (!this.volumeBar) return;

        if (this.recordingIndicator) {
            this.recordingIndicator.clear();
            // Đổi màu vòng thành XANH LÁ nếu có tiếng trẻ con rõ, nếu chỉ có tiếng ồn hoặc im lặng giữ nguyên trắng nhạt
            const indicatorColor = isAboveThreshold ? 0x00ff00 : 0xfffde7;

            this.recordingIndicator.fillStyle(
                indicatorColor,
                isAboveThreshold ? 0.4 : 0.85 // Làm mờ nhẹ nếu có tiếng phát ra
            );
            this.recordingIndicator.setPosition(this.microBtn.x, this.microBtn.y);

            // Bán kính động: Nhỏ nhất là 50, lớn nhất là 80, tùy thuộc vào cường độ âm lượng (volume)
            this.recordingIndicator.fillCircle(0, 0, Math.max(70, Math.min(100, 45 + volume / 2)));
        }
    }

    /**
     * Vẽ ra đồ họa vòng tròn báo hiệu đang thu âm.
     */
    private showRecordingIndicator(color: number): void {
        if (!this.recordingIndicator) {
            this.recordingIndicator = this.scene.add.graphics();
            this.recordingIndicator.setDepth(this.microBtn.depth - 1); // Đặt vẽ nó ngay sau microBtn
        }

        this.recordingIndicator.clear();
        this.recordingIndicator.fillStyle(color, 0.85); // Đổ màu và set alpha
        this.recordingIndicator.setPosition(this.microBtn.x, this.microBtn.y);
        this.recordingIndicator.fillCircle(0, 0, 70); // Bán kính chuẩn 70
    }

    /**
     * Tẩy xóa dọn dẹp biến mất vòng tròn âm lượng
     */
    private hideRecordingIndicator(): void {
        this.recordingIndicator?.clear();
        this.volumeBar?.clear();
    }

    /**
     * Tween animation: Khiến microBtn lớn lên, thu nhỏ lại nhịp nhàng (yoyo) tạo cảm giác đang thu âm
     */
    private startMicPulse(): void {
        const cfg = GameConstants.SPEAK_SCENE;
        this.scene.tweens.add({
            targets: this.microBtn,
            scale: { from: cfg.MICRO.SCALE, to: cfg.MICRO.SCALE + 0.08 }, // Phình to thêm 0.08 so với gốc
            duration: 500, // Nhịp phình to xong thụt vào tốn 500ms
            yoyo: true, // Xong to thì thụt ngược lại
            repeat: -1, // Lặp lại Mãi mãi
            onStop: () => this.microBtn.setScale(cfg.MICRO.SCALE), // Callback tự vệ khi dừng tween thì gán lại gốc
        });
    }

    /**
     * Nhận event thu âm đã xong từ vòng đời VoiceHandler, đá tiếp result về Event Callback ngoài Scene.
     */
    private onRecordingComplete(result: RecordingCompleteResult): void {
        console.log(
            `[SpeakVoice] Ghi âm xong, kích thước: ${(result.audioBlob.size / 1024).toFixed(1)}KB, thời lượng: ${result.durationMs}ms`
        );
        this.callbacks.onRecordingComplete(result); // Gửi về cho logic của Game/SpeakScene xử lý gọi API chấm điểm
    }

    /**
     * Nhận event bị Lỗi (như user deny quyền truy cập Mic), dọn dẹp UI sau 2 giây và quăng về Scene.
     */
    private onRecordingError(error: string): void {
        console.error('[SpeakVoice] Lỗi ghi âm:', error);
        this.isCurrentlyRecording = false;
        this.callbacks.onRecordingError(error);

        // Delay timer một lúc rồi dọn dẹp các màu sắc bị dư thừa
        this.scene.time.delayedCall(2000, () => {
            this.microBtn.clearTint();
            this.hideRecordingIndicator();
        });
    }
}

