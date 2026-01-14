import Phaser from 'phaser';
import AudioManager from './AudioManager';
import { sdk } from './main';
import { game as irukaGame } from '@iruka-edu/mini-game-sdk';

/* ===================== AUDIO GLOBAL FLAG ===================== */
const AUDIO_UNLOCKED_KEY = '__audioUnlocked__';
const AUDIO_UNLOCKED_EVENT = 'audio-unlocked';

/* ===================== TYPES ===================== */

type GameState = 'INTRO' | 'DRAGGING' | 'CHECKING' | 'LEVEL_END';

type LeftItemId = 'HAND_SMALL' | 'HAND_BIG' | 'FEET_SMALL' | 'FEET_BIG';
type RightItemId = 'GLOVE_SMALL' | 'GLOVE_BIG' | 'SHOE_SMALL' | 'SHOE_BIG';
type ItemId = LeftItemId | RightItemId;
type MatchKey = LeftItemId;

type WindowGameApi = {
  setRandomGameViewportBg?: () => void;
  setGameButtonsVisible?: (visible: boolean) => void;
} & Record<string, unknown>;

/* ===================== ASSETS ===================== */

const ITEM_TEXTURE: Record<ItemId, string> = {
  HAND_SMALL: 'hand_small',
  HAND_BIG: 'hand_big',
  FEET_SMALL: 'feet_small',
  FEET_BIG: 'feet_big',
  GLOVE_SMALL: 'glove_small',
  GLOVE_BIG: 'glove_big',
  SHOE_SMALL: 'shoe_small',
  SHOE_BIG: 'shoe_big',
};

const CONNECT_LINE_KEY = 'connect_line';
const HINT_IMG_KEY = 'connect_hint';
const ITEMS_BOARD_KEY = 'banner_question';
const GUIDE_HAND_KEY = 'guide_hand';

const LEFT_IDS: readonly LeftItemId[] = ['HAND_SMALL', 'HAND_BIG', 'FEET_SMALL', 'FEET_BIG'] as const;
const RIGHT_IDS: readonly RightItemId[] = ['GLOVE_SMALL', 'GLOVE_BIG', 'SHOE_SMALL', 'SHOE_BIG'] as const;

const RIGHT_MATCH_KEY: Record<RightItemId, MatchKey> = {
  GLOVE_SMALL: 'HAND_SMALL',
  GLOVE_BIG: 'HAND_BIG',
  SHOE_SMALL: 'FEET_SMALL',
  SHOE_BIG: 'FEET_BIG',
};

/* ===================== SCALE ===================== */

const ITEM_SCALE = 3.0;
const PROMPT_IMG_SCALE = 0.55;
const LINE_THICKNESS = 12;
const LINE_END_EXTEND = 5;
const LINE_DRAG_START_EXTEND = 10;
const ITEM_FILL_RATIO = 0.94;
const ITEMS_SHIFT_FROM_BANNER = 0;

/* ===================== HOLE ANCHOR ===================== */

// Lỗ tròn (tính theo pixel của ảnh gốc).
// Left column (HAND/FEET): Left=63, Top=126, W/H=40 (rotation -180° doesn't matter because we do not rotate the sprite)
// Right column (GLOVE/SHOE): Left=472, Top=126, W/H=40
const HOLE_BOX_LEFT = { left: 63, top: 126, width: 40, height: 40 } as const;
const HOLE_BOX_RIGHT = { left: 472, top: 126, width: 40, height: 40 } as const;

/* ===================== LAYOUT ===================== */

const BANNER_Y = 42;
const BANNER_SCALE = 0.46;
const BANNER_MAX_W_RATIO = 0.6;

const PROMPT_FONT_SIZE = 30;
const FEEDBACK_FONT_SIZE = 22;
const FEEDBACK_BOTTOM_MARGIN = 0;

const SIDE_CHAR_KEY = 'char';
const SIDE_CHAR_BASE_SCALE = 0.4;
const SIDE_CHAR_BOARD_GAP_MIN = 16;
const SIDE_CHAR_BOARD_GAP_RATIO = 0.02;
const SIDE_CHAR_BOARD_MAX_H_RATIO = 0.95;
const SIDE_CHAR_BOB_RATIO = 0.015;

const ITEMS_GAP_FROM_BANNER = 6;
const ITEMS_GAP_FROM_FEEDBACK = 4;

const COLUMN_GAP_RATIO = 0.32;
const COLUMN_GAP_MIN = 120;
const COLUMN_GAP_MAX = 520;

const ITEMS_BOARD_PAD_X = 24;
const ITEMS_BOARD_PAD_Y = 12;
const ITEMS_BOARD_EXTRA_H = 100;
const ITEMS_BOARD_DEPTH = 4;

const ITEM_DEPTH = 5;
const LINE_DEPTH = 6;
const LINE_CAP_RADIUS = Math.max(3, LINE_THICKNESS * 0.55);
const CHAR_DEPTH = 5;
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
const GUIDE_HAND_END_DEEPEN_DIST = 2;
const GUIDE_HAND_RETURN_MS = 700;

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

  private sideCharacter?: Phaser.GameObjects.Image;

  private leftOrder: LeftItemId[] = [];
  private rightOrder: RightItemId[] = [];

  private leftItems: Phaser.GameObjects.Image[] = [];
  private rightItems: Phaser.GameObjects.Image[] = [];

  private matched = new Set<MatchKey>();
  private matchedLines = new Map<MatchKey, Phaser.GameObjects.Image>();
  private lineCaps = new Map<Phaser.GameObjects.Image, { start: Phaser.GameObjects.Arc; end: Phaser.GameObjects.Arc }>();

  private draggingKey?: MatchKey;
  private draggingSide?: 'LEFT' | 'RIGHT';
  private dragLineEnd?: Phaser.Math.Vector2;
  private draggingLine?: Phaser.GameObjects.Image;
  private wrongLine?: Phaser.GameObjects.Image;
  private wrongLineSeg?: { x1: number; y1: number; x2: number; y2: number };
  private audioReady = false;
  private guideHand?: Phaser.GameObjects.Image;
  private guideHandTween?: Phaser.Tweens.Tween;
  private guideHandSeqId = 0;
  private guideHandMatchKey?: MatchKey;
  private guideHandShownOnce = false;
  private guideHandTimer?: Phaser.Time.TimerEvent;
  private roundInteracted = false;
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
    this.matched.clear();
    this.draggingKey = undefined;
    this.dragLineEnd = undefined;
    this.wrongLine = undefined;
    this.wrongLineSeg = undefined;
    this.gameState = 'INTRO';
    this.cancelGuideHandSchedule();
    this.destroyGuideHand();

    // SDK: set tổng số câu hỏi (ví dụ 4 cặp cần nối)
    irukaGame.setTotal(4);
    // Khởi tạo trạng thái game cho SDK
    (window as any).irukaGameState = {
      startTime: Date.now(),
      currentScore: this.score,
    };
    sdk.score(this.score, 0);
    sdk.progress({ levelIndex: 0, total: 4 });

    this.guideHandShownOnce = false;
    this.roundInteracted = false;

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

    if (this.textures.exists(SIDE_CHAR_KEY)) {
      this.sideCharacter = this.add.image(0, 0, SIDE_CHAR_KEY).setOrigin(0.5, 1).setDepth(CHAR_DEPTH);
    } else {
      this.sideCharacter = undefined;
    }

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
    this.leftItems.forEach((i) => i.destroy());
    this.rightItems.forEach((i) => i.destroy());
    this.leftItems = [];
    this.rightItems = [];

    this.matchedLines.forEach((l) => this.destroyLineCaps(l));
    this.matchedLines.forEach((l) => l.destroy());
    this.matchedLines.clear();
    this.draggingLine && this.destroyLineCaps(this.draggingLine);
    this.draggingLine?.destroy();
    this.draggingLine = undefined;
    this.wrongLine && this.destroyLineCaps(this.wrongLine);
    this.wrongLine?.destroy();
    this.wrongLine = undefined;

    this.leftOrder = [...LEFT_IDS];
    this.rightOrder = [...RIGHT_IDS];
    Phaser.Utils.Array.Shuffle(this.leftOrder);
    Phaser.Utils.Array.Shuffle(this.rightOrder);

    for (const id of this.leftOrder) {
      const img = this.add
        .image(0, 0, ITEM_TEXTURE[id])
        .setOrigin(0.5)
        .setScale(this.currentItemScale)
        .setDepth(ITEM_DEPTH);
      img.setData('itemId', id);
      img.setData('matchKey', id);
      img.setData('holeSide', 'LEFT');
      img.setInteractive({ useHandCursor: true, draggable: true });
      this.input.setDraggable(img);
      this.leftItems.push(img);
    }

    for (const id of this.rightOrder) {
      const img = this.add
        .image(0, 0, ITEM_TEXTURE[id])
        .setOrigin(0.5)
        .setScale(this.currentItemScale)
        .setDepth(ITEM_DEPTH);
      img.setData('itemId', id);
      img.setData('matchKey', RIGHT_MATCH_KEY[id]);
      img.setData('holeSide', 'RIGHT');
      img.setInteractive({ useHandCursor: true, draggable: true });
      this.input.setDraggable(img);
      this.rightItems.push(img);
    }

    this.input.removeAllListeners('dragstart');
    this.input.removeAllListeners('drag');
    this.input.removeAllListeners('dragend');

    this.input.on('dragstart', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      AudioManager.stop('voice_join');
      this.roundInteracted = true;
      this.cancelGuideHandSchedule();
      this.destroyGuideHand();
      const img = gameObject as Phaser.GameObjects.Image;
      const matchKey = img.getData('matchKey') as MatchKey | undefined;
      if (!matchKey || this.matched.has(matchKey) || this.gameState === 'LEVEL_END') return;

      AudioManager.play('sfx_click');
      this.draggingKey = matchKey;
      this.draggingSide = (img.getData('holeSide') as 'LEFT' | 'RIGHT' | undefined) ?? 'LEFT';
      this.dragLineEnd = new Phaser.Math.Vector2(pointer.x, pointer.y);
      this.gameState = 'DRAGGING';

      this.leftItems.forEach((i) => i.setScale(this.currentItemScale));
      this.rightItems.forEach((i) => i.setScale(this.currentItemScale));
      img.setScale(this.currentItemScale * 1.06);

      if (!this.draggingLine) {
        this.draggingLine = this.add.image(0, 0, CONNECT_LINE_KEY).setOrigin(0.5).setDepth(LINE_DEPTH).setAlpha(0.85);
      }
      this.draggingLine.setVisible(true).clearTint();
      this.ensureLineCaps(this.draggingLine);
      this.redrawConnections();
    });

    this.input.on('drag', (pointer: Phaser.Input.Pointer) => {
      if (!this.draggingKey || this.gameState !== 'DRAGGING') return;
      this.dragLineEnd = new Phaser.Math.Vector2(pointer.x, pointer.y);
      this.redrawConnections();
    });

    this.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      const img = gameObject as Phaser.GameObjects.Image;
      const matchKey = img.getData('matchKey') as MatchKey | undefined;
      if (!matchKey || matchKey !== this.draggingKey) return;

      this.leftItems.forEach((i) => i.setScale(this.currentItemScale));
      this.rightItems.forEach((i) => i.setScale(this.currentItemScale));

      const side = (img.getData('holeSide') as 'LEFT' | 'RIGHT' | undefined) ?? this.draggingSide ?? 'LEFT';
      const target = side === 'LEFT' ? this.getRightItemAt(pointer.x, pointer.y) : this.getLeftItemAt(pointer.x, pointer.y);
      if (!target) {
        this.draggingKey = undefined;
        this.draggingSide = undefined;
        this.dragLineEnd = undefined;
        this.draggingLine?.setVisible(false);
        this.gameState = 'INTRO';
        this.redrawConnections();
        return;
      }

      const targetKey = target.getData('matchKey') as MatchKey;
      if (side === 'LEFT') {
        this.checkMatch(matchKey, targetKey);
      } else {
        this.checkMatch(targetKey, matchKey);
      }
    });
  }

  private getRightItemAt(x: number, y: number) {
    for (const img of this.rightItems) {
      const matchKey = img.getData('matchKey') as MatchKey;
      if (this.matched.has(matchKey)) continue;
      if (img.getBounds().contains(x, y)) return img;
    }
    return undefined;
  }

  private getLeftItemAt(x: number, y: number) {
    for (const img of this.leftItems) {
      const matchKey = img.getData('matchKey') as MatchKey;
      if (this.matched.has(matchKey)) continue;
      if (img.getBounds().contains(x, y)) return img;
    }
    return undefined;
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
      ...this.leftItems.map((i) => i.height ?? 0),
      ...this.rightItems.map((i) => i.height ?? 0),
    );
    const maxSrcW = Math.max(
      1,
      ...this.leftItems.map((i) => i.width ?? 0),
      ...this.rightItems.map((i) => i.width ?? 0),
    );

    if (this.itemsBoard && this.itemsBoard.scene) {
      // Make the board wrap all items (no overflow), within the available area.
      const maxBoardW = width * 1.0;
      const maxBoardH = Math.max(1, safeItemsBottom - itemsTop);

      const maxInnerW = Math.max(1, maxBoardW - ITEMS_BOARD_PAD_X * 2);
      const maxInnerH = Math.max(1, maxBoardH - ITEMS_BOARD_PAD_Y * 2);

      // 1) Decide item scale to fit within maxInnerW/maxInnerH.
      const count = LEFT_IDS.length;
      const heightDivisor = (count > 1 ? (count - 1) / ITEM_FILL_RATIO : 0) + 1;
      const maxAllowedItemH = Math.max(46, maxInnerH / heightDivisor);
      const scaleByHeight = maxAllowedItemH / maxSrcH;

      // Smaller gap between 2 columns for a tighter layout.
      let columnGap = Math.min(COLUMN_GAP_MAX, Math.max(COLUMN_GAP_MIN, maxInnerW * 0.48));
      let scaleByWidth = (maxInnerW - columnGap) / maxSrcW;

      this.currentItemScale = Math.min(ITEM_SCALE, scaleByHeight, scaleByWidth);
      const maxItemW = maxSrcW * this.currentItemScale;
      if (columnGap + maxItemW > maxInnerW) {
        columnGap = Math.max(COLUMN_GAP_MIN, maxInnerW - maxItemW);
        scaleByWidth = (maxInnerW - columnGap) / maxSrcW;
        this.currentItemScale = Math.min(ITEM_SCALE, scaleByHeight, scaleByWidth);
      }
      this.leftItems.forEach((i) => i.setScale(this.currentItemScale));
      this.rightItems.forEach((i) => i.setScale(this.currentItemScale));

      // 2) Layout items inside the available vertical span first.
      const boardY = (itemsTop + safeItemsBottom) / 2;
      const maxItemH = maxSrcH * this.currentItemScale;
      const centersSpan = Math.max(1, maxInnerH - maxItemH);
      const innerTop = boardY - centersSpan / 2;
      const innerBottom = boardY + centersSpan / 2;
      const yPositions = this.getYPositions(LEFT_IDS.length, innerTop, innerBottom);

      const leftX = centerX - columnGap / 2;
      const rightX = centerX + columnGap / 2;

      for (let i = 0; i < this.leftItems.length; i++) {
        this.leftItems[i].setPosition(rightX, yPositions[i] ?? boardY);
      }
      for (let i = 0; i < this.rightItems.length; i++) {
        this.rightItems[i].setPosition(leftX, yPositions[i] ?? boardY);
      }

      // 3) Resize the board to cover all items with padding.
      let bounds: Phaser.Geom.Rectangle | undefined;
      const all = [...this.leftItems, ...this.rightItems];
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

      // 4) If we have a side character, position the group and (if needed) shrink character only.
      if (this.sideCharacter) {
        const baseScale = (height / 720) * SIDE_CHAR_BASE_SCALE;
        const maxCharH = Math.max(1, boardH * SIDE_CHAR_BOARD_MAX_H_RATIO);
        let charScale = Math.min(baseScale, maxCharH / Math.max(1, this.sideCharacter.height));
        this.sideCharacter.setScale(charScale);

        const gap = Math.max(SIDE_CHAR_BOARD_GAP_MIN, width * SIDE_CHAR_BOARD_GAP_RATIO);
        const maxGroupW = width * 0.96;
        const groupW = this.sideCharacter.displayWidth + gap + boardW;
        if (groupW > maxGroupW) {
          const availableForChar = Math.max(1, maxGroupW - gap - boardW);
          const shrink = Math.min(1, availableForChar / Math.max(1, this.sideCharacter.displayWidth));
          charScale *= shrink;
          this.sideCharacter.setScale(charScale);
        }

        const finalGroupW = this.sideCharacter.displayWidth + gap + boardW;
        const groupLeft = centerX - finalGroupW / 2;
        const charX = groupLeft + this.sideCharacter.displayWidth / 2;
        const newBoardX = groupLeft + this.sideCharacter.displayWidth + gap + boardW / 2;

        const dx = newBoardX - this.itemsBoard.x;
        if (dx !== 0) {
          this.itemsBoard.setX(this.itemsBoard.x + dx);
          this.leftItems.forEach((i) => i.setX(i.x + dx));
          this.rightItems.forEach((i) => i.setX(i.x + dx));
        }

        const charBottomY = Math.min(height - 10, boardY + boardH / 2);
        this.sideCharacter.setPosition(charX, charBottomY);

        this.tweens.killTweensOf(this.sideCharacter);
        this.tweens.add({
          targets: this.sideCharacter,
          y: this.sideCharacter.y - height * SIDE_CHAR_BOB_RATIO,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
        this.sideCharacter.setAngle(0);
      }
    } else {
      const yPositions = this.getYPositions(LEFT_IDS.length, itemsTop, safeItemsBottom);

      const span = Math.max(1, safeItemsBottom - itemsTop);
      const gap = LEFT_IDS.length > 1 ? span / (LEFT_IDS.length - 1) : span;
      const maxAllowedItemH = Math.max(46, gap * ITEM_FILL_RATIO);

      // Smaller gap between 2 columns for a tighter layout.
      const columnGap = Math.min(COLUMN_GAP_MAX, Math.max(COLUMN_GAP_MIN, width * COLUMN_GAP_RATIO));
      const leftX = centerX - columnGap / 2;
      const rightX = centerX + columnGap / 2;
      const maxAllowedItemW = Math.max(60, columnGap * 0.82);

      this.currentItemScale = Math.min(ITEM_SCALE, maxAllowedItemH / maxSrcH, maxAllowedItemW / maxSrcW);
      this.leftItems.forEach((i) => i.setScale(this.currentItemScale));
      this.rightItems.forEach((i) => i.setScale(this.currentItemScale));

      for (let i = 0; i < this.leftItems.length; i++) {
        // HAND/FEET column on the right
        this.leftItems[i].setPosition(rightX, yPositions[i] ?? 0);
      }
      for (let i = 0; i < this.rightItems.length; i++) {
        // GLOVE/SHOE column on the left
        this.rightItems[i].setPosition(leftX, yPositions[i] ?? 0);
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
    this.roundInteracted = false;
    this.cancelGuideHandSchedule();
    this.scheduleGuideHand();
  }

  private scheduleGuideHand() {
    if (this.guideHandShownOnce) return;
    if (!this.textures.exists(GUIDE_HAND_KEY)) return;

    this.cancelGuideHandSchedule();
    this.guideHandTimer = this.time.delayedCall(450, () => {
      if (!this.scene.isActive()) return;
      if (this.guideHandShownOnce) return;
      if (this.roundInteracted) return;
      if (this.matched.size > 0) return;
      if (this.gameState !== 'INTRO') return;
      if (this.draggingKey) return;
      this.startGuideHand();
    });
  }

  private startGuideHand() {
    if (this.guideHandShownOnce) return;
    if (!this.textures.exists(GUIDE_HAND_KEY)) return;
    if (this.roundInteracted) return;

    const matchKey = this.leftOrder[0] ?? (this.leftItems[0]?.getData('matchKey') as MatchKey | undefined);
    if (!matchKey) return;

    const leftImg = this.leftItems.find((i) => i.getData('matchKey') === matchKey);
    const rightImg = this.rightItems.find((i) => i.getData('matchKey') === matchKey);
    if (!leftImg || !rightImg) return;

    this.guideHandShownOnce = true;
    this.addHint();
    this.guideHandMatchKey = matchKey;

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
    if (!this.guideHand || !this.guideHandMatchKey) return;
    const matchKey = this.guideHandMatchKey;

    const leftImg = this.leftItems.find((i) => i.getData('matchKey') === matchKey);
    const rightImg = this.rightItems.find((i) => i.getData('matchKey') === matchKey);
    if (!leftImg || !rightImg) return;

    const start = this.getHoleWorldPoint(leftImg);
    const end = this.getHoleWorldPoint(rightImg);

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
    this.guideHandMatchKey = undefined;
    this.guideHand?.destroy();
    this.guideHand = undefined;
  }

  private cancelGuideHandSchedule() {
    if (!this.guideHandTimer) return;
    this.time.removeEvent(this.guideHandTimer);
    this.guideHandTimer = undefined;
  }

  private updateHintForRound() {
    const fallback = 'Ghép tương ứng các đồ dùng về kích cỡ!';

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
      const scale = Math.min((bannerW * 0.86) / imgW, (bannerH * 0.8) / imgH, PROMPT_IMG_SCALE);

      this.promptImage.setPosition(this.questionBanner.x, this.questionBanner.y).setScale(scale);
      return;
    }

    this.promptImage?.setVisible(false);
    this.promptText.setVisible(true).setText(fallback);
  }

  /* ===================== RESET ===================== */

  private resetUiForNewTry() {
    this.feedbackText.setText('');
    this.draggingKey = undefined;
    this.draggingSide = undefined;
    this.dragLineEnd = undefined;
    this.draggingLine?.setVisible(false);
    this.wrongLine?.setVisible(false);
    this.wrongLineSeg = undefined;
    this.leftItems.forEach((i) => i.setAlpha(1));
    this.rightItems.forEach((i) => i.setAlpha(1));
    this.redrawConnections();
  }

  /* ===================== MATCH ===================== */

  private checkMatch(left: MatchKey, right: MatchKey) {
    if (this.gameState === 'LEVEL_END') return;
    this.gameState = 'CHECKING';
    this.destroyGuideHand();

    const leftImg = this.leftItems.find((i) => i.getData('matchKey') === left);
    const rightImg = this.rightItems.find((i) => i.getData('matchKey') === right);

    if (left === right) {
      AudioManager.play('sfx_correct');
      AudioManager.playCorrectAnswer();

      this.matched.add(left);
      this.score = this.matched.size;
      this.recordCorrect();

      leftImg?.disableInteractive().setAlpha(0.9);
      rightImg?.disableInteractive().setAlpha(0.9);

      this.draggingKey = undefined;
      this.draggingSide = undefined;
      this.dragLineEnd = undefined;
      this.draggingLine?.setVisible(false);
      this.wrongLine?.setVisible(false);

      if (leftImg && rightImg) {
        const line = this.add.image(0, 0, CONNECT_LINE_KEY).setOrigin(0.5).setDepth(LINE_DEPTH);
        this.matchedLines.set(left, line);
        this.ensureLineCaps(line);
      }
      this.redrawConnections();
      this.animateCorrect(leftImg, rightImg, this.matchedLines.get(left));

      if (this.matched.size >= LEFT_IDS.length) {
        this.gameState = 'LEVEL_END';
        this.saveProgress();
        this.finalizeAttempt();
        this.time.delayedCall(1000, () => {
          this.scene.start('EndGameScene', {
            lessonId: '',
            score: this.score,
            total: LEFT_IDS.length,
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

    const leftHole = leftImg ? this.getHoleWorldPoint(leftImg) : { x: 0, y: 0 };
    const rightHole = rightImg ? this.getHoleWorldPoint(rightImg) : { x: 0, y: 0 };
    const x1 = leftHole.x;
    const y1 = leftHole.y;
    const x2 = rightHole.x;
    const y2 = rightHole.y;
    this.wrongLineSeg = { x1, y1, x2, y2 };
    this.updateLineSprite(this.wrongLine, x1, y1, x2, y2);

    this.draggingKey = undefined;
    this.draggingSide = undefined;
    this.dragLineEnd = undefined;
    this.redrawConnections();
    this.animateWrong(leftImg, rightImg, this.wrongLine);

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
    for (const matchKey of this.matched) {
      const left = this.leftItems.find((i) => i.getData('matchKey') === matchKey);
      const right = this.rightItems.find((i) => i.getData('matchKey') === matchKey);
      const line = this.matchedLines.get(matchKey);
      if (!left || !right || !line) continue;
      const lh = this.getHoleWorldPoint(left);
      const rh = this.getHoleWorldPoint(right);
      this.updateLineSprite(line, lh.x, lh.y, rh.x, rh.y, LINE_END_EXTEND, LINE_END_EXTEND);
      line.setVisible(true).clearTint().setAlpha(1);
    }

    if (this.draggingKey && this.dragLineEnd && this.draggingLine) {
      const side = this.draggingSide ?? 'LEFT';
      const startItem =
        side === 'LEFT'
          ? this.leftItems.find((i) => i.getData('matchKey') === this.draggingKey)
          : this.rightItems.find((i) => i.getData('matchKey') === this.draggingKey);

      if (startItem) {
        const startHole = this.getHoleWorldPoint(startItem);
        this.updateLineSprite(
          this.draggingLine,
          startHole.x,
          startHole.y,
          this.dragLineEnd.x,
          this.dragLineEnd.y,
          LINE_DRAG_START_EXTEND,
          0,
        );
        this.draggingLine.setVisible(true).clearTint().setAlpha(0.85);
      }
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

  private getHoleWorldPoint(img: Phaser.GameObjects.Image) {
    const tex = this.textures.get(img.texture.key);
    const src = tex?.getSourceImage() as { width: number; height: number } | undefined;

    const srcW = src?.width ?? img.width ?? 1;
    const srcH = src?.height ?? img.height ?? 1;

    const side = img.getData('holeSide') as 'LEFT' | 'RIGHT' | undefined;
    const holeBox = side === 'LEFT' ? HOLE_BOX_LEFT : HOLE_BOX_RIGHT;

    const holeCenterX = holeBox.left + holeBox.width / 2;
    const holeCenterY = holeBox.top + holeBox.height / 2;

    const rx = holeCenterX / Math.max(1, srcW);
    const ry = holeCenterY / Math.max(1, srcH);

    const topLeftX = img.x - img.displayWidth / 2;
    const topLeftY = img.y - img.displayHeight / 2;

    return {
      x: topLeftX + rx * img.displayWidth,
      y: topLeftY + ry * img.displayHeight,
    };
  }
}
