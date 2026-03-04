// src/rotateOrientation.ts
import Phaser from 'phaser';
import AudioManager from '../audio/AudioManager';

// ================== STATE CHUNG ==================
let rotateOverlay: HTMLDivElement | null = null;
let isRotateOverlayActive = false;
let currentVoiceKey: string | null = null;
let gameSceneReference: any = null;
let globalBlockListenersAttached = false;

let lastRotateVoiceTime = 0;
const ROTATE_VOICE_COOLDOWN = 1500; // ms – 1.5s
//let instructionVoiceStoppedByRotate = false;
let interruptedVoiceKey: string | null = null;

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
        key === 'voice-rotate'
    ) {
        return 4;
    }
    return 1;
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
    if (isRotateOverlayActive && key !== 'voice-rotate') {
        console.warn(
            `[Rotate] Đang overlay xoay màn hình, chỉ phát voice-rotate (bỏ qua "${key}")`
        );
        return;
    }

    // === TRƯỜNG HỢP ĐẶC BIỆT: voice-rotate ===
    // - Tắt hết âm thanh khác của game
    // - Có cooldown để tránh spam liên tục
    if (key === 'voice-rotate') {
        const now = Date.now();
        if (now - lastRotateVoiceTime < ROTATE_VOICE_COOLDOWN) {
            return;
        }
        if (currentVoiceKey === 'instruction' || 
        currentVoiceKey === 'cau_do' || 
        currentVoiceKey === 'voice_intro_s2') {
            
        interruptedVoiceKey = currentVoiceKey; // <--- LƯU LẠI TÊN NÓ
    }
    // ------------------------------------------

    lastRotateVoiceTime = now;
        lastRotateVoiceTime = now;

        try {
            const am = AudioManager as any;

            // dừng toàn bộ âm thanh game (bgm + sfx + voice)
            if (typeof am.stopAll === 'function') {
                am.stopAll();
            }
            if (typeof am.stopAllVoicePrompts === 'function') {
                am.stopAllVoicePrompts();
            }
        } catch (e) {
            console.warn('[Rotate] stop all audio error:', e);
        }

        currentVoiceKey = null;

        const id = AudioManager.play('voice-rotate');
        if (id === undefined) {
            console.warn(
                `[Rotate] Không phát được audio key="voice-rotate" (Howler).`
            );
            return;
        }

        currentVoiceKey = 'voice-rotate';
        return;
    }

    // === CÁC VOICE BÌNH THƯỜNG (q_, drag_, correct, ...) ===
    const newPri = getVoicePriority(key);
    const curPri = currentVoiceKey ? getVoicePriority(currentVoiceKey) : 0;

    if (currentVoiceKey === key) return; // tránh spam cùng key
    if (currentVoiceKey && curPri > newPri) return; // không cho voice ưu tiên thấp đè

    if (currentVoiceKey) {
        AudioManager.stop(currentVoiceKey);
        currentVoiceKey = null;
    }

    if (key === 'instruction' || key === 'cau_do' || key === 'voice_intro_s2') {
        interruptedVoiceKey = null; // Reset nếu nó được chạy mới đàng hoàng
    }

    const id = AudioManager.play(key);
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

        // 2) Gọi phát voice-rotate (đã có cooldown bên trong playVoiceLocked)
        try {
            playVoiceLocked(null as any, 'voice-rotate');
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
        '"Fredoka", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
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

    const overlayTurnedOn = !overlayWasActive && shouldShow;
    const overlayTurnedOff = overlayWasActive && !shouldShow;

    rotateOverlay.style.display = shouldShow ? 'flex' : 'none';

    // === Khi overlay BẬT LÊN LẦN ĐẦU (ví dụ mới vào game ở màn dọc) ===
    if (overlayTurnedOn) {
        try {
            // Gọi voice-rotate ngay (bên trong đã có cooldown + stopAll)
            playVoiceLocked(null as any, 'voice-rotate');

            // Lệnh này sẽ đóng băng mọi thứ: Tween, Timer, Update loop...
            if (gameSceneReference && gameSceneReference.scene) {
                // Kiểm tra xem scene có đang chạy không để tránh lỗi
                if (gameSceneReference.scene.isActive()) {
                     gameSceneReference.scene.pause();
                }
            }
        } catch (e) {
            console.warn('[Rotate] auto play voice-rotate error:', e);
        }
    }

    // === Khi overlay TẮT (xoay ngang lại) ===
    // Trong hàm updateRotateHint

// === Khi overlay TẮT (xoay ngang lại) ===
    if (overlayTurnedOff) {
        if (currentVoiceKey === 'voice-rotate') {
            AudioManager.stop('voice-rotate');
            currentVoiceKey = null;
        }

        // Mọi thứ sẽ chạy tiếp từ chỗ bị dừng
        if (gameSceneReference && gameSceneReference.scene) {
            if (gameSceneReference.scene.isPaused()) {
                gameSceneReference.scene.resume();
            }
        }

    // --- LOGIC PHỤC HỒI MỚI ---
        if (interruptedVoiceKey) {
            console.log(`[Rotate] Phục hồi voice bị ngắt: ${interruptedVoiceKey}`);
            
            // Xử lý đặc biệt cho Scene 2 (cần chạy lại cả Intro chứ không chỉ Voice)
            if (interruptedVoiceKey === 'voice_intro_s2' && gameSceneReference.restartIntro) {
                gameSceneReference.restartIntro(); 
            } 
            // Xử lý cho Scene 1 (Chỉ cần đọc lại voice là đủ)
            else {
                playVoiceLocked(null, interruptedVoiceKey);
            }
            
            interruptedVoiceKey = null; // Xài xong rồi thì xóa đi
        }
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

    window.addEventListener('resize', updateRotateHint);
    window.addEventListener(
        'orientationchange',
        updateRotateHint as unknown as EventListener
    );
}

export function resetVoiceState() { // <--- THÊM HÀM NÀY
    currentVoiceKey = null;
    interruptedVoiceKey = null;
}

export function setGameSceneReference(scene: any) {
    gameSceneReference = scene;
}
