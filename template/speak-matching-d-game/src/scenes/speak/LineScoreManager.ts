/**
 * LineScoreManager - Quản lý async API scoring cho từng dòng
 * 
 * Logic:
 * - Gọi API bất đồng bộ sau mỗi dòng đọc xong
 * - Không blocking - bé có thể đọc dòng tiếp ngay
 * - Khi đọc xong dòng cuối, chờ tất cả API hoàn thành
 * - Tính điểm trung bình 6 dòng, làm tròn 0.5
 */
import { GameConstants } from '../../consts/GameConstants';
import { VoiceHandler, type VoiceEvalResponse } from '../../utils/VoiceHandler';

export class LineScoreManager {
    private scores: (number | null)[] = [];
    private pendingPromises: Promise<VoiceEvalResponse>[] = [];
    private apiUrl: string;

    constructor() {
        const CFG = GameConstants.VOICE_RECORDING;
        this.apiUrl = CFG.TEST_MODE ? CFG.API_URL_DEV : CFG.API_URL;
        this.reset();
    }

    /**
     * Reset để bắt đầu session mới
     */
    reset(): void {
        const total = GameConstants.SPEAK_SCENE.LINE_READING.TOTAL_LINES;
        this.scores = new Array(total).fill(null);
        this.pendingPromises = [];
    }

    /**
     * Gửi audio để chấm điểm 1 dòng (async, không blocking)
     * @param lineIndex - Index của dòng (0-5)
     * @param audioBlob - Audio blob đã ghi âm
     */
    submitLineScore(lineIndex: number, audioBlob: Blob): void {
        const keyword = GameConstants.SPEAK_SCENE.LINE_READING.KEYWORDS_PER_LINE[lineIndex];

        console.log(`[LineScoreManager] Submitting line ${lineIndex + 1}/6, keyword: "${keyword}"`);
        console.log(`[LineScoreManager] Audio size: ${audioBlob.size} bytes`);

        const startTime = performance.now();

        const promise = VoiceHandler.sendToBackend(audioBlob, keyword, this.apiUrl)
            .then((result) => {
                const latency = performance.now() - startTime;
                console.log(`[LineScoreManager] Line ${lineIndex + 1} scored in ${latency.toFixed(0)}ms: ${result.score}`);

                // Lưu điểm
                this.scores[lineIndex] = result.score ?? 0;
                return result;
            })
            .catch((err) => {
                const latency = performance.now() - startTime;
                console.error(`[LineScoreManager] Line ${lineIndex + 1} error after ${latency.toFixed(0)}ms:`, err);

                // Lỗi thì cho điểm 0
                this.scores[lineIndex] = 0;
                return {
                    status: 'retry' as const,
                    score: 0,
                    transcript: '',
                    latency_seconds: latency / 1000
                };
            });

        this.pendingPromises.push(promise);
    }

    /**
     * Chờ tất cả API hoàn thành và trả về điểm trung bình (hệ 10, làm tròn LÊN)
     * @returns Promise<number> - Điểm cuối cùng (4-10)
     */
    async getFinalScore(): Promise<number> {
        console.log('[LineScoreManager] Waiting for all scores...');

        // Chờ tất cả promises
        await Promise.all(this.pendingPromises);

        // Tính trung bình (hệ 100)
        const validScores = this.scores.filter((s): s is number => s !== null);

        if (validScores.length === 0) {
            console.warn('[LineScoreManager] No valid scores, returning MIN_SCORE');
            return GameConstants.VOICE_RECORDING.MIN_SCORE;
        }

        const sum = validScores.reduce((a, b) => a + b, 0);
        const avg100 = sum / validScores.length;

        // Chuyển từ hệ 100 sang hệ 10
        const avg10 = avg100 / 10;

        // Làm tròn LÊN (6.3 → 7)
        const rounded = Math.ceil(avg10);

        // Clamp giữa MIN_SCORE và 10
        const CFG = GameConstants.VOICE_RECORDING;
        const finalScore = Math.max(CFG.MIN_SCORE, Math.min(10, rounded));

        console.log(`[LineScoreManager] API avg: ${avg100.toFixed(2)}% → ${avg10.toFixed(2)}/10 → rounded UP: ${finalScore}/10`);
        console.log(`[LineScoreManager] Individual scores:`, this.scores);

        return finalScore;
    }

    /**
     * Getter: số dòng đã được chấm điểm
     */
    get scoredCount(): number {
        return this.scores.filter(s => s !== null).length;
    }

    /**
     * Getter: mảng điểm hiện tại (để debug)
     */
    get currentScores(): (number | null)[] {
        return [...this.scores];
    }
}
