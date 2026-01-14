    // scoreEngine.ts
    export type AgeBand = "3-4" | "4-5" | "5-6";

    export type SpeechMetrics = {
    // A: % lệch chuẩn tốc độ (vd 0.25 = lệch 25% so với chuẩn)
    speedDeviation?: number; // 0..n

    // B: % khớp từ (0..100)
    wordMatchPct?: number; // 0..100

    // C: số lần vấp / câu
    stumblingCount?: number;

    // D: số lỗi âm vị
    phonemeErrorCount?: number;

    // E: số lần lặp từ
    repetitionCount?: number;

    // F: ngắt nghỉ đúng (true/false) hoặc chấm điểm mức độ
    pauseOk?: boolean;
    };

    type Weights = Record<"A" | "B" | "C" | "D" | "E" | "F", number>;

    export const AGE_WEIGHTS: Record<AgeBand, Weights> = {
    "3-4": { A: 0,   B: 1.0, C: 0,   D: 0,   E: 0,    F: 0 },
    "4-5": { A: 0.1, B: 0.5, C: 0.1, D: 0,   E: 0.15, F: 0.15 },
    "5-6": { A: 0.2, B: 0.4, C: 0.1, D: 0.1, E: 0.1,  F: 0.1 },
    };

    // --- Penalty (P) mapping: chỉnh bằng ngưỡng theo tuổi ---
    // Mục tiêu: đơn giản + tuyến tính, dễ tune.

    type Thresholds = {
    // A: tốc độ: lệch <= good thì không phạt, >= bad thì phạt tối đa
    speedGood: number; // vd 0.15 = lệch 15%
    speedBad: number;  // vd 0.45 = lệch 45%

    // B: accuracy: >= good% thì không phạt, <= bad% thì phạt tối đa
    matchGoodPct: number; // vd 90
    matchBadPct: number;  // vd 55

    // C: vấp: <= good lần không phạt, >= bad lần phạt tối đa
    stumbleGood: number;
    stumbleBad: number;

    // D: ngọng (lỗi âm vị)
    phonemeGood: number;
    phonemeBad: number;

    // E: lặp từ
    repeatGood: number;
    repeatBad: number;
    };

    export const AGE_THRESHOLDS: Record<AgeBand, Thresholds> = {
    "3-4": {
        speedGood: 0.999, speedBad: 1.0,         // không dùng (W_A=0)
        matchGoodPct: 85, matchBadPct: 45,       // trẻ nhỏ: chỉ cần nhận diện từ khóa tương đối
        stumbleGood: 999, stumbleBad: 1000,      // không dùng
        phonemeGood: 999, phonemeBad: 1000,      // không dùng
        repeatGood: 999, repeatBad: 1000,        // không dùng
    },
    "4-5": {
        speedGood: 0.20, speedBad: 0.55,         // cho lệch thoáng hơn
        matchGoodPct: 90, matchBadPct: 55,
        stumbleGood: 1, stumbleBad: 4,
        phonemeGood: 999, phonemeBad: 1000,      // không dùng (W_D=0)
        repeatGood: 1, repeatBad: 4,
    },
    "5-6": {
        speedGood: 0.15, speedBad: 0.45,
        matchGoodPct: 92, matchBadPct: 60,
        stumbleGood: 1, stumbleBad: 3,
        phonemeGood: 1, phonemeBad: 5,
        repeatGood: 1, repeatBad: 3,
    },
    };

    function clamp01(x: number) {
    return Math.max(0, Math.min(1, x));
    }

    // tuyến tính: <=good => 0, >=bad => 1
    function penaltyHigherWorse(value: number, good: number, bad: number) {
    if (value <= good) return 0;
    if (value >= bad) return 1;
    return (value - good) / (bad - good);
    }

    // tuyến tính ngược: >=good => 0, <=bad => 1
    function penaltyLowerWorse(value: number, good: number, bad: number) {
    if (value >= good) return 0;
    if (value <= bad) return 1;
    return (good - value) / (good - bad);
    }

    export function computeSpeechScore(opts: {
    ageBand: AgeBand;
    metrics: SpeechMetrics;
    basePoints: number; // vd 10 hoặc 100
    }) {
    const { ageBand, metrics, basePoints } = opts;
    const W = AGE_WEIGHTS[ageBand];
    const T = AGE_THRESHOLDS[ageBand];

    // A
    const P_A =
        metrics.speedDeviation == null
        ? 0
        : penaltyHigherWorse(Math.abs(metrics.speedDeviation), T.speedGood, T.speedBad);

    // B
    const P_B =
        metrics.wordMatchPct == null
        ? 1 // thiếu accuracy thì coi như fail
        : penaltyLowerWorse(metrics.wordMatchPct, T.matchGoodPct, T.matchBadPct);

    // C
    const P_C =
        metrics.stumblingCount == null
        ? 0
        : penaltyHigherWorse(metrics.stumblingCount, T.stumbleGood, T.stumbleBad);

    // D
    const P_D =
        metrics.phonemeErrorCount == null
        ? 0
        : penaltyHigherWorse(metrics.phonemeErrorCount, T.phonemeGood, T.phonemeBad);

    // E
    const P_E =
        metrics.repetitionCount == null
        ? 0
        : penaltyHigherWorse(metrics.repetitionCount, T.repeatGood, T.repeatBad);

    // F
    const P_F = metrics.pauseOk == null ? 0 : metrics.pauseOk ? 0 : 1;

    const penaltyWeighted =
        W.A * P_A + W.B * P_B + W.C * P_C + W.D * P_D + W.E * P_E + W.F * P_F;

    const score01 = clamp01(1 - penaltyWeighted);
    const points = Math.round(basePoints * score01);

    return {
        points,
        score01,
        penaltyWeighted,
        penalties: { A: P_A, B: P_B, C: P_C, D: P_D, E: P_E, F: P_F },
        weights: W,
    };
    }
