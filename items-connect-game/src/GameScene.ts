import Phaser from 'phaser';

// Hàm vẽ line nối bằng Phaser Graphics
export function drawBlackLine(scene: Phaser.Scene, x1: number, y1: number, x2: number, y2: number) {
  const graphics = scene.add.graphics(); // Hàm vẽ line nối bằng Phaser Graphics (dùng thay cho image)
  graphics.lineStyle(6, 0x000000, 1); // Độ dày 6px, màu đen, alpha 1
  graphics.beginPath();
  graphics.moveTo(x1, y1);
  graphics.lineTo(x2, y2);
  graphics.strokePath();
  graphics.closePath();
  return graphics;
}
// Ví dụ: Thay thế logic vẽ line bằng image sang dùng graphics
// Giả sử trước đây bạn có đoạn code như sau:
// const line = this.add.image(x, y, 'lineImageKey');
// line.setRotation(angle);
// line.setDisplaySize(length, thickness);

// Bây giờ thay bằng:
// const graphics = drawBlackLine(this, x1, y1, x2, y2);

// Nếu có logic nào trong class GameScene dùng image để vẽ line, hãy thay bằng drawBlackLine như trên.
import AudioManager from './AudioManager';
import { irukaGame, sdk, resetHubProgress } from './main';
import { game as irukaSdkGame } from "@iruka-edu/mini-game-sdk";

// Helper to log SDK exports and provide fallback
console.log('SDK Game exports:', irukaSdkGame);

// @ts-ignore
const createMatchTracker = irukaSdkGame.createMatchTracker || ((opts: any) => {
  console.warn('createMatchTracker not found in SDK, using mock');
  return {
    onMatchStart: (...args: any[]) => console.log('Mock.onMatchStart', ...args),
    onMatchEnd: (...args: any[]) => console.log('Mock.onMatchEnd', ...args),
    hint: (...args: any[]) => console.log('Mock.hint', ...args),
    finalize: () => console.log('Mock.finalize'),
  };
});

/* ===================== AUDIO GLOBAL FLAG ===================== */
const AUDIO_UNLOCKED_KEY = '__audioUnlocked__';
const AUDIO_UNLOCKED_EVENT = 'audio-unlocked';

/* ===================== TYPES ===================== */

type GameState = 'INTRO' | 'DRAGGING' | 'CHECKING' | 'LEVEL_END';

type ShapeKey = 'SQUARE' | 'CIRCLE' | 'TRIANGLE' | 'RECTANGLE';

type ObjectItemId =
  | 'OBJ_CLOCK'
  | 'OBJ_RING'
  | 'OBJ_FLAG'
  | 'OBJ_POSTCARD'
  | 'OBJ_WARNING'
  | 'OBJ_SETSQUARE'
  | 'OBJ_TILE'
  | 'OBJ_GIFT'
  | 'OBJ_PLATE'
  | 'OBJ_LANDSCAPE';

type ShapeItemId = 'SHAPE_SQUARE' | 'SHAPE_RECTANGLE' | 'SHAPE_CIRCLE' | 'SHAPE_TRIANGLE';
type ItemId = ObjectItemId | ShapeItemId;
type MatchKey = ShapeKey;

type WindowGameApi = {
  setRandomGameViewportBg?: () => void;
  setGameButtonsVisible?: (visible: boolean) => void;
} & Record<string, unknown>;

/* ===================== ASSETS ===================== */

const ITEM_TEXTURE: Record<ItemId, string> = {
  OBJ_CLOCK: 'obj_clock',
  OBJ_RING: 'obj_ring',
  OBJ_FLAG: 'obj_flag',
  OBJ_POSTCARD: 'obj_postcard',
  OBJ_WARNING: 'obj_warning',
  OBJ_SETSQUARE: 'obj_setsquare',
  OBJ_TILE: 'obj_tile',
  OBJ_GIFT: 'obj_gift',
  OBJ_PLATE: 'obj_plate',
  OBJ_LANDSCAPE: 'obj_landscape',

  SHAPE_SQUARE: 'shape_square',
  SHAPE_RECTANGLE: 'shape_rectangle',
  SHAPE_CIRCLE: 'shape_circle',
  SHAPE_TRIANGLE: 'shape_triangle',
};


const ITEMS_BOARD_KEY = 'banner_question';
const GUIDE_HAND_KEY = 'guide_hand';
const HINT_IMG_KEY = 'connect_hint';
const BANNER_TITLE = 'Bé nối hình';

const OBJECT_IDS: readonly ObjectItemId[] = [
  'OBJ_CLOCK',
  'OBJ_FLAG',
  'OBJ_RING',
  'OBJ_WARNING',
  'OBJ_POSTCARD',
  'OBJ_SETSQUARE',
  'OBJ_TILE',
  'OBJ_GIFT',
  'OBJ_PLATE',
  'OBJ_LANDSCAPE',
] as const;

const SHAPE_IDS: readonly ShapeItemId[] = ['SHAPE_SQUARE', 'SHAPE_RECTANGLE', 'SHAPE_CIRCLE', 'SHAPE_TRIANGLE'] as const;

const OBJECT_MATCH_KEY: Record<ObjectItemId, MatchKey> = {
  OBJ_CLOCK: 'CIRCLE',
  OBJ_RING: 'CIRCLE',
  OBJ_PLATE: 'CIRCLE',
  OBJ_FLAG: 'RECTANGLE',
  OBJ_POSTCARD: 'RECTANGLE',
  OBJ_LANDSCAPE: 'SQUARE',
  OBJ_WARNING: 'TRIANGLE',
  OBJ_SETSQUARE: 'TRIANGLE',
  OBJ_TILE: 'SQUARE',
  OBJ_GIFT: 'RECTANGLE',
};

const SHAPE_MATCH_KEY: Record<ShapeItemId, MatchKey> = {
  SHAPE_SQUARE: 'SQUARE',
  SHAPE_RECTANGLE: 'RECTANGLE',
  SHAPE_CIRCLE: 'CIRCLE',
  SHAPE_TRIANGLE: 'TRIANGLE',
};

/* ===================== SCALE ===================== */

const ITEM_SCALE = 5.0; // Tăng scale max để hình to và rõ hơn
const LINE_THICKNESS = 12;
const ITEM_FILL_RATIO = 1.0; // Giảm nhẹ để tăng khoảng cách giữa các item
const SHAPE_VERTICAL_SPACING_FACTOR = 0.8; // Giảm khoảng cách cho cột hình
const ITEMS_SHIFT_FROM_BANNER = 0;

/* ===================== CONNECTION ANCHOR ===================== */

// Lỗ tròn (tính theo pixel của ảnh gốc).
// Left column (HAND/FEET): Left=63, Top=126, W/H=40 (rotation -180° doesn't matter because we do not rotate the sprite)
// Right column (GLOVE/SHOE): Left=472, Top=126, W/H=40

/* ===================== LAYOUT ===================== */

const BANNER_Y = 60;
const BANNER_SCALE = 0.75; // Tăng limit scale để cao thêm
const BANNER_MAX_W_RATIO = 0.7; // Thu hẹp chiều ngang (ngắn lại)

const PROMPT_FONT_SIZE = 30;
const FEEDBACK_FONT_SIZE = 22;
const FEEDBACK_BOTTOM_MARGIN = 0;

const ITEMS_GAP_FROM_BANNER = -10; // Giảm khoảng cách, kéo board lên gần banner hơn
const ITEMS_GAP_FROM_FEEDBACK = 0;

const COLUMN_GAP_RATIO = 0.28;
const COLUMN_GAP_MIN = 120;
const COLUMN_GAP_MAX = 520;

const ITEMS_BOARD_PAD_X = 40; // Tăng padding ngang để board rộng hơn
const ITEMS_BOARD_PAD_Y = 30; // Giảm padding dọc để item sát mép hơn
const ITEMS_BOARD_EXTRA_H = 140; // Tăng phần mở rộng dưới đáy board
const ITEMS_BOARD_DEPTH = 4;

const ITEM_DEPTH = 5;
const LINE_DEPTH = 6;

const GUIDE_HAND_DEPTH = 50;
const GUIDE_HAND_SCALE = 0.55;
const GUIDE_HAND_OFFSET_X = -18;
const GUIDE_HAND_OFFSET_Y = 18;
const GUIDE_HAND_TAP_SCALE = 0.9;
const GUIDE_HAND_TAP_DY = 10;
const GUIDE_HAND_TAP_MS = 120;
const GUIDE_HAND_DRAG_MS = 850;
const GUIDE_HAND_PAUSE_MS = 120;
// Make the hand "push into" the right hole a bit more (visual guidance).
const GUIDE_HAND_START_DEEPEN_DIST = 64;
const GUIDE_HAND_END_DEEPEN_DIST = 38;
const GUIDE_HAND_RETURN_MS = 700;
const GUIDE_HAND_INACTIVITY_MS = 10000;

/* ===================== SCENE ===================== */

export default class GameScene extends Phaser.Scene {
  public score = 0;

  // ===== SDK Match (items) =====
  private runSeq = 1;
  private itemSeq = 0;
  private matchTracker: ReturnType<typeof createMatchTracker> | null = null;

  // hint chờ để gắn vào attempt kế tiếp
  private pendingHint = 0;
  // Flag logic replay
  private isReplay = false;
  // Flag để đánh dấu lần hiện tay hướng dẫn đầu tiên (không tính hint)


  private gameState: GameState = 'INTRO';
  private hasPlayedInstructionVoice = false;
  private currentItemScale = ITEM_SCALE;

  private promptText!: Phaser.GameObjects.Text;
  private promptImage?: Phaser.GameObjects.Image;
  private feedbackText!: Phaser.GameObjects.Text;
  private questionBanner!: Phaser.GameObjects.Image;
  private itemsBoard?: Phaser.GameObjects.Image;

  private shapeOrder: ShapeItemId[] = [];

  private leftObjects: Phaser.GameObjects.Image[] = [];
  private rightObjects: Phaser.GameObjects.Image[] = [];
  private shapeItems: Phaser.GameObjects.Image[] = [];

  private matchedObjects = new Set<ObjectItemId>();
  private matchedLines = new Map<ObjectItemId, Phaser.GameObjects.Graphics>();
  // Không cần lineCaps nữa nếu không dùng image

  private draggingObjectId?: ObjectItemId;
  private draggingKey?: MatchKey;
  private draggingObject?: Phaser.GameObjects.Image;
  private dragLineEnd?: Phaser.Math.Vector2;
  private draggingLine?: Phaser.GameObjects.Graphics;
  private wrongLine?: Phaser.GameObjects.Graphics;
  private wrongLineSeg?: { x1: number; y1: number; x2: number; y2: number };
  private audioReady = false;
  private guideHand?: Phaser.GameObjects.Image;
  private guideHandTween?: Phaser.Tweens.Tween;
  private guideHandSeqId = 0;
  private guideHandObjectId?: ObjectItemId;
  private guideHandTimer?: Phaser.Time.TimerEvent;
  private lastInteractionAtMs = 0;
  private consumePendingInstructionVoice() {
    try {
      const win = window as any;
      if (win.__rotateOverlayActive__) return;
      if (!win.__pendingInstructionVoice__) return;
      const force = !!win.__pendingInstructionVoiceForce__;
      win.__pendingInstructionVoice__ = false;
      win.__pendingInstructionVoiceForce__ = false;
      this.playInstructionVoice(force);
    } catch { }
  }
  private readonly onAudioUnlocked = () => {
    const win = window as unknown as Record<string, unknown>;
    win[AUDIO_UNLOCKED_KEY] = true;
    this.audioReady = true;

    // Không await để nhạc nền và voice có thể bắt đầu cùng lúc.
    try {
      void AudioManager.unlockAndWarmup?.();
    } catch { }

    // Khi vừa unlock lần đầu, phát voice hướng dẫn ngay (nếu chưa phát).
    this.consumePendingInstructionVoice();
    this.playInstructionVoice();
  };

  constructor() {
    super('GameScene');
  }

  /* ===================== INIT ===================== */

  init(data: { score?: number }) {
    this.score = data.score ?? 0;
    this.isReplay = !!(data as any).regenLevels;
    this.promptImage = undefined;
    this.hasPlayedInstructionVoice = false;
    this.matchedObjects.clear();
    this.matchedLines.forEach((l) => l.destroy());
    this.matchedLines.clear();
    this.draggingKey = undefined;
    this.draggingObjectId = undefined;
    this.draggingObject = undefined;
    this.dragLineEnd = undefined;
    this.wrongLine = undefined;
    this.wrongLineSeg = undefined;
    this.gameState = 'INTRO';
    this.cancelGuideHandSchedule();
    this.destroyGuideHand();

    this.destroyGuideHand();

    // Reset sequence counters to prevent payload accumulation
    this.itemSeq = 0;
    this.runSeq = 1;

    irukaGame.setTotal?.(OBJECT_IDS.length);
    resetHubProgress();

    this.lastInteractionAtMs = 0;
    const win = window as unknown as Record<string, unknown>;
    this.audioReady = !!win[AUDIO_UNLOCKED_KEY];
  }

  // Removed local SDK helpers and replaced with main.ts functions

  /* ===================== CREATE ===================== */

  create() {
    // Ensure the first interaction inside Phaser can start BGM (some users rotate to landscape
    // without ever tapping the rotate overlay, so the first real gesture is in-game).
    this.input.once('pointerdown', () => {
      try {
        (window as any).ensureBgmStarted?.();
      } catch { }
    });

    try {
      (window as unknown as WindowGameApi).setRandomGameViewportBg?.();
    } catch {
      // Optional host helper may not exist.
    }

    const { width, height } = this.scale;
    const w = window as unknown as WindowGameApi;
    w.setGameButtonsVisible?.(true);
    w.setRandomGameViewportBg?.();

    const replayBtnEl = document.getElementById('btn-replay') as HTMLButtonElement | null;
    const nextBtnEl = document.getElementById('btn-next') as HTMLButtonElement | null;

    const setBtnBgFromUrl = (el: HTMLButtonElement | null, url?: string) => {
      if (!el || !url) return;
      el.style.backgroundImage = `url("${url}")`;
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundPosition = 'center';
      el.style.backgroundSize = 'contain';
    };

    setBtnBgFromUrl(replayBtnEl, 'assets/button/replay.png');
    setBtnBgFromUrl(nextBtnEl, 'assets/button/next.png');

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    // Nhận unlock từ DOM (click/tap overlay ngoài Phaser) -> phát voice ngay sau khi unlock.
    window.addEventListener(AUDIO_UNLOCKED_EVENT, this.onAudioUnlocked, { once: true } as AddEventListenerOptions);
    // Allow rotateOrientation to trigger the instruction voice after overlay is dismissed.
    (window as any).playInstructionVoice = (force?: boolean) => this.playInstructionVoice(!!force);
    this.consumePendingInstructionVoice();
    this.events.once('shutdown', () => {
      try {
        if ((window as any).playInstructionVoice) delete (window as any).playInstructionVoice;
        this.matchTracker = null;
        this.gameState = 'INTRO';
      } catch { }
    });

    if (this.isReplay) {
      try { irukaGame.retryFromStart?.(); } catch { }
    }

    this.questionBanner = this.add
      .image(width / 2, BANNER_Y, 'btn_primary_pressed')
      .setOrigin(0.5)
      .setScale(0.55, BANNER_SCALE)
      .setDepth(20);

    this.promptText = this.add
      .text(this.questionBanner.x, this.questionBanner.y, '', {
        fontFamily: 'Fredoka, Arial',
        fontSize: `${PROMPT_FONT_SIZE}px`,
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(21);

    if (this.textures.exists(ITEMS_BOARD_KEY)) {
      this.itemsBoard = this.add
        .image(width / 2, height / 2, ITEMS_BOARD_KEY)
        .setOrigin(0.5)
        .setDepth(ITEMS_BOARD_DEPTH)
        .setAlpha(0.95)
        .setVisible(true);
    } else {
      this.itemsBoard = undefined;
    }

    this.feedbackText = this.add
      .text(0, 0, '', {
        fontFamily: 'Fredoka, Arial',
        fontSize: `${FEEDBACK_FONT_SIZE}px`,
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.scale.off('resize', this.layoutScene, this);
    this.scale.on('resize', this.layoutScene, this);

    this.buildConnectBoard();
    this.layoutScene();

    const now = Date.now();
    (window as any).irukaGameState = {
      startTime: now,
      currentScore: 0,
    };
    (irukaGame as any).startTime = (window as any).irukaGameState.startTime;

    sdk.score(0, 0);
    sdk.progress({ levelIndex: 0, total: OBJECT_IDS.length });

    this.startRound();
  }

  /* ===================== AUDIO ===================== */

  private playInstructionVoice(force = false) {
    if (!force && this.hasPlayedInstructionVoice) return;
    // When rotate overlay is active (portrait), only allow voice_rotate to play.
    if ((window as any).__rotateOverlayActive__) return;

    const play = () => {
      if (!force && this.hasPlayedInstructionVoice) return;
      if (force) AudioManager.stop('voice_join');
      // Bắt đầu BGM và voice hướng dẫn cùng lúc (khi đã unlock audio).
      try {
        (window as any).ensureBgmStarted?.();
      } catch { }
      AudioManager.playWhenReady?.('voice_join');
      this.hasPlayedInstructionVoice = true;
      // Nếu bé click/drag nhanh sau khi voice chạy thì cắt voice để tránh gây khó chịu.
      this.input.once('pointerdown', () => AudioManager.stop('voice_join'));
    };

    if (this.audioReady) {
      play();
      return;
    }

    // Audio chưa unlock (thường do rotate-off không phải gesture) -> buffer để phát sau khi unlock.
    try {
      const win = window as any;
      win.__pendingInstructionVoice__ = true;
      win.__pendingInstructionVoiceForce__ = !!(win.__pendingInstructionVoiceForce__ || force);
    } catch { }
  }

  /* ===================== BUILD ITEMS ===================== */

  private buildConnectBoard() {
    this.leftObjects.forEach((i) => i.destroy());
    this.rightObjects.forEach((i) => i.destroy());
    this.shapeItems.forEach((i) => i.destroy());
    this.leftObjects = [];
    this.rightObjects = [];
    this.shapeItems = [];

    this.matchedLines.forEach((l) => l.destroy());
    this.matchedLines.clear();
    this.matchedObjects.clear();
    this.draggingLine?.destroy();
    this.draggingLine = undefined;
    this.wrongLine?.destroy();
    this.wrongLine = undefined;

    this.shapeOrder = [...SHAPE_IDS];

    // Helper to get 1:1 scale for item image
    const getItemScale = (img: Phaser.GameObjects.Image) => {
      // Lấy kích thước gốc của texture
      const tex = this.textures.get(img.texture.key);
      const frame = tex.getSourceImage();
      if (!frame) return 1;
      // Hiển thị đúng 1:1 pixel nếu có thể (không scale lớn hơn kích thước thật)
      const scaleW = img.width / frame.width;
      const scaleH = img.height / frame.height;
      return Math.min(1, scaleW, scaleH);
    };

    for (const id of this.shapeOrder) {
      const img = this.add
        .image(0, 0, ITEM_TEXTURE[id])
        .setOrigin(0.5)
        .setDepth(ITEM_DEPTH);
      // scale về đúng 1:1 nếu có thể
      img.setScale(getItemScale(img));
      img.setData('itemId', id);
      img.setData('matchKey', SHAPE_MATCH_KEY[id]);
      img.setData('role', 'SHAPE');
      img.setInteractive({ useHandCursor: true });
      this.shapeItems.push(img);
    }

    const { leftIds, rightIds } = this.buildBalancedObjectColumns();

    for (const id of leftIds) {
      const img = this.add
        .image(0, 0, ITEM_TEXTURE[id])
        .setOrigin(0.5)
        .setDepth(ITEM_DEPTH);
      img.setScale(getItemScale(img));
      img.setData('itemId', id);
      img.setData('matchKey', OBJECT_MATCH_KEY[id]);
      img.setData('role', 'OBJECT');
      img.setInteractive({ useHandCursor: true, draggable: true });
      this.input.setDraggable(img);
      this.leftObjects.push(img);
    }

    for (const id of rightIds) {
      const img = this.add
        .image(0, 0, ITEM_TEXTURE[id])
        .setOrigin(0.5)
        .setDepth(ITEM_DEPTH);
      img.setScale(getItemScale(img));
      img.setData('itemId', id);
      img.setData('matchKey', OBJECT_MATCH_KEY[id]);
      img.setData('role', 'OBJECT');
      img.setInteractive({ useHandCursor: true, draggable: true });
      this.input.setDraggable(img);
      this.rightObjects.push(img);
    }

    this.input.removeAllListeners('dragstart');
    this.input.removeAllListeners('drag');
    this.input.removeAllListeners('dragend');
    this.input.removeAllListeners('pointerdown');

    this.input.on('dragstart', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      this.noteInteraction();
      AudioManager.stop('voice_join');
      const img = gameObject as Phaser.GameObjects.Image;
      if (img.getData('role') !== 'OBJECT') return;

      const objectId = img.getData('itemId') as ObjectItemId | undefined;
      const matchKey = img.getData('matchKey') as MatchKey | undefined;
      if (!objectId || !matchKey || this.matchedObjects.has(objectId) || this.gameState === 'LEVEL_END') return;

      AudioManager.play('sfx_click');
      this.draggingObjectId = objectId;
      this.draggingKey = matchKey;
      this.draggingObject = img;
      this.dragLineEnd = new Phaser.Math.Vector2(pointer.x, pointer.y);
      this.gameState = 'DRAGGING';

      // SDK: Start match attempt
      const ts = Date.now();
      this.matchTracker?.onMatchStart?.(objectId, ts);

      // apply hint đã xuất hiện trước đó vào attempt này
      if (this.pendingHint > 0) {
        this.matchTracker?.hint?.(this.pendingHint);
        this.pendingHint = 0;
      }

      this.leftObjects.forEach((i) => i.setScale(this.currentItemScale));
      this.rightObjects.forEach((i) => i.setScale(this.currentItemScale));
      img.setScale(this.currentItemScale * 1.06);

      if (!this.draggingLine) {
        this.draggingLine = drawBlackLine(this, 0, 0, 0, 0);
        this.draggingLine.setDepth(LINE_DEPTH).setAlpha(0.85);
      }
      this.draggingLine.setVisible(true);
      this.redrawConnections();
    });

    this.input.on('drag', (pointer: Phaser.Input.Pointer) => {
      if (!this.draggingKey || !this.draggingObjectId || this.gameState !== 'DRAGGING') return;
      this.dragLineEnd = new Phaser.Math.Vector2(pointer.x, pointer.y);
      this.redrawConnections();
    });

    this.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      const img = gameObject as Phaser.GameObjects.Image;
      const objectId = img.getData('itemId') as ObjectItemId | undefined;
      if (!objectId || objectId !== this.draggingObjectId) return;

      this.leftObjects.forEach((i) => i.setScale(this.currentItemScale));
      this.rightObjects.forEach((i) => i.setScale(this.currentItemScale));

      const target = this.getShapeAt(pointer.x, pointer.y);
      if (!target) {
        // SDK: Abandoned attempt
        const ts = Date.now();
        // Calculate length from object center to release point
        const len = Math.round(Phaser.Math.Distance.Between(img.x, img.y, pointer.x, pointer.y));

        this.matchTracker?.onMatchEnd?.(
          { from_node: objectId, to_node: null, path_length_px: len },
          ts,
          { isCorrect: false, errorCode: "USER_ABANDONED" }
        );

        // Log attempt details for user verification
        console.log('Match Attempt (Abandoned):', JSON.stringify({
          response: { from_node: objectId, to_node: null, path_length_px: len },
          is_correct: false,
          error_code: "USER_ABANDONED",
          hint_used: 0
        }, null, 2));

        this.draggingObjectId = undefined;
        this.draggingKey = undefined;
        this.draggingObject = undefined;
        this.dragLineEnd = undefined;
        this.draggingLine?.setVisible(false);
        this.gameState = 'INTRO';
        this.redrawConnections();
        return;
      }

      this.checkMatch(img, target);
    });
  }

  private getShapeAt(x: number, y: number) {
    for (const img of this.shapeItems) {
      if (img.getBounds().contains(x, y)) return img;
    }
    return undefined;
  }

  private buildBalancedObjectColumns(): { leftIds: ObjectItemId[]; rightIds: ObjectItemId[] } {
    const leftIds: ObjectItemId[] = ['OBJ_CLOCK', 'OBJ_FLAG', 'OBJ_RING', 'OBJ_WARNING', 'OBJ_POSTCARD'];
    const rightIds: ObjectItemId[] = ['OBJ_TILE', 'OBJ_SETSQUARE', 'OBJ_PLATE', 'OBJ_GIFT', 'OBJ_LANDSCAPE'];

    return {
      leftIds: leftIds,
      rightIds: rightIds,
    };
  }



  /* ===================== LAYOUT ===================== */

  private layoutScene() {
    const { width, height } = this.scale;
    const centerX = width / 2;

    const bannerMaxW = width * BANNER_MAX_W_RATIO;
    const bannerMaxH = Math.max(90, height * 0.25); // Tăng chiều cao tối đa (cao thêm)
    const bannerTex = this.textures.get(this.questionBanner.texture.key);
    const bannerSrc = bannerTex?.getSourceImage() as { width: number; height: number } | undefined;
    const bannerSrcW = bannerSrc?.width ?? this.questionBanner.width ?? 1;
    const bannerSrcH = bannerSrc?.height ?? this.questionBanner.height ?? 1;
    const bannerScaleX = Math.min(1.0, bannerMaxW / Math.max(1, bannerSrcW));
    const bannerScaleY = Math.min(BANNER_SCALE, bannerMaxH / Math.max(1, bannerSrcH));

    this.questionBanner.setScale(bannerScaleX, bannerScaleY);

    const topPadding = Math.max(22, height * 0.02);
    const bannerY = Math.max(BANNER_Y, topPadding + this.questionBanner.displayHeight / 2);
    this.questionBanner.setPosition(Math.round(centerX), Math.round(bannerY));
    this.promptText.setPosition(this.questionBanner.x, this.questionBanner.y);
    this.promptImage?.setPosition(this.questionBanner.x, this.questionBanner.y);

    const bottomEdge = height;
    const feedbackY = bottomEdge - FEEDBACK_BOTTOM_MARGIN;
    this.feedbackText.setPosition(Math.round(centerX), Math.round(feedbackY));

    const itemsTop =
      this.questionBanner.y +
      this.questionBanner.displayHeight / 2 +
      Math.max(ITEMS_GAP_FROM_BANNER, height * 0.008) +
      ITEMS_SHIFT_FROM_BANNER;
    const itemsBottom =
      feedbackY - this.feedbackText.displayHeight / 2 - Math.max(ITEMS_GAP_FROM_FEEDBACK, height * 0.015);
    const safeItemsBottom = Math.max(itemsTop + 1, itemsBottom);

    const maxSrcH = Math.max(
      1,
      ...this.leftObjects.map((i) => i.height ?? 0),
      ...this.rightObjects.map((i) => i.height ?? 0),
      ...this.shapeItems.map((i) => i.height ?? 0),
    );
    const maxSrcW = Math.max(
      1,
      ...this.leftObjects.map((i) => i.width ?? 0),
      ...this.rightObjects.map((i) => i.width ?? 0),
      ...this.shapeItems.map((i) => i.width ?? 0),
    );

    if (this.itemsBoard && this.itemsBoard.scene) {
      // Make the board wrap all items (no overflow), within the available area.
      const maxBoardW = width * 1.0; // Thu nhỏ chiều ngang board (trước là 1.0)
      const maxBoardH = Math.max(1, safeItemsBottom - itemsTop);

      const maxInnerW = Math.max(1, maxBoardW - ITEMS_BOARD_PAD_X * 2);
      const maxInnerH = Math.max(1, maxBoardH - ITEMS_BOARD_PAD_Y * 2);

      // 1) Decide item scale to fit within maxInnerW/maxInnerH.
      const count = Math.max(this.shapeItems.length, this.leftObjects.length, this.rightObjects.length);
      const heightDivisor = (count > 1 ? (count - 1) / ITEM_FILL_RATIO : 0) + 1;
      const maxAllowedItemH = Math.max(46, maxInnerH / heightDivisor);
      const scaleByHeight = maxAllowedItemH / maxSrcH;

      // 3 columns: objects (left/right) and shapes (middle)
      let columnGap = Math.min(COLUMN_GAP_MAX, Math.max(COLUMN_GAP_MIN, maxInnerW * COLUMN_GAP_RATIO));
      let scaleByWidth = (maxInnerW - columnGap * 2) / maxSrcW;

      this.currentItemScale = Math.min(ITEM_SCALE, scaleByHeight, scaleByWidth);
      const maxItemW = maxSrcW * this.currentItemScale;
      if (columnGap * 2 + maxItemW > maxInnerW) {
        columnGap = Math.max(COLUMN_GAP_MIN, (maxInnerW - maxItemW) / 2);
        scaleByWidth = (maxInnerW - columnGap * 2) / maxSrcW;
        this.currentItemScale = Math.min(ITEM_SCALE, scaleByHeight, scaleByWidth);
      }
      this.leftObjects.forEach((i) => i.setScale(this.currentItemScale));
      this.rightObjects.forEach((i) => i.setScale(this.currentItemScale));
      this.shapeItems.forEach((i) => i.setScale(this.currentItemScale));

      // 2) Layout items inside the available vertical span first.
      const boardY = (itemsTop + safeItemsBottom) / 2;
      const maxItemH = maxSrcH * this.currentItemScale;
      const centersSpan = Math.max(1, maxInnerH - maxItemH);
      const innerTop = boardY - centersSpan / 2;
      const innerBottom = boardY + centersSpan / 2;
      const objectYPositions = this.getYPositions(Math.max(this.leftObjects.length, this.rightObjects.length), innerTop, innerBottom);
      let shapeYPositions = this.getYPositions(this.shapeItems.length, innerTop, innerBottom);

      // Áp dụng khoảng cách dọc cụ thể cho các item hình (cột giữa)
      if (this.shapeItems.length > 1) {
        const currentSpan = shapeYPositions[shapeYPositions.length - 1] - shapeYPositions[0];
        const newSpan = currentSpan * SHAPE_VERTICAL_SPACING_FACTOR;
        const startOffset = (currentSpan - newSpan) / 2;

        const newTop = shapeYPositions[0] + startOffset;
        const newBottom = shapeYPositions[shapeYPositions.length - 1] - startOffset;
        shapeYPositions = this.getYPositions(this.shapeItems.length, newTop, newBottom);
      }

      const leftX = centerX - columnGap;
      const midX = centerX;
      const rightX = centerX + columnGap;

      for (let i = 0; i < this.shapeItems.length; i++) {
        this.shapeItems[i].setPosition(midX, shapeYPositions[i] ?? boardY);
      }
      for (let i = 0; i < this.leftObjects.length; i++) {
        this.leftObjects[i].setPosition(leftX, objectYPositions[i] ?? boardY);
      }
      for (let i = 0; i < this.rightObjects.length; i++) {
        this.rightObjects[i].setPosition(rightX, objectYPositions[i] ?? boardY);
      }

      // 3) Resize the board to cover all items with padding.
      let bounds: Phaser.Geom.Rectangle | undefined;
      const all = [...this.leftObjects, ...this.rightObjects, ...this.shapeItems];
      const first = all[0];
      if (first) {
        bounds = first.getBounds();
        for (let i = 1; i < all.length; i++) {
          const b = all[i].getBounds();
          Phaser.Geom.Rectangle.Union(bounds, b, bounds);
        }
      }

      const fallbackW = Math.min(maxBoardW, maxInnerW + ITEMS_BOARD_PAD_X * 2);
      const fallbackH = Math.min(maxBoardH, maxInnerH + ITEMS_BOARD_PAD_Y * 2);
      const boardW = Math.min(maxBoardW, (bounds?.width ?? fallbackW) + ITEMS_BOARD_PAD_X * 2);
      const boardH = Math.min(maxBoardH, (bounds?.height ?? fallbackH) + ITEMS_BOARD_PAD_Y * 2 + ITEMS_BOARD_EXTRA_H);
      const boardX = bounds?.centerX ?? centerX;
      this.itemsBoard
        .setPosition(Math.round(boardX), Math.round(boardY))
        .setDisplaySize(Math.round(boardW), Math.round(boardH));

      // Board stays centered (no side character).
    } else {
      const count = Math.max(this.shapeItems.length, this.leftObjects.length, this.rightObjects.length);
      const objectYPositions = this.getYPositions(Math.max(this.leftObjects.length, this.rightObjects.length), itemsTop, safeItemsBottom);
      const shapeYPositions = this.getYPositions(this.shapeItems.length, itemsTop, safeItemsBottom);

      const span = Math.max(1, safeItemsBottom - itemsTop);
      const gap = count > 1 ? span / (count - 1) : span;
      const maxAllowedItemH = Math.max(46, gap * ITEM_FILL_RATIO);

      const columnGap = Math.min(COLUMN_GAP_MAX, Math.max(COLUMN_GAP_MIN, width * COLUMN_GAP_RATIO));
      const leftX = centerX - columnGap;
      const midX = centerX;
      const rightX = centerX + columnGap;
      const maxAllowedItemW = Math.max(60, (columnGap * 2) * 0.42);

      this.currentItemScale = Math.min(ITEM_SCALE, maxAllowedItemH / maxSrcH, maxAllowedItemW / maxSrcW);
      this.leftObjects.forEach((i) => i.setScale(this.currentItemScale));
      this.rightObjects.forEach((i) => i.setScale(this.currentItemScale));
      this.shapeItems.forEach((i) => i.setScale(this.currentItemScale));

      for (let i = 0; i < this.shapeItems.length; i++) {
        this.shapeItems[i].setPosition(midX, shapeYPositions[i] ?? 0);
      }
      for (let i = 0; i < this.leftObjects.length; i++) {
        this.leftObjects[i].setPosition(leftX, objectYPositions[i] ?? 0);
      }
      for (let i = 0; i < this.rightObjects.length; i++) {
        this.rightObjects[i].setPosition(rightX, objectYPositions[i] ?? 0);
      }
    }

    // Keep guide aligned after resize/layout changes.
    this.refreshGuideHand(true);

    this.updateHintForRound();
    this.redrawConnections();
  }

  private getYPositions(count: number, top: number, bottom: number) {
    const safeTop = Math.min(top, bottom);
    const safeBottom = Math.max(top, bottom);
    const centerY = (safeTop + safeBottom) / 2;
    if (count <= 1) return [Math.round(centerY)];

    const gap = (safeBottom - safeTop) / (count - 1);
    return Array.from({ length: count }, (_, i) => safeTop + gap * i);
  }

  /* ===================== START ROUND ===================== */

  private shapeIdFromMatchKey(k: MatchKey): ShapeItemId {
    switch (k) {
      case "CIRCLE": return "SHAPE_CIRCLE";
      case "SQUARE": return "SHAPE_SQUARE";
      case "TRIANGLE": return "SHAPE_TRIANGLE";
      case "RECTANGLE": return "SHAPE_RECTANGLE";
    }
  }

  private startRound() {
    this.updateHintForRound();
    this.resetUiForNewTry();

    // ===== SDK ITEMS: tạo 1 item match cho cả màn =====
    this.itemSeq += 1;

    const nodes = [...OBJECT_IDS, ...SHAPE_IDS];

    // correct_pairs: objectId -> shapeId tương ứng
    const correct_pairs = OBJECT_IDS.map((objId) => ({
      from: objId,
      to: this.shapeIdFromMatchKey(OBJECT_MATCH_KEY[objId]),
    }));

    if (this.matchTracker && typeof this.matchTracker.finalize === 'function') {
      try { this.matchTracker.finalize(); } catch { }
    }

    this.matchTracker = createMatchTracker({
      meta: {
        item_id: `CONNECT_PAIRS_${this.itemSeq}`,
        item_type: "match",
        seq: this.itemSeq,
        run_seq: this.isReplay ? this.runSeq + 1 : this.runSeq,
        difficulty: 1,
        scene_id: "SCN_MATCH_01",
        scene_seq: this.itemSeq,
        scene_type: "match",
        skill_ids: ["noi_cap_34_tv_001"],
      },
      expected: {
        nodes,
        correct_pairs,
      },
      errorOnWrong: "WRONG_PAIR",
    });

    if (this.isReplay) this.runSeq++;

    irukaGame.startQuestionTimer?.();
    this.playInstructionVoice();
    this.gameState = 'INTRO';
    this.lastInteractionAtMs = this.time.now;

    this.cancelGuideHandSchedule();
    // Hiển thị bàn tay hướng dẫn ngay khi vào game (Lần đầu: KHÔNG tính hint)
    // Delay nhẹ để tránh bị tắt ngay do click unlock audio hoặc input thừa
    this.time.delayedCall(500, () => {
      if (this.gameState === 'INTRO') {
        this.startGuideHand(true); // true = isInitial (không tính hint)
      }
    });
    // Sau đó lặp lại theo chu kỳ không thao tác
    this.scheduleGuideHand(GUIDE_HAND_INACTIVITY_MS);
  }

  private noteInteraction() {
    this.lastInteractionAtMs = this.time.now;

    this.cancelGuideHandSchedule();
    this.destroyGuideHand();
    this.scheduleGuideHand(GUIDE_HAND_INACTIVITY_MS);
  }

  private scheduleGuideHand(delayMs = GUIDE_HAND_INACTIVITY_MS) {
    if (!this.textures.exists(GUIDE_HAND_KEY)) return;

    this.cancelGuideHandSchedule();
    this.guideHandTimer = this.time.delayedCall(delayMs, () => {
      if (!this.scene.isActive()) return;
      // When using the inactivity delay, ensure the full window has elapsed since last interaction.
      if (delayMs >= GUIDE_HAND_INACTIVITY_MS && this.time.now - this.lastInteractionAtMs < GUIDE_HAND_INACTIVITY_MS) return;
      if (this.gameState !== 'INTRO') return;
      if (this.draggingKey) return;
      this.startGuideHand(false); // Inactivity -> Tính hint
    });
  }

  private startGuideHand(isInitial = false) {
    if (!this.textures.exists(GUIDE_HAND_KEY)) return;

    const objectImg = [...this.leftObjects, ...this.rightObjects].find((i) => {
      const id = i.getData('itemId') as ObjectItemId | undefined;
      return !!id && !this.matchedObjects.has(id);
    });
    if (!objectImg) return;

    const objectId = objectImg.getData('itemId') as ObjectItemId | undefined;
    const matchKey = objectImg.getData('matchKey') as MatchKey | undefined;
    if (!objectId || !matchKey) return;

    const shapeImg = this.shapeItems.find((i) => i.getData('matchKey') === matchKey);
    if (!shapeImg) return;

    // Chỉ tính hint nếu KHÔNG phải lần đầu tiên (isInitial = false)
    if (!isInitial) {
      irukaGame.addHint?.();
      // Hint xuất hiện -> chưa mở attempt ngay, nên tăng pendingHint
      this.pendingHint += 1;
    }

    this.guideHandObjectId = objectId;

    const baseScale = (this.scale.height / 720) * GUIDE_HAND_SCALE;
    const scale = Math.min(1.1, Math.max(0.35, baseScale));

    if (!this.guideHand) {
      this.guideHand = this.add.image(0, 0, GUIDE_HAND_KEY).setOrigin(0.2, 0.15).setDepth(GUIDE_HAND_DEPTH);
    } else {
      this.guideHand.setTexture(GUIDE_HAND_KEY).setVisible(true);
    }

    this.guideHand.setAlpha(0.95).setScale(scale).setAngle(-8);
    this.refreshGuideHand(true);
  }

  private refreshGuideHand(restartTween = false) {
    if (!this.guideHand || !this.guideHandObjectId) return;
    const objectId = this.guideHandObjectId;

    const objectImg = [...this.leftObjects, ...this.rightObjects].find((i) => i.getData('itemId') === objectId);
    if (!objectImg) return;

    const matchKey = objectImg.getData('matchKey') as MatchKey | undefined;
    if (!matchKey) return;

    const shapeImg = this.shapeItems.find((i) => i.getData('matchKey') === matchKey);
    if (!shapeImg) return;

    const start = this.getAnchorWorldPoint(objectImg, shapeImg.x, shapeImg.y);
    const end = this.getAnchorWorldPoint(shapeImg, objectImg.x, objectImg.y);

    const s = this.guideHand.scaleX;
    const startX = start.x + GUIDE_HAND_OFFSET_X * s;
    const startY = start.y + GUIDE_HAND_OFFSET_Y * s;
    const endX = end.x + GUIDE_HAND_OFFSET_X * s;
    const endY = end.y + GUIDE_HAND_OFFSET_Y * s;
    const dx = endX - startX;
    const dy = endY - startY;
    const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const ux = dx / d;
    const uy = dy / d;
    const startXDeep = startX - ux * GUIDE_HAND_START_DEEPEN_DIST * s;
    const startYDeep = startY - uy * GUIDE_HAND_START_DEEPEN_DIST * s;
    const endXDeep = endX + ux * GUIDE_HAND_END_DEEPEN_DIST * s;
    const endYDeep = endY + uy * GUIDE_HAND_END_DEEPEN_DIST * s;

    if (restartTween) {
      this.guideHandSeqId++;
      this.guideHandTween?.stop();
      this.guideHandTween = undefined;
    }

    this.guideHand.setPosition(startX, startY).setVisible(true);

    if (this.guideHandTween) return;

    const seqId = ++this.guideHandSeqId;
    const hand = this.guideHand;
    const baseScale = hand.scaleX;
    const tapScale = baseScale * GUIDE_HAND_TAP_SCALE;
    const tapDy = GUIDE_HAND_TAP_DY * baseScale;

    const playCycle = () => {
      if (!this.guideHand || this.guideHand !== hand) return;
      if (seqId !== this.guideHandSeqId) return;

      hand.setPosition(startXDeep, startYDeep).setAngle(-8).setVisible(true);

      const tapLeftDown = (onDone: () => void) => {
        if (seqId !== this.guideHandSeqId) return;
        this.guideHandTween = this.tweens.add({
          targets: hand,
          x: startXDeep,
          scaleX: tapScale,
          scaleY: tapScale,
          y: startYDeep + tapDy,
          angle: -12,
          duration: GUIDE_HAND_TAP_MS,
          ease: 'Sine.out',
          onComplete: () => tapLeftUp(onDone),
        });
      };

      const tapLeftUp = (onDone: () => void) => {
        if (seqId !== this.guideHandSeqId) return;
        this.guideHandTween = this.tweens.add({
          targets: hand,
          x: startXDeep,
          scaleX: baseScale,
          scaleY: baseScale,
          y: startYDeep,
          angle: -8,
          duration: GUIDE_HAND_TAP_MS,
          ease: 'Sine.in',
          onComplete: onDone,
        });
      };

      const tapStartDown = () => {
        tapLeftDown(dragToEnd);
      };

      const dragToEnd = () => {
        if (seqId !== this.guideHandSeqId) return;
        this.guideHandTween = this.tweens.add({
          targets: hand,
          x: endXDeep,
          y: endYDeep,
          angle: -4,
          duration: GUIDE_HAND_DRAG_MS,
          ease: 'Sine.inOut',
          onComplete: tapEndDown,
        });
      };

      const tapEndDown = () => {
        if (seqId !== this.guideHandSeqId) return;
        this.guideHandTween = this.tweens.add({
          targets: hand,
          scaleX: tapScale,
          scaleY: tapScale,
          y: endYDeep + tapDy,
          angle: -10,
          duration: GUIDE_HAND_TAP_MS,
          ease: 'Sine.out',
          onComplete: tapEndUp,
        });
      };

      const tapEndUp = () => {
        if (seqId !== this.guideHandSeqId) return;
        this.guideHandTween = this.tweens.add({
          targets: hand,
          scaleX: baseScale,
          scaleY: baseScale,
          y: endYDeep,
          angle: -8,
          duration: GUIDE_HAND_TAP_MS,
          ease: 'Sine.in',
          onComplete: pauseThenDragBack,
        });
      };

      const pauseThenDragBack = () => {
        if (seqId !== this.guideHandSeqId) return;
        this.guideHandTween = this.tweens.add({
          targets: hand,
          duration: GUIDE_HAND_PAUSE_MS,
          onComplete: dragBackToStart,
        });
      };

      const dragBackToStart = () => {
        if (seqId !== this.guideHandSeqId) return;
        this.guideHandTween = this.tweens.add({
          targets: hand,
          x: startXDeep,
          y: startYDeep,
          angle: -8,
          duration: GUIDE_HAND_RETURN_MS,
          ease: 'Sine.inOut',
          onComplete: tapLeftAfterReturn,
        });
      };

      const tapLeftAfterReturn = () => {
        tapLeftDown(() => tapLeftUp(pauseThenRestart));
      };

      const pauseThenRestart = () => {
        if (seqId !== this.guideHandSeqId) return;
        this.guideHandTween = this.tweens.add({
          targets: hand,
          duration: GUIDE_HAND_PAUSE_MS,
          onComplete: dragToEnd,
        });
      };

      tapStartDown();
    };

    playCycle();
  }

  private destroyGuideHand() {
    this.guideHandSeqId++;
    this.guideHandTween?.stop();
    this.guideHandTween = undefined;
    this.guideHandObjectId = undefined;
    this.guideHand?.destroy();
    this.guideHand = undefined;
  }

  private cancelGuideHandSchedule() {
    if (!this.guideHandTimer) return;
    this.time.removeEvent(this.guideHandTimer);
    this.guideHandTimer = undefined;
  }

  private updateHintForRound() {
    if (this.promptImage && !(this.promptImage.scene as unknown as { sys?: unknown })?.sys) {
      this.promptImage = undefined;
    }

    if (this.textures.exists(HINT_IMG_KEY)) {
      this.promptText.setVisible(false);

      if (!this.promptImage) {
        this.promptImage = this.add
          .image(this.questionBanner.x, this.questionBanner.y, HINT_IMG_KEY)
          .setOrigin(0.5)
          .setDepth(this.promptText.depth + 1);
      } else {
        this.promptImage.setTexture(HINT_IMG_KEY).setVisible(true);
      }

      const bannerW = Math.max(1, this.questionBanner.displayWidth);
      const bannerH = Math.max(1, this.questionBanner.displayHeight);
      const imgW = Math.max(1, this.promptImage.width);
      const imgH = Math.max(1, this.promptImage.height);
      const scale = Math.min((bannerW * 0.86) / imgW, (bannerH * 0.8) / imgH) * 0.92;

      this.promptImage.setPosition(this.questionBanner.x, this.questionBanner.y).setScale(scale);
      return;
    }

    this.promptImage?.setVisible(false);
    this.promptText.setVisible(true).setText(BANNER_TITLE);
  }

  /* ===================== RESET ===================== */

  private resetUiForNewTry() {
    this.feedbackText.setText('');
    this.draggingObjectId = undefined;
    this.draggingKey = undefined;
    this.draggingObject = undefined;
    this.dragLineEnd = undefined;
    this.draggingLine?.setVisible(false);
    this.wrongLine?.setVisible(false);
    this.wrongLineSeg = undefined;

    for (const img of [...this.leftObjects, ...this.rightObjects]) {
      const objectId = img.getData('itemId') as ObjectItemId | undefined;
      img.setAlpha(objectId && this.matchedObjects.has(objectId) ? 0.9 : 1);
    }
    this.redrawConnections();
  }

  /* ===================== MATCH ===================== */

  private checkMatch(objectImg: Phaser.GameObjects.Image, shapeImg: Phaser.GameObjects.Image) {
    if (this.gameState === 'LEVEL_END') return;
    this.gameState = 'CHECKING';
    this.destroyGuideHand();

    const objectId = objectImg.getData('itemId') as ObjectItemId | undefined;
    const objectKey = objectImg.getData('matchKey') as MatchKey | undefined;
    const shapeKey = shapeImg.getData('matchKey') as MatchKey | undefined;
    if (!objectId || !objectKey || !shapeKey) return;
    if (this.matchedObjects.has(objectId)) return;

    if (objectKey === shapeKey) {
      // Phát âm thanh đúng và voice đúng
      AudioManager.play('sfx_correct');
      AudioManager.playCorrectAnswer();
      AudioManager.playWhenReady?.('voice_correct');

      this.matchedObjects.add(objectId);
      this.score = this.matchedObjects.size;

      irukaGame.finishQuestionTimer?.();
      irukaGame.recordCorrect?.({ scoreDelta: 1 });

      (window as any).irukaGameState.currentScore = this.score;
      sdk.score(this.score, 1);
      sdk.progress({
        levelIndex: this.matchedObjects.size,
        score: this.score,
      });

      objectImg.disableInteractive().setAlpha(0.9);

      // Vẽ line cố định khi nối đúng
      const start = this.getAnchorWorldPoint(objectImg, shapeImg.x, shapeImg.y);
      const end = this.getAnchorWorldPoint(shapeImg, objectImg.x, objectImg.y);
      const len = Math.round(Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y));

      // SDK: Match Correct
      const ts = Date.now();
      const toNode = (shapeImg.getData("itemId") as ShapeItemId) ?? this.shapeIdFromMatchKey(shapeKey);

      this.matchTracker?.onMatchEnd?.(
        { from_node: objectId, to_node: toNode, path_length_px: len },
        ts,
        { isCorrect: true, errorCode: null }
      );

      // Log attempt details for user verification (Example #10 format)
      console.log('Match Attempt (Correct):', JSON.stringify({
        response: { from_node: objectId, to_node: toNode, path_length_px: len },
        is_correct: true,
        error_code: null,
        hint_used: 0 // Note: Hint count is managed internally by tracker
      }, null, 2));

      const line = drawBlackLine(this, start.x, start.y, end.x, end.y);
      line.setDepth(LINE_DEPTH);
      this.matchedLines.set(objectId, line);

      // Ẩn line kéo
      this.draggingLine?.setVisible(false);
      this.draggingObjectId = undefined;
      this.draggingKey = undefined;
      this.draggingObject = undefined;
      this.dragLineEnd = undefined;
      this.wrongLine?.setVisible(false);
      this.redrawConnections();

      if (this.matchedObjects.size >= OBJECT_IDS.length) {
        this.gameState = 'LEVEL_END';

        // SDK: Finalize
        this.matchTracker?.finalize?.();
        this.matchTracker = null;

        irukaGame.finalizeAttempt();
        this.time.delayedCall(1000, () => {
          this.scene.start('EndGameScene', {
            lessonId: '',
            score: this.score,
            total: OBJECT_IDS.length,
            startTime: (window as any).irukaGameState?.startTime,
          });
        });
        return;
      }

      this.time.delayedCall(450, () => {
        if (!this.scene.isActive()) return;
        this.gameState = 'INTRO';
        irukaGame.startQuestionTimer?.(); // Bắt đầu timer cho cặp tiếp theo
      });
      return;
    }

    // Phát âm thanh sai và voice sai
    AudioManager.play('sfx_wrong');
    AudioManager.playWhenReady?.('voice_wrong');
    irukaGame.recordWrong?.();

    // SDK: Match Wrong
    const ts = Date.now();
    const toNode = (shapeImg.getData("itemId") as ShapeItemId) ?? this.shapeIdFromMatchKey(shapeKey);
    const start = this.getAnchorWorldPoint(objectImg, shapeImg.x, shapeImg.y);
    const end = this.getAnchorWorldPoint(shapeImg, objectImg.x, objectImg.y);
    const len = Math.round(Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y));

    this.matchTracker?.onMatchEnd?.(
      { from_node: objectId, to_node: toNode, path_length_px: len },
      ts,
      { isCorrect: false, errorCode: "WRONG_PAIR" }
    );

    // Log attempt details for user verification (Example #10 format)
    console.log('Match Attempt (Wrong):', JSON.stringify({
      response: { from_node: objectId, to_node: toNode, path_length_px: len },
      is_correct: false,
      error_code: "WRONG_PAIR",
      hint_used: 0
    }, null, 2));

    this.draggingLine?.setVisible(false);

    if (!this.wrongLine) {
      this.wrongLine = drawBlackLine(this, 0, 0, 0, 0);
      this.wrongLine.setDepth(LINE_DEPTH);
    }
    this.wrongLine.setVisible(true).setAlpha(0.95);

    // reused start/end from above
    const x1 = start.x;
    const y1 = start.y;
    const x2 = end.x;
    const y2 = end.y;
    this.wrongLineSeg = { x1, y1, x2, y2 };
    // Không cần updateLineSprite cho Graphics, redrawConnections sẽ tự vẽ lại

    this.draggingObjectId = undefined;
    this.draggingKey = undefined;
    this.draggingObject = undefined;
    this.dragLineEnd = undefined;
    this.redrawConnections();
    // Không cần animateWrong cho Graphics

    this.time.delayedCall(650, () => {
      if (!this.scene.isActive()) return;
      this.wrongLine?.setVisible(false);
      this.wrongLineSeg = undefined;
      this.gameState = 'INTRO';
      this.redrawConnections();

      // Sai -> Hiện tay hướng dẫn luôn (tính là hint)
      this.startGuideHand(false);
      this.scheduleGuideHand(GUIDE_HAND_INACTIVITY_MS);
    });
  }



  private redrawConnections() {
    // Xóa tất cả graphics cũ trước khi vẽ lại
    for (const [, line] of this.matchedLines) {
      line.clear();
    }
    this.draggingLine?.clear();
    this.wrongLine?.clear();

    // Chỉ vẽ các line đã nối đúng (matchedLines)
    for (const [objectId, line] of this.matchedLines) {
      const objectImg = [...this.leftObjects, ...this.rightObjects].find((i) => i.getData('itemId') === objectId);
      if (!objectImg) continue;
      const matchKey = objectImg.getData('matchKey') as MatchKey | undefined;
      if (!matchKey) continue;
      const shapeImg = this.shapeItems.find((i) => i.getData('matchKey') === matchKey);
      if (!shapeImg) continue;

      const start = this.getAnchorWorldPoint(objectImg, shapeImg.x, shapeImg.y);
      const end = this.getAnchorWorldPoint(shapeImg, objectImg.x, objectImg.y);
      line.lineStyle(4, 0x000000, 1);
      line.beginPath();
      line.moveTo(start.x, start.y);
      line.lineTo(end.x, end.y);
      line.strokePath();
      line.closePath();
      line.setVisible(true).setAlpha(1);
    }

    // Vẽ line kéo (dây cao su) khi đang kéo
    if (this.gameState === 'DRAGGING' && this.draggingObject && this.dragLineEnd && this.draggingLine) {
      const shapeTarget = this.draggingKey
        ? this.shapeItems.find((i) => i.getData('matchKey') === this.draggingKey)
        : undefined;
      const towardX = shapeTarget?.x ?? this.dragLineEnd.x;
      const towardY = shapeTarget?.y ?? this.dragLineEnd.y;
      const start = this.getAnchorWorldPoint(this.draggingObject, towardX, towardY);
      this.draggingLine.lineStyle(4, 0x000000, 1);
      this.draggingLine.beginPath();
      this.draggingLine.moveTo(start.x, start.y);
      this.draggingLine.lineTo(this.dragLineEnd.x, this.dragLineEnd.y);
      this.draggingLine.strokePath();
      this.draggingLine.closePath();
      this.draggingLine.setVisible(true).setAlpha(0.85);
    } else {
      this.draggingLine?.setVisible(false);
    }

    // Vẽ line sai nếu có
    if (this.wrongLine?.visible && this.wrongLineSeg) {
      this.wrongLine.lineStyle(4, 0xff0000, 1);
      this.wrongLine.beginPath();
      this.wrongLine.moveTo(this.wrongLineSeg.x1, this.wrongLineSeg.y1);
      this.wrongLine.lineTo(this.wrongLineSeg.x2, this.wrongLineSeg.y2);
      this.wrongLine.strokePath();
      this.wrongLine.closePath();
    }
  }


  private getAnchorWorldPoint(img: Phaser.GameObjects.Image, towardX: number, towardY: number) {
    const cx = img.x;
    const cy = img.y;

    const dx = towardX - cx;
    const dy = towardY - cy;

    const len = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy));
    const ux = dx / len;
    const uy = dy / len;


    const cross = (x1: number, y1: number, x2: number, y2: number) => x1 * y2 - y1 * x2;

    const role = img.getData('role') as 'SHAPE' | 'OBJECT' | undefined;
    const matchKey = img.getData('matchKey') as MatchKey | undefined;
    const itemId = img.getData('itemId') as ItemId | undefined;

    let shapeInset: number;

    // Custom insets for specific items that appear to have less transparent padding.
    // A smaller inset brings the anchor point closer to the bounding box edge.
    switch (itemId) {
      case 'OBJ_CLOCK':
        shapeInset = 4; // Use a negative inset to push the anchor point outside the bounding box.
        break;
      case 'OBJ_WARNING':
        shapeInset = -4; // Pushed out slightly
        break;
      case 'OBJ_SETSQUARE':
        shapeInset = 5; // Pushed out more for ruler
        break;
      case 'SHAPE_CIRCLE':
        shapeInset = 0; // Set to 0 for perfect edge calc
        break;
      case 'SHAPE_TRIANGLE':
        shapeInset = 0; // Set to 0 for perfect edge calc
        break;
      case 'OBJ_GIFT':
      case 'OBJ_LANDSCAPE':
        shapeInset = 2; // Use a small, fixed inset value
        break;
      default:
        // Default inset logic for other items
        shapeInset = role === 'OBJECT' ? Math.max(1, LINE_THICKNESS * 0.35) : Math.max(1, LINE_THICKNESS * 0.15);
        break;
    }

    const halfW = Math.max(1, img.displayWidth / 2 - shapeInset);
    const halfH = Math.max(1, img.displayHeight / 2 - shapeInset);

    const intersectTriangle = (w: number, h: number) => {
      // Triangle with vertices (0,-h), (-w,h), (w,h) relative to image center
      const ax = 0, ay = -h;
      const bx = -w, by = h;
      const cxp = w, cyp = h;

      const tryEdge = (ex1: number, ey1: number, ex2: number, ey2: number) => {
        const sx = ex2 - ex1;
        const sy = ey2 - ey1;
        const denom = cross(dx, dy, sx, sy);
        if (Math.abs(denom) < 1e-6) return undefined;

        const qpx = ex1;
        const qpy = ey1;
        const t = cross(qpx, qpy, sx, sy) / denom;
        const u = cross(qpx, qpy, dx, dy) / denom;
        if (t >= 0 && u >= 0 && u <= 1) return { t, u, ex1, ey1, ex2, ey2 };
        return undefined;
      };

      const hits = [tryEdge(ax, ay, bx, by), tryEdge(bx, by, cxp, cyp), tryEdge(cxp, cyp, ax, ay)].filter(
        (h): h is NonNullable<ReturnType<typeof tryEdge>> => !!h && Number.isFinite(h.t) && Number.isFinite(h.u),
      );

      if (hits.length > 0) {
        hits.sort((a, b) => a.t - b.t);
        const hit = hits[0];

        // Always connect to the middle of the edge.
        const uClamped = 0.5;
        const sx = hit.ex2 - hit.ex1;
        const sy = hit.ey2 - hit.ey1;
        return { x: cx + hit.ex1 + sx * uClamped, y: cy + hit.ey1 + sy * uClamped };
      }

      // Fallback for triangle: center of facing edge of bounding box
      const x = towardX >= cx ? cx + w : cx - w;
      return { x, y: cy };
    };

    if (matchKey === 'TRIANGLE') {
      return intersectTriangle(halfW, halfH);
    }

    if (matchKey === 'CIRCLE' && itemId !== 'OBJ_CLOCK') {
      const r = Math.max(1, Math.min(img.displayWidth, img.displayHeight) / 2 - shapeInset);
      return { x: cx + ux * r, y: cy + uy * r };
    }

    // Default for SQUARE, RECTANGLE, OBJ_CLOCK, and other objects:
    // Connect to the vertical center of the facing edge, respecting the inset.
    const x = towardX >= cx ? cx + halfW : cx - halfW;
    return { x, y: cy };
  }
}
