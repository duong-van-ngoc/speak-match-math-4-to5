import Phaser from 'phaser';
import AudioManager from './AudioManager';
import { sdk } from './main';
import { game as irukaGame } from '@iruka-edu/mini-game-sdk';

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

const CONNECT_LINE_KEY = 'connect_line_v6';
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

const ITEM_SCALE = 3.2;
const LINE_THICKNESS = 12;
const LINE_END_EXTEND = 5;
const LINE_DRAG_START_EXTEND = 10;
const ITEM_FILL_RATIO = 0.94;
const ITEMS_SHIFT_FROM_BANNER = 0;

/* ===================== CONNECTION ANCHOR ===================== */

// Lỗ tròn (tính theo pixel của ảnh gốc).
// Left column (HAND/FEET): Left=63, Top=126, W/H=40 (rotation -180° doesn't matter because we do not rotate the sprite)
// Right column (GLOVE/SHOE): Left=472, Top=126, W/H=40

/* ===================== LAYOUT ===================== */

const BANNER_Y = 42;
const BANNER_SCALE = 0.5;
const BANNER_MAX_W_RATIO = 0.7;

const PROMPT_FONT_SIZE = 30;
const FEEDBACK_FONT_SIZE = 22;
const FEEDBACK_BOTTOM_MARGIN = 0;

const ITEMS_GAP_FROM_BANNER = 2;
const ITEMS_GAP_FROM_FEEDBACK = 2;

const COLUMN_GAP_RATIO = 0.28;
const COLUMN_GAP_MIN = 120;
const COLUMN_GAP_MAX = 520;

const ITEMS_BOARD_PAD_X = 18;
const ITEMS_BOARD_PAD_Y = 10;
const ITEMS_BOARD_EXTRA_H = 100;
const ITEMS_BOARD_DEPTH = 4;

const ITEM_DEPTH = 5;
const LINE_DEPTH = 6;
const LINE_CAP_RADIUS = Math.max(3, LINE_THICKNESS * 0.55);
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
const GUIDE_HAND_INACTIVITY_MS = 5000;

/* ===================== SCENE ===================== */

export default class GameScene extends Phaser.Scene {
  public score = 0;

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
  private matchedLines = new Map<ObjectItemId, Phaser.GameObjects.Image>();
  private lineCaps = new Map<Phaser.GameObjects.Image, { start: Phaser.GameObjects.Arc; end: Phaser.GameObjects.Arc }>();

  private draggingObjectId?: ObjectItemId;
  private draggingKey?: MatchKey;
  private draggingObject?: Phaser.GameObjects.Image;
  private dragLineEnd?: Phaser.Math.Vector2;
  private draggingLine?: Phaser.GameObjects.Image;
  private wrongLine?: Phaser.GameObjects.Image;
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
    } catch {}
  }
  private readonly onAudioUnlocked = () => {
    const win = window as unknown as Record<string, unknown>;
    win[AUDIO_UNLOCKED_KEY] = true;
    this.audioReady = true;

    // Không await để nhạc nền và voice có thể bắt đầu cùng lúc.
    try {
      void AudioManager.unlockAndWarmup?.();
    } catch {}

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
    this.promptImage = undefined;
    this.hasPlayedInstructionVoice = false;
    this.matchedObjects.clear();
    this.matchedLines.forEach((l) => this.destroyLineCaps(l));
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

    // SDK: set tổng số câu hỏi (ví dụ 4 cặp cần nối)
    irukaGame.setTotal(OBJECT_IDS.length);
    // Khởi tạo trạng thái game cho SDK
    (window as any).irukaGameState = {
      startTime: Date.now(),
      currentScore: this.score,
    };
    sdk.score(this.score, 0);
    sdk.progress({ levelIndex: 0, total: OBJECT_IDS.length });

    this.lastInteractionAtMs = 0;

    const win = window as unknown as Record<string, unknown>;
    this.audioReady = !!win[AUDIO_UNLOCKED_KEY];
  }

  // Khi trả lời đúng hoặc hoàn thành thử thách nhỏ
  private recordCorrect() {
    irukaGame.recordCorrect({ scoreDelta: 1 });
    (window as any).irukaGameState.currentScore = this.score;
    sdk.score(this.score, 1);
    sdk.progress({
      levelIndex: 0, // hoặc index level hiện tại nếu có nhiều level
      score: this.score,
    });
  }

  // Khi trả lời sai
  private recordWrong() {
    irukaGame.recordWrong();
  }

  // Khi gợi ý
  private addHint() {
    irukaGame.addHint();
  }

  // Khi lưu tiến trình/chuyển level
  private saveProgress() {
    sdk.requestSave({
      score: this.score,
      levelIndex: 0, // hoặc index level hiện tại nếu có nhiều level
    });
    sdk.progress({
      levelIndex: 0, // hoặc index level hiện tại nếu có nhiều level
      total: 4,
      score: this.score,
    });
  }

  // Khi hoàn thành game
  private finalizeAttempt() {
    irukaGame.finalizeAttempt();
  }

  /* ===================== CREATE ===================== */

  create() {
    // Ensure the first interaction inside Phaser can start BGM (some users rotate to landscape
    // without ever tapping the rotate overlay, so the first real gesture is in-game).
    this.input.once('pointerdown', () => {
      try {
        (window as any).ensureBgmStarted?.();
      } catch {}
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
      } catch {}
    });

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
      } catch {}
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
    } catch {}
  }

  /* ===================== BUILD ITEMS ===================== */

  private buildConnectBoard() {
    this.leftObjects.forEach((i) => i.destroy());
    this.rightObjects.forEach((i) => i.destroy());
    this.shapeItems.forEach((i) => i.destroy());
    this.leftObjects = [];
    this.rightObjects = [];
    this.shapeItems = [];

    this.matchedLines.forEach((l) => this.destroyLineCaps(l));
    this.matchedLines.forEach((l) => l.destroy());
    this.matchedLines.clear();
    this.matchedObjects.clear();
    this.draggingLine && this.destroyLineCaps(this.draggingLine);
    this.draggingLine?.destroy();
    this.draggingLine = undefined;
    this.wrongLine && this.destroyLineCaps(this.wrongLine);
    this.wrongLine?.destroy();
    this.wrongLine = undefined;

    this.shapeOrder = [...SHAPE_IDS];

    for (const id of this.shapeOrder) {
      const img = this.add
        .image(0, 0, ITEM_TEXTURE[id])
        .setOrigin(0.5)
        .setScale(this.currentItemScale)
        .setDepth(ITEM_DEPTH);
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
        .setScale(this.currentItemScale)
        .setDepth(ITEM_DEPTH);
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
        .setScale(this.currentItemScale)
        .setDepth(ITEM_DEPTH);
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

    this.input.on('pointerdown', () => this.noteInteraction());

    this.input.on('dragstart', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      AudioManager.stop('voice_join');
      this.noteInteraction();
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

      this.leftObjects.forEach((i) => i.setScale(this.currentItemScale));
      this.rightObjects.forEach((i) => i.setScale(this.currentItemScale));
      img.setScale(this.currentItemScale * 1.06);

      if (!this.draggingLine) {
        this.draggingLine = this.add.image(0, 0, CONNECT_LINE_KEY).setOrigin(0.5).setDepth(LINE_DEPTH).setAlpha(0.85);
      }
      this.draggingLine.setVisible(true).clearTint();
      this.ensureLineCaps(this.draggingLine);
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
    const byKey = new Map<MatchKey, ObjectItemId[]>();
    for (const id of OBJECT_IDS) {
      const key = OBJECT_MATCH_KEY[id];
      const list = byKey.get(key);
      if (list) list.push(id);
      else byKey.set(key, [id]);
    }

    // Shuffle inside each bucket to keep variety.
    for (const [key, list] of byKey) {
      const shuffled = [...list];
      Phaser.Utils.Array.Shuffle(shuffled);
      byKey.set(key, shuffled);
    }

    const keys = Array.from(byKey.keys());
    Phaser.Utils.Array.Shuffle(keys);

    const leftIds: ObjectItemId[] = [];
    const rightIds: ObjectItemId[] = [];

    // Distribute per-shape as evenly as possible across the two columns.
    for (const key of keys) {
      const items = byKey.get(key) ?? [];
      const startOnLeft = leftIds.length <= rightIds.length;
      for (let i = 0; i < items.length; i++) {
        const toLeft = (i % 2 === 0) === startOnLeft;
        (toLeft ? leftIds : rightIds).push(items[i]);
      }
    }

    return {
      leftIds: this.orderAvoidAdjacentSameShape(leftIds),
      rightIds: this.orderAvoidAdjacentSameShape(rightIds),
    };
  }

  private orderAvoidAdjacentSameShape(ids: ObjectItemId[]) {
    const remaining = [...ids];
    const out: ObjectItemId[] = [];
    let lastKey: MatchKey | undefined;

    while (remaining.length > 0) {
      const counts = new Map<MatchKey, number>();
      for (const id of remaining) {
        const key = OBJECT_MATCH_KEY[id];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const candidates = remaining.filter((id) => OBJECT_MATCH_KEY[id] !== lastKey);
      const pool = candidates.length > 0 ? candidates : remaining;

      let best = pool[0];
      let bestCount = counts.get(OBJECT_MATCH_KEY[best]) ?? 0;
      for (let i = 1; i < pool.length; i++) {
        const id = pool[i];
        const c = counts.get(OBJECT_MATCH_KEY[id]) ?? 0;
        if (c > bestCount) {
          best = id;
          bestCount = c;
        }
      }

      // If multiple candidates share the same max count, pick randomly among them.
      const bestKey = OBJECT_MATCH_KEY[best];
      const bestPool = pool.filter((id) => (counts.get(OBJECT_MATCH_KEY[id]) ?? 0) === bestCount);
      const chosen = bestPool.length > 1 ? bestPool[Phaser.Math.Between(0, bestPool.length - 1)] : best;

      const idx = remaining.indexOf(chosen);
      remaining.splice(idx, 1);
      out.push(chosen);
      lastKey = bestKey;
    }

    return out;
  }

  /* ===================== LAYOUT ===================== */

  private layoutScene() {
    const { width, height } = this.scale;
    const centerX = width / 2;

    const bannerMaxW = width * BANNER_MAX_W_RATIO;
    const bannerMaxH = Math.max(44, height * 0.12);
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
      const maxBoardW = width * 1.0;
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
      const yPositions = this.getYPositions(count, innerTop, innerBottom);
      const baseGap = count > 1 ? (innerBottom - innerTop) / (count - 1) : 0;
      const extraSlots = Math.max(0, count - this.shapeItems.length);
      const shapeTop = innerTop + (extraSlots * baseGap) / 2;
      const shapeBottom = innerBottom - (extraSlots * baseGap) / 2;
      const shapeYPositions = this.getYPositions(this.shapeItems.length, shapeTop, shapeBottom);

      const leftX = centerX - columnGap;
      const midX = centerX;
      const rightX = centerX + columnGap;

      for (let i = 0; i < this.shapeItems.length; i++) {
        this.shapeItems[i].setPosition(midX, shapeYPositions[i] ?? boardY);
      }
      for (let i = 0; i < this.leftObjects.length; i++) {
        this.leftObjects[i].setPosition(leftX, yPositions[i] ?? boardY);
      }
      for (let i = 0; i < this.rightObjects.length; i++) {
        this.rightObjects[i].setPosition(rightX, yPositions[i] ?? boardY);
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
      const yPositions = this.getYPositions(count, itemsTop, safeItemsBottom);
      const baseGap = count > 1 ? (safeItemsBottom - itemsTop) / (count - 1) : 0;
      const extraSlots = Math.max(0, count - this.shapeItems.length);
      const shapeTop = itemsTop + (extraSlots * baseGap) / 2;
      const shapeBottom = safeItemsBottom - (extraSlots * baseGap) / 2;
      const shapeYPositions = this.getYPositions(this.shapeItems.length, shapeTop, shapeBottom);

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
        this.leftObjects[i].setPosition(leftX, yPositions[i] ?? 0);
      }
      for (let i = 0; i < this.rightObjects.length; i++) {
        this.rightObjects[i].setPosition(rightX, yPositions[i] ?? 0);
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

  private startRound() {
    this.updateHintForRound();
    this.resetUiForNewTry();
    this.playInstructionVoice();
    this.gameState = 'INTRO';
    this.lastInteractionAtMs = this.time.now;
    this.cancelGuideHandSchedule();
    // Show once shortly after entering the game, then repeat on inactivity.
    this.scheduleGuideHand(450);
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
      this.startGuideHand();
    });
  }

  private startGuideHand() {
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

    this.addHint();
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
      AudioManager.play('sfx_correct');
      AudioManager.playCorrectAnswer();

      this.matchedObjects.add(objectId);
      this.score = this.matchedObjects.size;
      this.recordCorrect();

      objectImg.disableInteractive().setAlpha(0.9);

      this.draggingObjectId = undefined;
      this.draggingKey = undefined;
      this.draggingObject = undefined;
      this.dragLineEnd = undefined;
      this.draggingLine?.setVisible(false);
      this.wrongLine?.setVisible(false);

      const line = this.add.image(0, 0, CONNECT_LINE_KEY).setOrigin(0.5).setDepth(LINE_DEPTH);
      this.matchedLines.set(objectId, line);
      this.ensureLineCaps(line);
      this.redrawConnections();
      this.animateCorrect(objectImg, shapeImg, this.matchedLines.get(objectId));

      if (this.matchedObjects.size >= OBJECT_IDS.length) {
        this.gameState = 'LEVEL_END';
        this.saveProgress();
        this.finalizeAttempt();
        this.time.delayedCall(1000, () => {
          this.scene.start('EndGameScene', {
            lessonId: '',
            score: this.score,
            total: OBJECT_IDS.length,
          });
        });
        return;
      }

      this.time.delayedCall(450, () => {
        if (!this.scene.isActive()) return;
        this.gameState = 'INTRO';
      });
      return;
    }

    AudioManager.play('sfx_wrong');
    this.recordWrong();

    this.draggingLine?.setVisible(false);

    if (!this.wrongLine) {
      this.wrongLine = this.add.image(0, 0, CONNECT_LINE_KEY).setOrigin(0.5).setDepth(LINE_DEPTH);
    }
    this.wrongLine.setVisible(true).setTint(0xff4d4d).setAlpha(0.95);
    this.ensureLineCaps(this.wrongLine);

    const start = this.getAnchorWorldPoint(objectImg, shapeImg.x, shapeImg.y);
    const end = this.getAnchorWorldPoint(shapeImg, objectImg.x, objectImg.y);
    const x1 = start.x;
    const y1 = start.y;
    const x2 = end.x;
    const y2 = end.y;
    this.wrongLineSeg = { x1, y1, x2, y2 };
    this.updateLineSprite(this.wrongLine, x1, y1, x2, y2);

    this.draggingObjectId = undefined;
    this.draggingKey = undefined;
    this.draggingObject = undefined;
    this.dragLineEnd = undefined;
    this.redrawConnections();
    this.animateWrong(objectImg, shapeImg, this.wrongLine);

    this.time.delayedCall(650, () => {
      if (!this.scene.isActive()) return;
      this.wrongLine?.setVisible(false);
      this.wrongLineSeg = undefined;
      this.gameState = 'INTRO';
      this.redrawConnections();
    });
  }

  private animateCorrect(
    _leftImg?: Phaser.GameObjects.Image,
    _rightImg?: Phaser.GameObjects.Image,
    line?: Phaser.GameObjects.Image,
  ) {
    if (!line) return;
    this.ensureLineCaps(line);

    line.setTint(0x6bff8a).setAlpha(1);
    this.tweens.add({
      targets: [line, ...this.getLineCapsTargets(line)],
      alpha: { from: 0.85, to: 1 },
      duration: 90,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.inOut',
      onComplete: () => line.clearTint(),
    });
  }

  private animateWrong(_leftImg?: Phaser.GameObjects.Image, _rightImg?: Phaser.GameObjects.Image, line?: Phaser.GameObjects.Image) {
    if (!line) return;
    this.ensureLineCaps(line);

    this.tweens.add({
      targets: [line, ...this.getLineCapsTargets(line)],
      alpha: { from: 0.25, to: 0.95 },
      duration: 80,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.inOut',
    });
  }

  private ensureLineCaps(line: Phaser.GameObjects.Image) {
    if (this.lineCaps.has(line)) return;

    const start = this.add.circle(0, 0, LINE_CAP_RADIUS, 0xffffff, 1).setOrigin(0.5).setDepth(line.depth).setVisible(false);
    const end = this.add.circle(0, 0, LINE_CAP_RADIUS, 0xffffff, 1).setOrigin(0.5).setDepth(line.depth).setVisible(false);
    this.lineCaps.set(line, { start, end });
  }

  private getLineCapsTargets(line: Phaser.GameObjects.Image) {
    const caps = this.lineCaps.get(line);
    if (!caps) return [];
    return [caps.start, caps.end];
  }

  private destroyLineCaps(line: Phaser.GameObjects.Image) {
    const caps = this.lineCaps.get(line);
    if (!caps) return;
    caps.start.destroy();
    caps.end.destroy();
    this.lineCaps.delete(line);
  }

  private redrawConnections() {
    for (const [objectId, line] of this.matchedLines) {
      const objectImg = [...this.leftObjects, ...this.rightObjects].find((i) => i.getData('itemId') === objectId);
      if (!objectImg) continue;
      const matchKey = objectImg.getData('matchKey') as MatchKey | undefined;
      if (!matchKey) continue;
      const shapeImg = this.shapeItems.find((i) => i.getData('matchKey') === matchKey);
      if (!shapeImg) continue;

      const start = this.getAnchorWorldPoint(objectImg, shapeImg.x, shapeImg.y);
      const end = this.getAnchorWorldPoint(shapeImg, objectImg.x, objectImg.y);
      this.updateLineSprite(line, start.x, start.y, end.x, end.y, LINE_END_EXTEND, LINE_END_EXTEND);
      line.setVisible(true).clearTint().setAlpha(1);
    }

    if (this.draggingObject && this.dragLineEnd && this.draggingLine) {
      const start = this.getAnchorWorldPoint(this.draggingObject, this.dragLineEnd.x, this.dragLineEnd.y);
      this.updateLineSprite(
        this.draggingLine,
        start.x,
        start.y,
        this.dragLineEnd.x,
        this.dragLineEnd.y,
        LINE_DRAG_START_EXTEND,
        0,
      );
      this.draggingLine.setVisible(true).clearTint().setAlpha(0.85);
    }

    if (this.wrongLine?.visible && this.wrongLineSeg) {
      this.updateLineSprite(
        this.wrongLine,
        this.wrongLineSeg.x1,
        this.wrongLineSeg.y1,
        this.wrongLineSeg.x2,
        this.wrongLineSeg.y2,
        LINE_END_EXTEND,
        LINE_END_EXTEND,
      );
    }
  }

  private updateLineSprite(
    line: Phaser.GameObjects.Image,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    extendStart = 0,
    extendEnd = 0,
  ) {
    let dx = x2 - x1;
    let dy = y2 - y1;
    const baseDist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const ux = dx / baseDist;
    const uy = dy / baseDist;

    const maxExtend = Math.max(0, baseDist / 2 - 1);
    const s = Math.min(Math.max(0, extendStart), maxExtend);
    const e = Math.min(Math.max(0, extendEnd), maxExtend);

    const ax1 = x1 - ux * s;
    const ay1 = y1 - uy * s;
    const ax2 = x2 + ux * e;
    const ay2 = y2 + uy * e;

    dx = ax2 - ax1;
    dy = ay2 - ay1;
    const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const angle = Math.atan2(dy, dx);

    line.setPosition((ax1 + ax2) / 2, (ay1 + ay2) / 2);
    line.setRotation(angle);
    line.setDisplaySize(dist, LINE_THICKNESS);
  }

  private getAnchorWorldPoint(img: Phaser.GameObjects.Image, towardX: number, towardY: number) {
    const cx = img.x;
    const cy = img.y;

    const dx = towardX - cx;
    const dy = towardY - cy;

    const len = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy));
    const ux = dx / len;
    const uy = dy / len;

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    const intersectBox = (halfW: number, halfH: number) => {
      const tx = dx === 0 ? Number.POSITIVE_INFINITY : halfW / Math.abs(dx);
      const ty = dy === 0 ? Number.POSITIVE_INFINITY : halfH / Math.abs(dy);
      const t = Math.min(tx, ty);
      return { x: cx + dx * t, y: cy + dy * t };
    };

    const role = img.getData('role') as 'SHAPE' | 'OBJECT' | undefined;
    const matchKey = img.getData('matchKey') as MatchKey | undefined;

    const cross = (x1: number, y1: number, x2: number, y2: number) => x1 * y2 - y1 * x2;

    const intersectTriangle = (halfW: number, halfH: number) => {
      // Triangle with vertices (0,-halfH), (-halfW,halfH), (halfW,halfH)
      const ax = 0;
      const ay = -halfH;
      const bx = -halfW;
      const by = halfH;
      const cxp = halfW;
      const cyp = halfH;

      const tryEdge = (
        ex1: number,
        ey1: number,
        ex2: number,
        ey2: number,
      ): { t: number; u: number; ex1: number; ey1: number; ex2: number; ey2: number } | undefined => {
        const rx = dx;
        const ry = dy;
        const sx = ex2 - ex1;
        const sy = ey2 - ey1;
        const denom = cross(rx, ry, sx, sy);
        if (Math.abs(denom) < 1e-6) return undefined;

        const qpx = ex1;
        const qpy = ey1;
        const t = cross(qpx, qpy, sx, sy) / denom;
        const u = cross(qpx, qpy, rx, ry) / denom;
        if (t >= 0 && u >= 0 && u <= 1) return { t, u, ex1, ey1, ex2, ey2 };
        return undefined;
      };

      const hits = [tryEdge(ax, ay, bx, by), tryEdge(bx, by, cxp, cyp), tryEdge(cxp, cyp, ax, ay)].filter(
        (h): h is { t: number; u: number; ex1: number; ey1: number; ex2: number; ey2: number } =>
          !!h && Number.isFinite(h.t) && Number.isFinite(h.u),
      );

      if (hits.length > 0) {
        hits.sort((a, b) => a.t - b.t);
        const hit = hits[0];

        // Avoid snapping to triangle vertices: clamp to interior of the edge.
        const eps = 0.28;
        const uClamped = clamp(hit.u, eps, 1 - eps);
        const sx = hit.ex2 - hit.ex1;
        const sy = hit.ey2 - hit.ey1;
        return { x: cx + hit.ex1 + sx * uClamped, y: cy + hit.ey1 + sy * uClamped };
      }

      return intersectBox(halfW, halfH);
    };

    const shapeInset = role === 'OBJECT' ? Math.max(1, LINE_THICKNESS * 0.35) : Math.max(1, LINE_THICKNESS * 0.15);
    const halfW = Math.max(1, img.displayWidth / 2 - shapeInset);
    const halfH = Math.max(1, img.displayHeight / 2 - shapeInset);

    // For both objects and shapes, use the geometry implied by matchKey.
    if (matchKey) {
      if (matchKey === 'CIRCLE') {
        const r = Math.max(1, Math.min(img.displayWidth, img.displayHeight) / 2 - shapeInset);
        return { x: cx + ux * r, y: cy + uy * r };
      }

      if (matchKey === 'SQUARE' || matchKey === 'RECTANGLE') {
        // Prefer touching a side (not a corner). Since objects are left/right of shapes,
        // pick the facing vertical edge and clamp Y inside the edge, away from corners.
        const padY = Math.max(halfH * 0.28, LINE_THICKNESS * 1.2);
        const minY = cy - halfH + padY;
        const maxY = cy + halfH - padY;
        const y = clamp(towardY, minY, maxY);
        const x = towardX >= cx ? cx + halfW : cx - halfW;
        return { x, y };
      }

      return intersectTriangle(halfW, halfH);
    }

    // Fallback: inset box.
    return intersectBox(halfW, halfH);
  }
}
