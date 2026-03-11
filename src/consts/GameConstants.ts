/**
 * Chứa toàn bộ hằng số cấu hình của Game.
 *
 * ===== HƯỚNG DẪN CHỈNH X, Y =====
 * Tất cả giá trị X, Y dùng TỈ LỆ SO VỚI MÀN HÌNH (0.0 - 1.0)
 */
export const GameConstants = {
    // =========================================
    // CẤU HÌNH HỆ THỐNG
    // =========================================
    IDLE: {
        THRESHOLD: 10000,
        FADE_IN: 800,
        SCALE: 300,
        FADE_OUT: 500,
        OFFSET_X: 50,
        OFFSET_Y: 50,
    },

    // =========================================
    // GHI ÂM GIỌNG NÓI
    // =========================================
    VOICE_RECORDING: {
        /** Thời gian tối đa ghi âm (ms) */
        MAX_DURATION: 3000,
        /** Thời gian im lặng tối đa trước khi tự động dừng (ms) */
        SILENCE_TIMEOUT: 3000,
        /** Thời gian calibration đo noise floor ban đầu (ms) */
        CALIBRATION_DURATION: 500,
        /** Biên tạp âm cộng thêm vào ngưỡng (tránh bắt nhầm tiếng ồn) */
        NOISE_MARGIN: 2,

        /** API endpoint gửi audio (production) */


        /** Chế độ test của recorder: true = bỏ qua mic thật, dùng file mẫu cục bộ */
        TEST_MODE: false,
        /** Override testmode cho SDK voice. `null` = tự suy ra theo runtime (standalone=true, Hub=false) */
        SDK_TEST_MODE: null as boolean | null,

        /** Thời gian chờ trước khi cho phép thử lại (ms) */
        RETRY_DELAY: 2000,
        // ===== SCORING CONFIG (hệ 10) =====
        /** Điểm tối thiểu (4/10) */
        MIN_SCORE: 4,
        /** Điểm trung bình - ngưỡng đạt (7/10) */
        AVERAGE_SCORE: 7,
        /** Điểm tốt (9/10) */
        GOOD_SCORE: 9,
        /** Điểm >= AVERAGE_SCORE sẽ pass (mascot vui), < AVERAGE_SCORE sẽ fail (mascot buồn) */
        PASS_THRESHOLD: 7,

        /** Số lần thử lại tối đa mỗi level */
        MAX_RETRIES: 3,
    },

    // =========================================
    // SPEAK SCENE: Đếm toa tàu
    // =========================================
    SPEAK_SCENE: {
        // --- BẢNG TRẮNG (Board) ---
        BOARD: {
            X: 0.5,
            Y: 0.54,
            SCALE: 0.7,
            ALPHA: 1.0,
        },
        // --- HÌNH TÀU (Train image) ---
        TRAIN: {
            X: 0.5,
            Y: 0.48,
            SCALE: 0.55,
        },
        // --- BANNER (tiêu đề trên cùng) ---
        BANNER: {
            X: 0.5,
            Y: 0.06,
            FONT_SIZE: '36px',
            COLOR: '#FFFFFF',
            BG_COLOR: 0x2196F3,
            BG_ALPHA: 0.95,
            PADDING_X: 40,
            PADDING_Y: 12,
            BORDER_RADIUS: 20,
        },
        // --- NÚT LOA (Speaker) ---
        SPEAKER: {
            X: 0.72,
            Y: 0.82,
            SCALE: 0.7,
        },
        // --- NÚT MIC ---
        MICRO: {
            X: 0.5,
            Y: 0.82,
            SCALE: 0.7,
        },
        // --- HIỆU ỨNG ---
        ANIM: {
            SHAKE_DURATION: 500,
            FLOAT_DURATION: 1500,
            FLOAT_DISTANCE: 8,
        },
        // --- HOẠT HÌNH  (sóng âm) ---
        SPEAK_ANIMATION: {
            X: 0.62,
            Y: 0.81,
            SCALE: 0.7,
            FRAMES: ['ani_speak1', 'ani_speak2', 'ani_speak3'],
            FRAME_DURATION: 500
        },
        // --- THỜI GIAN ---
        TIMING: {
            /** Delay trước khi hiện mic (ms) */
            DELAY_SHOW_MIC: 1000,
            /** Thời gian chờ từ lúc đếm xong đến lúc nhắc click mic (ms) */
            DELAY_BEFORE_MIC: 1000,
            /** Trễ trước khi bắt đầu hiệu ứng sóng âm cho tiếng Intro (ms) */
            DELAY_INTRO_SPEAKER: 200,
            /** Thời gian ghi âm (ms) */
            RECORDING_DURATION: 5000,
            /** Delay trước khi chuyển level tiếp (ms) */
            DELAY_NEXT_LEVEL: 3000,
            /** Delay hiện kết quả (ms) */
            DELAY_SHOW_RESULT: 1000,
        },
        // --- CẤU HÌNH LEVEL ---
        LEVELS: [
            { number: 1, trainCars: 1, trainKey: 'train_1', bg: 'assets/images/bg/background_speak.png' },
            { number: 2, trainCars: 2, trainKey: 'train_2', bg: 'assets/images/bg/background_speak.png' },
            { number: 3, trainCars: 3, trainKey: 'train_3', bg: 'assets/images/bg/background_speak.png' },
            { number: 4, trainCars: 4, trainKey: 'train_4', bg: 'assets/images/bg/background_speak.png' },
            { number: 5, trainCars: 5, trainKey: 'train_5', bg: 'assets/images/bg/background_speak.png' },
        ],
        // --- BẢNG ĐIỂM / KẾT QUẢ ---
        RESULT: {
            CORRECT_COLOR: '#4CAF50',
            WRONG_COLOR: '#F44336',
            FONT_SIZE: '64px',
        },
        READING_FINGER: {
            ENABLED: true,              // Bật/tắt hiệu ứng
            SCALE: 0.5,                 // Scale của ngón tay
            SPEED: 150,                 // Pixels per second (càng nhỏ càng chậm)
            LINE_DELAY: 900,            // Delay giữa các dòng (ms)
            TRANSITION_DURATION: 300,   // Thời gian di chuyển từ cuối dòng này sang đầu dòng kế (ms)

            // Tọa độ 5 toa tàu (tỉ lệ 0-1) - dùng debug grid để canh chỉnh
            // Mỗi toa: x, y là vị trí ngón tay chỉ vào

            LINES: [
                { startX: 0.6, endX: 0.6, y: 0.53, duration: 1800 },
                { startX: 0.55, endX: 0.65, y: 0.54, duration: 1000 },
                { startX: 0.48, endX: 0.65, y: 0.6, duration: 2000 },
                { startX: 0.45, endX: 0.67, y: 0.481, duration: 2400 }, // Tăng Y từ 0.77 -> 0.79
                { startX: 0.40, endX: 0.7, y: 0.55, duration: 3000 }, // Tăng Y từ 0.83 -> 0.85
            ]
        },
    },

    // =========================================
    // UNDERLINE SCENE: Gạch chân ký tự
    // =========================================
    UNDERLINE_SCENE: {
        BANNER: { X: 0.5, Y: 0.01, SCALE: 0.65 },
        BOARD: { X: 0.5, Y: 0.54, SCALE: 0.70, ALPHA: 0.8 },
        ANIM: { FLOAT_DURATION: 1500 },
        TIMING: { WIN_DELAY: 1500 }
    },

    // =========================================
    // MÀN KẾT THÚC (END GAME)
    // =========================================
    ENDGAME: {
        UI: { BANNER_OFFSET: 0.12, ICON_OFFSET: 150, BTN_OFFSET: 0.2, BTN_SPACING: 250 },
        CONFETTI: { DELAY: 100, MIN_DUR: 3000, MAX_DUR: 5000 },
        ANIM: { ICON_FLOAT: 800, ICON_SHAKE: 600, FIREWORKS_DELAY: 2000 }
    },

    // =========================================
    // HOẠT HÌNH MASCOT (Sprite Sheet)
    // =========================================
    MASCOT_ANIMATIONS: {
        X: 0.63,
        Y: 0.8,
        SCALE: 0.7,
        DEPTH: 60,

        RECORDING: {
            SPRITE_SHEET: {
                KEY: 'mascot_recording',
                PATH: 'assets/animation/spritesheet_trang_thai_1.png',
                FRAME_WIDTH: 345, FRAME_HEIGHT: 310,
                START_FRAME: 0, END_FRAME: 6,
            },
            FRAME_DURATION: 200, REPEAT: -1,
        },
        PROCESSING: {
            SPRITE_SHEET: {
                KEY: 'mascot_processing',
                PATH: 'assets/animation/trang_thai_2.png',
                FRAME_WIDTH: 300, FRAME_HEIGHT: 424,
                START_FRAME: 0, END_FRAME: 7,
            },
            FRAME_DURATION: 200, REPEAT: -1,
        },
        RESULT_HAPPY: {
            SPRITE_SHEET: {
                KEY: 'mascot_happy',
                PATH: 'assets/animation/trang_thai_3_-_vui_ve.png',
                FRAME_WIDTH: 300, FRAME_HEIGHT: 308,
                START_FRAME: 0, END_FRAME: 5,
            },
            FRAME_DURATION: 150, REPEAT: 2,
        },
        RESULT_SAD: {
            SPRITE_SHEET: {
                KEY: 'mascot_sad',
                PATH: 'assets/animation/trang_thai_3_-_that_vong.png',
                FRAME_WIDTH: 300, FRAME_HEIGHT: 310,
                START_FRAME: 0, END_FRAME: 5,
            },
            FRAME_DURATION: 180, REPEAT: 2,
        },
        IDLE: {
            SPRITE_SHEET: {
                KEY: 'mascot_idle',
                PATH: 'assets/animation/trang_thai_dung_yen.png',
                FRAME_WIDTH: 300, FRAME_HEIGHT: 340,
                START_FRAME: 0, END_FRAME: 4,
            },
            FRAME_DURATION: 200, REPEAT: -1,
        },
    }
} as const;
