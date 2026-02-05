import { TextureKeys } from './Keys';

/**
 * Chứa toàn bộ hằng số cấu hình của Game.
 * 
 * ===== HƯỚNG DẪN CHỈNH X, Y =====
 * 
 * Tất cả giá trị X, Y dùng TỈ LỆ SO VỚI MÀN HÌNH (0.0 - 1.0):
 * - X = 0.0: Mép trái màn hình
 * - X = 0.5: Giữa màn hình (theo chiều ngang)
 * - X = 1.0: Mép phải màn hình
 * 
 * - Y = 0.0: Mép trên màn hình
 * - Y = 0.5: Giữa màn hình (theo chiều dọc)
 * - Y = 1.0: Mép dưới màn hình
 * 
 * Ví dụ với màn hình 1920x1080:
 * - X = 0.5 → 960px (giữa)
 * - Y = 0.3 → 324px (1/3 từ trên xuống)
 * 
 * ===== CANVAS (BOARD) =====
 * Canvas đặt ở: X=0.5, Y=0.54
 * Để element nằm trong canvas, thường dùng:
 * - X: 0.15 - 0.85 (tránh sát mép trái/phải)
 * - Y: 0.15 - 0.90 (banner ở trên, buttons ở dưới)
 */
export const GameConstants = {
    // =========================================
    // CẤU HÌNH CHUNG (SYSTEM)
    // =========================================
    IS_TEST_CONNECT_ONLY: false, // Bật để test riêng màn nối
    IDLE: {
        THRESHOLD: 10000,
        FADE_IN: 800,
        SCALE: 300,
        FADE_OUT: 500,
        OFFSET_X: 50,
        OFFSET_Y: 50,
    },

    // =========================================
    // BACKEND SESSION CONFIG
    // =========================================
    BACKEND_SESSION: {
        /** Game ID - định danh game này */
        GAME_ID: 'number6-2',
        /** Lesson ID - định danh bài học */
        LESSON_ID: 'lesson-number6-2-4-5',
        /** Game version (semver) */
        GAME_VERSION: '1.0.0',
        /** Age level: "3-4", "4-5", "5-6" */
        AGE_LEVEL: '4-5',
        /** Child ID - sẽ được lấy từ SDK hoặc query params */
        DEFAULT_CHILD_ID: 'ly_ly',
    },

    // =========================================
    // GHI ÂM GIỌNG NÓI
    // =========================================
    VOICE_RECORDING: {
        /** Thời gian tối đa ghi âm (ms). 60000 = 1 phút, 105000 = 1p45s */
        MAX_DURATION: 30000,        // 30 giây (default)
        /** Thời gian im lặng tối đa trước khi tự động dừng (ms). 5000-10000 */
        SILENCE_TIMEOUT: 3000,      // 3 giây
        /** Thời gian calibration để tính baseline volume (ms) */
        CALIBRATION_DURATION: 2000, // 2 giây
        /** Margin thêm vào baseline để lọc tạp âm (0-50) - Logic VAD mới thông minh hơn nên cần margin nhỏ */
        NOISE_MARGIN: 2,
        /** Danh sách từ khóa để so khớp (bài đồng dao) */
        KEYWORDS: 'dưa hấu, bánh chưng, lì xì, lồng đèn, bánh tét',
        /** API endpoint để gửi audio (legacy - không dùng nữa, dùng VoiceSessionManager) */
        API_URL: 'https://iruka-cors-proxy-h7j3ksnhva-as.a.run.app/',
        /** API endpoint để gửi audio (legacy - không dùng nữa, dùng VoiceSessionManager) */
        API_URL_DEV: 'https://iruka-cors-proxy-h7j3ksnhva-as.a.run.app/',
        /** Chế độ test: true = skip authentication/quota (development), false = production (requires auth) */
        // TEST_MODE: import.meta.env.DEV, // Tự động: true khi local, false khi build production
        TEST_MODE: true,

        // ===== SCORING CONFIG (hệ 10) =====
        /** Điểm tối thiểu (4/10) */
        MIN_SCORE: 4,
        /** Điểm trung bình - ngưỡng đạt (7/10) */
        AVERAGE_SCORE: 7,
        /** Điểm tốt (9/10) */
        GOOD_SCORE: 9,
        /** Điểm >= AVERAGE_SCORE sẽ pass (mascot vui), < AVERAGE_SCORE sẽ fail (mascot buồn) */
        PASS_THRESHOLD: 6,

        /** Thời gian chờ trước khi cho phép thử lại (ms) */
        RETRY_DELAY: 2000,
    },

    // =========================================
    // SPEAK SCENE: Gọi tên các đồ vật ngày Tết (5 levels)
    // =========================================
    SPEAK_SCENE: {
        // --- BANNER (trên cùng, ngoài canvas) ---
        BANNER: {
            X: 0.5,
            Y: 0.025,
            SCALE: 0.9,
            SCALE_Y: 0.82,
        },
        // --- CANVAS/BOARD (nền trắng chứa elements) ---
        BOARD: {
            X: 0.5,
            Y: 0.57,
            SCALE_X: 0.75,
            SCALE_Y: 0.69,
            ALPHA: 1.0,
        },
        // --- ITEM IMAGE (hình đồ vật - giữa màn hình) ---
        ITEM_IMAGE: {
            X: 0.5,
            Y: 0.35,
            SCALE: 1.0,
        },
        // --- LEVEL INDICATOR (Hiển thị level hiện tại) ---
        LEVEL_INDICATOR: {
            X: 0.5,
            Y: 0.15,
            FONT_SIZE: '48px',
            COLOR: '#333333',
        },
        // --- SPEAKER BUTTON (nút loa - phát audio mẫu) ---
        SPEAKER: {
            X: 0.28,
            Y: 0.80,
            SCALE: 1.0,
        },
        // --- MICRO BUTTON (nút mic) ---
        MICRO: {
            X: 0.72,
            Y: 0.80,
            SCALE: 1.0,
        },
        // --- ANIMATION ---
        ANIM: {
            SHAKE_DURATION: 500,
            FLOAT_DURATION: 1500,
            FLOAT_DISTANCE: 8,
        },
        // --- TIMING ---
        TIMING: {
            DELAY_SHOW_MIC: 500,
            RECORDING_DURATION: 5000,  // 5s max ghi âm mỗi phương tiện
            DELAY_NEXT_LEVEL: 2500,    // Delay trước khi chuyển level
            DELAY_NEXT_SCENE: 3500,
        },
        // --- TITLE (Ảnh tiêu đề PNG) ---
        TITLE: {
            X: 0.5,
            Y: 0.15,
            SCALE: 0.7,
        },
        // --- SPEAK ANIMATION (Miệng nói khi loa phát) ---
        SPEAK_ANIMATION: {
            X: 0.315, // Di chuyển sang phải loa (loa ở 0.28)
            Y: 0.8,
            SCALE: 1.0,
            FRAME_DURATION: 150, // 150ms mỗi frame cho mượt
            FRAMES: [
                'ani_speak1',
                'ani_speak2',
                'ani_speak3',
            ]
        },
        // --- SCORE BOARD (Bảng điểm/Loading) ---
        SCORE_BOARD: {
            X: 0.5,
            Y: 0.5,
            SCORE_MODAL_SCALE: 0.35,
            SCALE_LOADING: 0.35,
            SCALE_SCORE: 0.35,
            MASCOT_OFFSET_Y: 0,
            MASCOT_SCALE: 0.70,
            TEXT_OFFSET_Y: 120,
            SCORE_IMG_OFFSET_Y: -8,
            SCORE_IMG_SCALE: 0.25,
        },
        // --- ITEM LABEL ---
        ITEM_LABEL: {
            X: 0.5,
            Y: 0.59,
            FONT_SIZE: '64px',
            COLOR: '#ffffff',
            SCALE: 1.0,
        },
    },

    // ===== CONNECT SCENE CONFIG =====
    CONNECT_SCENE: {
        TEST_MODE_CONNECT: true,
        TARGET_COUNT: 8,
        BANNER: {
            X: 0.5,
            Y: 0.09,
            SCALE: 0.75,
        },
        BOARD: {
            W_RATIO: 1.05,
            H_RATIO: 0.8,
            OFFSET_Y_RATIO: 0.07,
            // Tỉ lệ padding bên trong board
            PAD_X_RATIO: 0.065,
            PAD_TOP_RATIO: 0.14,
            PAD_BOTTOM_RATIO: 0.1,
        },
        LINE: {
            WIDTH: 6,
            COLOR: 0x374151,
            ALPHA: 0.9,
        },
        ITEM: {
            HIT_W: 340,
            HIT_H: 280,
            ICON_MAX_W: 450,
            ICON_MAX_H: 360,
        },
        DICE: {
            SIZE: 220,
        },
        GROUPS_DATA: [
            { id: 'stickyRoll', label: 'bánh tét', count: 6, spriteKey: TextureKeys.Connect_Veh_StickyRoll, x: 260, y: 170, cols: 3 },
            { id: 'squareCake', label: 'bánh chưng', count: 8, spriteKey: TextureKeys.Connect_Veh_SquareCake, x: 1020, y: 170, cols: 3 },
            { id: 'red', label: 'lì xì', count: 8, spriteKey: TextureKeys.Connect_Veh_Red, x: 260, y: 560, cols: 3 },
            { id: 'lantern', label: 'lồng đèn', count: 5, spriteKey: TextureKeys.Connect_Veh_Lantern, x: 1020, y: 560, cols: 2 },
        ],
    },

    // =========================================
    // TET ITEMS CONFIG (5 vật phẩm ngày Tết)
    // =========================================
    TET_ITEMS: {
        TOTAL_LEVELS: 5,

        // Danh sách đồ vật - BẠN THAY ĐỔI Ở ĐÂY
        ITEMS: [
            {
                id: 'watermelon',
                name: 'dưa hấu',
                imageKey: 'watermelon',
                imagePath: 'assets/images/tet_items/watermelon.png',
                textKey: 'text_watermelon',
                textPath: 'assets/text/watermelon_text.png',
                audioKey: 'audio_watermelon',
                audioPath: 'assets/audio/tet_items/watermelon.mp3',
            },
            {
                id: 'squareCake',
                name: 'bánh chưng',
                imageKey: 'squareCake',
                imagePath: 'assets/images/tet_items/squareCake.png',
                textKey: 'text_squareCake',
                textPath: 'assets/text/squareCake_text.png',
                audioKey: 'audio_squareCake',
                audioPath: 'assets/audio/tet_items/squareCake.mp3',
            },
            {
                id: 'red',
                name: 'lì xì',
                imageKey: 'red',
                imagePath: 'assets/images/tet_items/red.png',
                textKey: 'text_red',
                textPath: 'assets/text/red_text.png',
                audioKey: 'audio_red',
                audioPath: 'assets/audio/tet_items/red.mp3',
                offsetY: 50,
            },
            {
                id: 'lantern',
                name: 'lồng đèn',
                imageKey: 'lantern',
                imagePath: 'assets/images/tet_items/lantern.png',
                textKey: 'text_lantern',
                textPath: 'assets/text/lantern_text.png',
                audioKey: 'audio_lantern',
                audioPath: 'assets/audio/tet_items/lantern.mp3',
            },
            {
                id: 'stickyRoll',
                name: 'bánh tét',
                imageKey: 'stickyRoll',
                imagePath: 'assets/images/tet_items/stickyRoll.png',
                textKey: 'text_stickyRoll',
                textPath: 'assets/text/stickyRoll_text.png',
                audioKey: 'audio_stickyRoll',
                audioPath: 'assets/audio/tet_items/stickyRoll.mp3',
            },
        ],

        // Audio hướng dẫn chung
        INTRO_AUDIO: 'intro-vehicle',  // "Con hãy đọc tên đồ vật này"
        INTRO_AUDIO_PATH: 'assets/audio/prompt/guide4.mp3',
        // Audio khi hiện Mic
        MIC_AUDIO: 'mic-vehicle',
        MIC_AUDIO_PATH: 'assets/audio/prompt/mic.mp3',
    },

    // =========================================
    // UNDERLINE SCENE: Gạch chân ký tự Đ
    // =========================================
    UNDERLINE_SCENE: {
        // --- BANNER ---
        BANNER: {
            X: 0.5,
            Y: 0.06,
            SCALE: 0.75,
        },
        // --- BOARD/CANVAS ---
        BOARD: {
            X: 0.5,
            Y: 0.58,
            SCALE: 0.70,
            ALPHA: 0.8,
        },
        // --- ITEMS (3 loại cây - Bố cục tam giác) ---
        ITEMS: {
            SCALE: 0.55,
            // Hoa đào
            BLOSSOM_X: 0.28,
            BLOSSOM_Y: 0.60,
            // Dừa (top-center)
            DAISY_X: 0.50,
            DAISY_Y: 0.32,
            // Dâu tây (bottom-right)
            BANYAN_X: 0.72,
            BANYAN_Y: 0.60,
        },
        // --- TEXT LABELS ---
        TEXT: {
            SCALE: 1.0,
            OFFSET_Y: 30,
        },
        // --- HITBOX (vùng click chữ Đ) ---
        HITBOX: {
            WIDTH: 50,
            HEIGHT: 100,
            WATERMELON_OFFSET_X: 30,
            COCONUT_OFFSET_X: -80,
            STRAWBERRY_OFFSET_X: 50,
        },
        // --- ANIMATION ---
        ANIM: {
            FLOAT_DURATION: 1500,
        },
        // --- TIMING ---
        TIMING: {
            WIN_DELAY: 1500,
        }
    },

    // =========================================
    // END GAME SCENE
    // =========================================
    ENDGAME: {
        UI: {
            BANNER_OFFSET: 0.12,
            ICON_OFFSET: 150,
            BTN_OFFSET: 0.2,
            BTN_SPACING: 250,
        },
        CONFETTI: {
            DELAY: 100,
            MIN_DUR: 3000,
            MAX_DUR: 5000,
        },
        ANIM: {
            ICON_FLOAT: 800,
            ICON_SHAKE: 600,
            FIREWORKS_DELAY: 2000,
        }
    },

    // =========================================
    // MASCOT ANIMATIONS (Sprite Sheet)
    // =========================================
    MASCOT_ANIMATIONS: {
        // Vị trí chung cho mascot
        X: 0.58,
        Y: 0.8,
        SCALE: 0.75,
        DEPTH: 60,

        // Trạng thái 1: Đang ghi âm (Recording)
        RECORDING: {
            SPRITE_SHEET: {
                KEY: 'mascot_recording',
                PATH: 'assets/animation/spritesheet_trang_thai_1.png',
                FRAME_WIDTH: 345,
                FRAME_HEIGHT: 310,
                START_FRAME: 0,
                END_FRAME: 6,  // 7 frames
            },
            FRAME_DURATION: 200,
            REPEAT: -1,
        },

        // Trạng thái 2: Đang xử lý (Processing)
        PROCESSING: {
            SPRITE_SHEET: {
                KEY: 'mascot_processing',
                PATH: 'assets/animation/trang_thai_2.png',
                FRAME_WIDTH: 300,  // 2517 / 8 = ~315
                FRAME_HEIGHT: 424,
                START_FRAME: 0,
                END_FRAME: 7,  // 8 frames
            },
            FRAME_DURATION: 200,
            REPEAT: -1,
        },

        // Trạng thái 3a: Kết quả vui (Result Happy)
        RESULT_HAPPY: {
            SPRITE_SHEET: {
                KEY: 'mascot_happy',
                PATH: 'assets/animation/trang_thai_3_-_vui_ve.png',
                FRAME_WIDTH: 300,
                FRAME_HEIGHT: 308,
                START_FRAME: 0,
                END_FRAME: 5,  // 6 frames
            },
            FRAME_DURATION: 150,
            REPEAT: -1,
        },

        // Trạng thái 3b: Kết quả buồn (Result Sad)
        RESULT_SAD: {
            SPRITE_SHEET: {
                KEY: 'mascot_sad',
                PATH: 'assets/animation/trang_thai_3_-_that_vong.png',
                FRAME_WIDTH: 300,
                FRAME_HEIGHT: 310,
                START_FRAME: 0,
                END_FRAME: 5,  // 6 frames
            },
            FRAME_DURATION: 180,
            REPEAT: -1,
        },

        // Trạng thái đứng yên (Idle) - hiển thị giữa các trạng thái
        IDLE: {
            SPRITE_SHEET: {
                KEY: 'mascot_idle',
                PATH: 'assets/animation/trang_thai_dung_yen.png',
                FRAME_WIDTH: 300,
                FRAME_HEIGHT: 340,
                START_FRAME: 0,
                END_FRAME: 4,  // 5 frames
            },
            FRAME_DURATION: 200,
            REPEAT: -1,
        },
    }
} as const;
