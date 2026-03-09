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
        /** Thời gian tối đa ghi âm (ms). 60000 = 1 phút, 105000 = 1p45s */
        MAX_DURATION: 30000,        // 30 giây (default)
        /** Thời gian im lặng tối đa trước khi tự động dừng (ms). 5000-10000 */
        SILENCE_TIMEOUT: 3000,      // 3 giây
        /** Thời gian calibration để tính baseline volume (ms) */
        CALIBRATION_DURATION: 1000, // 2 giây
        /** Margin thêm vào baseline để lọc tạp âm (0-50) - Logic VAD mới thông minh hơn nên cần margin nhỏ */
        NOISE_MARGIN: 2,

        /** API endpoint để gửi audio */
        API_URL: 'http://0.0.0.0:8000/api/v1/voice/eval/5-6',
        /** API endpoint để gửi audio (DEV) */
        API_URL_DEV: 'http://0.0.0.0:8000/api/v1/voice/eval/5-6',

        /** Chế độ test: true = lưu file local, false = gửi BE */
        TEST_MODE: true,

        // ===== SCORING CONFIG (hệ 10) =====
        /** Điểm tối thiểu (4/10) */
        MIN_SCORE: 4,
        /** Điểm trung bình - ngưỡng đạt (7/10) */
        AVERAGE_SCORE: 7,
        /** Điểm tốt (9/10) */
        GOOD_SCORE: 9,
        /** Điểm >= AVERAGE_SCORE sẽ pass (mascot vui), < AVERAGE_SCORE sẽ fail (mascot buồn) */
        PASS_THRESHOLD: 7,

        /** Thời gian chờ trước khi cho phép thử lại (ms) */
        RETRY_DELAY: 2000,
    },

    // =========================================
    // SPEAK SCENE: Nghe và đọc lại đoạn văn
    // =========================================
    SPEAK_SCENE: {
        // --- BANNER (trên cùng, ngoài canvas) ---
        BANNER: {
            X: 0.5,
            Y: 0.01,
            SCALE: 0.65,
        },
        // --- CANVAS/BOARD (nền trắng chứa elements) ---
        BOARD: {
            X: 0.5,
            Y: 0.54,
            SCALE: 0.7,
            ALPHA: 1.0,
        },
        // --- TITLE (tiêu đề bài đồng dao) ---
        TITLE: {
            X: 0.324,
            Y: 0.5,
            SCALE: 0.7,
        },
        // --- SMILE D ICON (trang trí) ---
        SMILE_D: {
            X: 0.3,
            Y: 0.3,
            SCALE: 0.6,
        },
        // --- CONTENT (lời đồng dao) ---
        CONTENT: {
            X: 0.37,
            Y: 0.73,
            SCALE: 0.80,
        },
        // --- ILLUSTRATION (hình minh họa) ---
        ILLUSTRATION: {
            X: 0.657,
            Y: 0.358,
            SCALE: 0.63,
        },
        // --- SPEAKER BUTTON (nút loa) ---
        SPEAKER: {
            X: 0.78,
            Y: 0.88,
            SCALE: 0.6,
        },
        // --- MICRO BUTTON (nút mic) ---
        MICRO: {
            X: 0.78,
            Y: 0.75,
            SCALE: 0.6,
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
            RECORDING_DURATION: 3000,
            DELAY_NEXT_SCENE: 3500,
        },
        // --- READING FINGER (ngón tay chỉ đọc) ---
        READING_FINGER: {
            ENABLED: true,              // Bật/tắt hiệu ứng
            SCALE: 0.5,                 // Scale của ngón tay
            SPEED: 150,                 // Pixels per second (càng nhỏ càng chậm)
            LINE_DELAY: 900,            // Delay giữa các dòng (ms)
            TRANSITION_DURATION: 300,   // Thời gian di chuyển từ cuối dòng này sang đầu dòng kế (ms)
            NODE_DELAY: 200,            // Thời gian dừng lại ở mỗi node (toa tàu) (ms)

            // 5 dòng tương ứng với 5 màn (từ 1 toa đến 5 toa)
            // nodes là mảng các vị trí X (tỉ lệ 0-1) tâm của từng toa tàu mà ngón tay sẽ chỉ vào
            // y là vị trí Y (tỉ lệ 0-1) của mép dưới tàu (ví dụ 0.6)
            LINES: [
                // Màn 1: 1 toa
                { startX: 0.5, endX: 0.55, y: 0.6, duration: 1000, nodes: [0.5] as number[] },
                // Màn 2: 2 toa
                { startX: 0.45, endX: 0.60, y: 0.6, duration: 1500, nodes: [0.45, 0.55] as number[] },
                // Màn 3: 3 toa
                { startX: 0.4, endX: 0.65, y: 0.6, duration: 2000, nodes: [0.4, 0.5, 0.6] as number[] },
                // Màn 4: 4 toa
                { startX: 0.35, endX: 0.70, y: 0.6, duration: 2500, nodes: [0.35, 0.45, 0.55, 0.65] as number[] },
                // Màn 5: 5 toa
                { startX: 0.3, endX: 0.75, y: 0.6, duration: 3000, nodes: [0.3, 0.4, 0.5, 0.6, 0.7] as number[] }
            ]
        },
        // --- SCORE BOARD (Bảng điểm/Loading) ---
        SCORE_BOARD: {
            X: 0.5,
            Y: 0.5,
            SCALE_LOADING: 0.6,
            SCALE_SCORE: 0.6,
            MASCOT_OFFSET_Y: -60,  // Offset của mascot nằm trên board
            MASCOT_SCALE: 0.6,      // Scale mascot trên board
            TEXT_OFFSET_Y: 130,    // Offset text loading
            SCORE_IMG_OFFSET_Y: -20, // Offset ảnh điểm
            SCORE_IMG_SCALE: 0.6,
        },
        // --- SPEAK ANIMATION (Hiệu ứng miệng nói khi chờ chấm điểm) ---
        SPEAK_ANIMATION: {
            X: 0.805,                     // Vị trí X (giữa màn hình)
            Y: 0.88,                      // Vị trí Y (hơi trên giữa)
            SCALE: 0.8,                   // Scale của animation
            FRAME_DURATION: 700,          // Thời gian mỗi frame (ms) - chậm mượt mà
            // Danh sách 3 frame animation
            FRAMES: [
                'ani_speak1',
                'ani_speak2',
                'ani_speak3'
            ]
        },
        // --- LINE MASKS (White boxes che các dòng chưa đọc) ---
        LINE_MASKS: {
            ENABLED: true,
            BOX_HEIGHT: 0.05,      // Chiều cao box (tỉ lệ màn hình)
            BOX_COLOR: 0xFFFFFF,
            BOX_ALPHA: 0.98,
            PADDING_X: 0.05,       // Padding trái/phải
            OFFSET_Y_UP: 0.02,     // Offset từ line y lên (vì line nằm ở chân chữ)
        },
        // --- LINE READING (Đọc từng dòng + Async scoring) ---
        LINE_READING: {
            TOTAL_LINES: 5,
            MAX_RECORD_TIME_PER_LINE: 6000,  // 6s max mỗi dòng
            KEYWORDS_PER_LINE: [
                'Lúa ngô là cô đậu nành',
                'Đậu nành là anh dưa chuột',
                'Dưa chuột là chị ruột dưa gang',
                'Dưa gang là chị chàng dưa hấu',
                'Dưa hấu là cậu lúa ngô',
                'Lúa ngô là cô đậu nành'
            ],
            // Debug mode: mapping line index → test audio file
            TEST_AUDIO_FILES: [
                'assets/test_mode/NoiNgong/line1.wav',
                'assets/test_mode/NoiNgong/line2.wav',
                'assets/test_mode/NoiNgong/line3.wav',
                'assets/test_mode/NoiNgong/line4.wav',
                'assets/test_mode/NoiNgong/line5.wav',
                'assets/test_mode/NoiNgong/line6.wav'
            ],
            // Audio prompts trước khi ghi âm mỗi dòng
            LINE_PROMPTS: [
                'intro-voice',     // Dòng 1: dùng intro voice
                'begin-line2',     // Dòng 2
                'begin-line3',     // Dòng 3
                'begin-line4',     // Dòng 4
                'begin-line5',     // Dòng 5
                'begin-line6',     // Dòng 6
            ],
            // Audio khi chờ chấm điểm
            WAIT_GRADING: 'wait-grading',
        }
    },

    // =========================================
    // UNDERLINE SCENE: Gạch chân ký tự D
    // =========================================
    UNDERLINE_SCENE: {
        // --- BANNER ---
        BANNER: {
            X: 0.5,
            Y: 0.01,
            SCALE: 0.65,
        },
        // --- BOARD/CANVAS ---
        BOARD: {
            X: 0.5,
            Y: 0.54,
            SCALE: 0.70,
            ALPHA: 0.8,
        },
        // --- ITEMS (3 quả trái cây - Bố cục tam giác) ---
        ITEMS: {
            SCALE: 0.55,
            // Dưa hấu (bottom-left)
            WATERMELON_X: 0.28,
            WATERMELON_Y: 0.60,
            // Dừa (top-center)
            COCONUT_X: 0.50,
            COCONUT_Y: 0.32,
            // Dâu tây (bottom-right)
            STRAWBERRY_X: 0.72,
            STRAWBERRY_Y: 0.60,
        },
        // --- TEXT LABELS ---
        TEXT: {
            SCALE: 0.8,
            OFFSET_Y: 25,
        },
        // --- HITBOX (vùng click chữ D) ---
        HITBOX: {
            WIDTH: 70,
            HEIGHT: 120,
            WATERMELON_OFFSET_X: -35,
            COCONUT_OFFSET_X: 25,
            STRAWBERRY_OFFSET_X: -25,
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
        X: 0.65,
        Y: 0.8,
        SCALE: 0.7,
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
                FRAME_WIDTH: 300,
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
            REPEAT: 2,
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
            REPEAT: 2,
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