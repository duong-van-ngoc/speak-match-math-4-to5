// src/rotateOrientation.ts
import Phaser from 'phaser';
import audioManager from './AudioManager';
import { ensureBgmStarted } from "./main";
// ================== STATE CHUNG ==================
let rotateOverlay: HTMLDivElement | null = null;
let isRotateOverlayActive = false;
let currentVoiceKey: string | null = null;

const AUDIO_UNLOCKED_KEY = '__audioUnlocked__';
const AUDIO_UNLOCKED_EVENT = 'audio-unlocked';

// chỉ attach 1 lần
let globalBlockListenersAttached = false;

// chống spam voice-rotate
let lastRotateVoiceTime = 0;
const ROTATE_VOICE_COOLDOWN = 1500; // ms – 1.5s

// Intro chỉ phát 1 lần cho cả game
let introPlayedOnce = false;

export function hasIntroPlayed(): boolean {
    return introPlayedOnce;
}

export function markIntroPlayed(): void {
    introPlayedOnce = true;
}

// ================== CẤU HÌNH CỐ ĐỊNH (DÙNG CHUNG) ==================
type RotateConfig = {
    breakpoint: number; // max width để coi là màn nhỏ (mobile)
    message: string; // text hiển thị trên popup
    lockPointer: boolean; // true = chặn click xuyên xuống game
};

const rotateConfig: RotateConfig = {
    breakpoint: 768,
    message: 'Bé Hãy Xoay Ngang Màn Hình Để Chơi Nhé 🌈',
    lockPointer: true,
};

// ================== ƯU TIÊN VOICE ==================
function getVoicePriority(key: string): number {
    if (key.startsWith('drag_') || key.startsWith('q_')) return 1;
    if (key === 'voice_need_finish') return 2;
    if (key === 'sfx_correct' || key === 'sfx_wrong') return 3;
    if (
        key === 'voice_complete' ||
        key === 'voice_intro' ||
        key === 'voice_end' ||
        key === 'voice_rotate'
    ) {
        return 4;
    }
    return 1;
}

// Cho màn phụ (BalanceScene) reset trạng thái ưu tiên/khóa voice
export function resetRotateVoiceLock(): void {
    currentVoiceKey = null;
    lastRotateVoiceTime = 0;
}

/**
 * API giữ nguyên cho các scene:
 *   playVoiceLocked(this.sound, 'q_...')
 * Nội bộ: dùng AudioManager (Howler), bỏ hẳn Phaser.Sound.
 */
export function playVoiceLocked(
    _sound: Phaser.Sound.BaseSoundManager | null,
    key: string
): void {
    // Khi đang overlay xoay ngang → chỉ cho phát voice-rotate
    if (isRotateOverlayActive && key !== 'voice_rotate') {
        console.warn(
            `[Rotate] Đang overlay xoay màn hình, chỉ phát voice-rotate (bỏ qua "${key}")`
        );
        return;
    }

    // === TRƯỜNG HỢP ĐẶC BIỆT: voice_rotate ===
    // - Tắt hết âm thanh khác của game
    // - Có cooldown để tránh spam liên tục
    if (key === 'voice_rotate') {
        // If rotate voice is already playing, don't restart it (prevents "cut in the middle").
        if (currentVoiceKey === 'voice_rotate' && audioManager.isPlaying('voice_rotate')) {
            return;
        }

        const now = Date.now();
        if (now - lastRotateVoiceTime < ROTATE_VOICE_COOLDOWN) {
            // console.warn(
            //     '[Rotate] Bỏ qua voice-rotate vì cooldown (chống spam)'
            // );
            return;
        }
        lastRotateVoiceTime = now;

        currentVoiceKey = null;

        // Ensure rotate voice doesn't overlap with current guide voices.
        audioManager.stop('voice_sort_road');
        audioManager.stop('voice_sort_bridge');

        const id = audioManager.play('voice_rotate');
        if (id === undefined) {
            console.warn(
                `[Rotate] Không phát được audio key="voice_rotate" (Howler).`
            );
            return;
        }

        currentVoiceKey = 'voice_rotate';
        return;
    }

    // === CÁC VOICE BÌNH THƯỜNG (q_, drag_, correct, ...) ===
    const newPri = getVoicePriority(key);
    const curPri = currentVoiceKey ? getVoicePriority(currentVoiceKey) : 0;

    if (currentVoiceKey === key) return; // tránh spam cùng key
    if (currentVoiceKey && curPri >= newPri) return; // không cho voice ưu tiên thấp đè

    if (currentVoiceKey) {
        audioManager.stop(currentVoiceKey);
        currentVoiceKey = null;
    }

    const id = audioManager.play(key);
    if (id === undefined) {
        console.warn(`[Rotate] Không phát được audio key="${key}" (Howler).`);
        return;
    }

    currentVoiceKey = key;
}

// ================== BLOCK & REPLAY KHI OVERLAY BẬT ==================
function attachGlobalBlockInputListeners() {
    if (globalBlockListenersAttached) return;
    globalBlockListenersAttached = true;

    const handler = (ev: Event) => {
        if (!isRotateOverlayActive) return;

        // Khi overlay đang hiển thị:
        // 1) Chặn event không cho rơi xuống Phaser
        ev.stopPropagation();
        if (typeof (ev as any).stopImmediatePropagation === 'function') {
            (ev as any).stopImmediatePropagation();
        }
        ev.preventDefault();

         // 2) LẦN ĐẦU bé chạm overlay -> bật BGM ở đây (gesture iOS cho phép)
        ensureBgmStarted();
        // 3) Gọi phát voice-rotate (đã có cooldown bên trong playVoiceLocked)
        try {
            playVoiceLocked(null as any, 'voice_rotate');
        } catch (err) {
            console.warn(
                '[Rotate] global pointer play voice-rotate error:',
                err
            );
        }
    };

    const events = [
        'pointerdown',
        'pointerup',
        'click',
        'touchstart',
        'touchend',
        'mousedown',
        'mouseup',
    ];

    events.forEach((type) => {
        window.addEventListener(type, handler, {
            capture: true, // chặn ngay từ giai đoạn capture
            passive: false, // để preventDefault hoạt động
        });
    });
}

// ================== UI OVERLAY XOAY NGANG ==================
function ensureRotateOverlay() {
    if (rotateOverlay) return;

    rotateOverlay = document.createElement('div');
    rotateOverlay.id = 'rotate-overlay';
    rotateOverlay.style.position = 'fixed';
    rotateOverlay.style.inset = '0';
    rotateOverlay.style.zIndex = '2147483647'; // trên mọi thứ
    rotateOverlay.style.display = 'none';
    rotateOverlay.style.alignItems = 'center';
    rotateOverlay.style.justifyContent = 'center';
    rotateOverlay.style.textAlign = 'center';
    rotateOverlay.style.background = 'rgba(0, 0, 0, 0.6)';
    rotateOverlay.style.padding = '16px';
    rotateOverlay.style.boxSizing = 'border-box';

    // Block click phía sau
    rotateOverlay.style.pointerEvents = rotateConfig.lockPointer
        ? 'auto'
        : 'none';

    const box = document.createElement('div');
    box.style.background = 'white';
    box.style.borderRadius = '16px';
    box.style.padding = '16px 20px';
    box.style.maxWidth = '320px';
    box.style.margin = '0 auto';
    box.style.fontFamily =
        '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", "Noto Sans", sans-serif';
        // nếu sợ CSS global đè, ép luôn:
        box.style.setProperty(
        "font-family",
        '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", "Noto Sans", sans-serif',
        "important"
        );
    box.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';

    const title = document.createElement('div');
    title.textContent = rotateConfig.message;
    title.style.fontSize = '18px';
    title.style.fontWeight = '700';
    title.style.marginBottom = '8px';
    title.style.color = '#222';

    box.appendChild(title);
    rotateOverlay.appendChild(box);
    document.body.appendChild(rotateOverlay);
}

// ================== CORE LOGIC XOAY + ÂM THANH ==================
function updateRotateHint() {
    ensureRotateOverlay();
    if (!rotateOverlay) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const shouldShow = h > w && w < rotateConfig.breakpoint; // portrait & nhỏ (mobile)

    const overlayWasActive = isRotateOverlayActive;
    isRotateOverlayActive = shouldShow;

    // Expose state globally so game scenes can avoid playing guide voices while rotate overlay is active.
    try {
        (window as any).__rotateOverlayActive__ = isRotateOverlayActive;
    } catch {}

    const overlayTurnedOn = !overlayWasActive && shouldShow;
    const overlayTurnedOff = overlayWasActive && !shouldShow;

    rotateOverlay.style.display = shouldShow ? 'flex' : 'none';

    // === Khi overlay BẬT LÊN LẦN ĐẦU (ví dụ mới vào game ở màn dọc) ===
    if (overlayTurnedOn) {
        try {
            // Khi đang ở màn dọc: chỉ phát voice_rotate, tạm dừng nhạc/intro nếu có
            audioManager.stop('voice_intro');
            audioManager.stop('voice_sort_road');
            audioManager.stop('voice_sort_bridge');
            // Nếu đang phát voice hướng dẫn của game (Join-hands-feet), thì cắt luôn khi chuyển sang màn dọc.
            audioManager.stop('voice_join');
            // Nếu đang có voice khác đang "lock" thì cũng cắt để tránh chồng với voice_rotate.
            if (currentVoiceKey && currentVoiceKey !== 'voice_rotate') {
                audioManager.stop(currentVoiceKey);
                currentVoiceKey = null;
            }

            // Browser policy: only autoplay after user gesture unlock.
            // If already unlocked, we can play immediately; otherwise wait for unlock event / first tap.
            const win = window as any;
            const unlocked = !!win?.[AUDIO_UNLOCKED_KEY];
            if (unlocked) {
                playVoiceLocked(null as any, 'voice_rotate');
            } else {
                const onUnlocked = () => {
                    if (!isRotateOverlayActive) return;
                    playVoiceLocked(null as any, 'voice_rotate');
                };
                window.addEventListener(AUDIO_UNLOCKED_EVENT, onUnlocked, { once: true } as AddEventListenerOptions);
            }
        } catch (e) {
            console.warn('[Rotate] auto play voice_rotate on overlay error:', e);
        }
    }

    // === Khi overlay TẮT (xoay ngang lại) ===
    if (overlayTurnedOff) {
        if (currentVoiceKey === 'voice_rotate') {
            audioManager.stop('voice_rotate');
            currentVoiceKey = null;
        }

        // Khi xoay ngang lại:
        // - Đánh dấu audio question đã được "unlock"
        // - Nếu GameScene đã đăng ký playCurrentQuestionVoice thì phát luôn câu hỏi,
        //   để bé không cần chạm thêm lần nữa sau khi xoay ngang.
        try {
            (window as any).__questionAudioUnlocked__ = true;
            const playQuestion =
                (window as any).playCurrentQuestionVoice as
                    | (() => void)
                    | undefined;
            if (typeof playQuestion === 'function') {
                playQuestion();
            }
        } catch (e) {
            console.warn(
                '[Rotate] auto play question on rotate-off error:',
                e
            );
        }

        // Nếu game có voice hướng dẫn (instruction) thì phát lại sau khi overlay tắt.
        // Buffer lại để tránh trường hợp rotate-off xảy ra trước khi GameScene đăng ký handler.
        try {
            (window as any).__pendingInstructionVoice__ = true;
            (window as any).__pendingInstructionVoiceForce__ = true;
            const playInstruction =
                (window as any).playInstructionVoice as
                    | ((force?: boolean) => void)
                    | undefined;
            if (typeof playInstruction === 'function') {
                playInstruction(true);
            }
        } catch {}

        // // Khi xoay ngang lại: bật lại BGM và intro (intro chỉ đọc 1 lần)
        // try {
        //     if (!introPlayedOnce) {
        //         const id = audioManager.play('voice_intro');
        //         if (id !== undefined) {
        //             introPlayedOnce = true;
        //         }
        //     }
        // } catch (e) {
        //     console.warn('[Rotate] auto resume bgm/intro error:', e);
        // }
    }
}

// ================== KHỞI TẠO HỆ THỐNG XOAY ==================
/**
 * Dùng chung cho tất cả game:
 *
 *   initRotateOrientation(game);
 *
 * Không cần truyền gì thêm. Đổi text / breakpoint → sửa rotateConfig ở trên.
 */
export function initRotateOrientation(_game: Phaser.Game) {
    ensureRotateOverlay();
    attachGlobalBlockInputListeners(); // chặn + replay khi overlay bật
    updateRotateHint();

    // Cho các scene khác (GameScene, BalanceScene, ...) gọi thống nhất
    (window as any).playVoiceLocked = playVoiceLocked;

    window.addEventListener('resize', updateRotateHint);
    window.addEventListener(
        'orientationchange',
        updateRotateHint as unknown as EventListener
    );
}
