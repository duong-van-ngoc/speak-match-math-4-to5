import Phaser from 'phaser';
import AudioManager from './AudioManager';
import { game as irukaGame } from "@iruka-edu/mini-game-sdk";
import { sdk } from "./main";

/* ===================== AUDIO GLOBAL FLAG ===================== */
// ✅ dùng window để nhớ “đã unlock audio” xuyên scene / replay
const AUDIO_UNLOCKED_KEY = '__audioUnlocked__';

/* ===================== TYPES ===================== */

type GameState = 'WAIT_DRAG' | 'LEVEL_END';
type SortDirection = 'ASC' | 'DESC';
type SortThemeId = 'TREE' | 'BUILDING' | 'BOOK' | 'BOY' | 'ANIMAL';
type SortVariant = 1 | 2 | 3;
type SortItemId = `${SortThemeId}_${SortVariant}`;

type SortLevelConfig = {
  id: number;
  direction: SortDirection;
  theme: SortThemeId;
  itemIds: SortItemId[];
};

type SortItemDef = {
  id: SortItemId;
  label: string;
  theme: SortThemeId;
  variant: SortVariant;
  rank: number; // lớn hơn = cao hơn
  tint: number;
};

type DraggableItem = {
  id: SortItemId;
  container: Phaser.GameObjects.Container;
  startIndex: number;

  // ✅ slotIndex bây giờ là "slot hàng trên" (slotCenters)
  slotIndex: number | null;
  prevSlotIndex: number | null;

  dragClampRect: Phaser.Geom.Rectangle;
  dragOffsetX: number;
  dragOffsetY: number; // ✅ NEW: kéo tự do cả X/Y
};

/* ===================== ASSETS ===================== */

const ASSET = {
  img: {
    board: 'banner_question',
    questionBanner: 'btn_primary_pressed',
    character: 'char',
    slotBg: 'answer_default',
    resultCorrect: 'result_correct',
    resultWrong: 'result_wrong',
    arrow: 'sort_arrow',
  },
  hint: {
    BOOK: 'sort_hint_book',
    ANIMAL: 'sort_hint_animal',
    BOY: 'sort_hint_boy',
    TREE: 'sort_hint_tree',
    BUILDING: 'sort_hint_building',
  } satisfies Record<SortThemeId, string>,
  voice: {
    BOOK: 'voice_sort_book',
    ANIMAL: 'voice_sort_animal',
    BOY: 'voice_sort_boy',
    TREE: 'voice_sort_tree',
    BUILDING: 'voice_sort_building',
  } satisfies Record<SortThemeId, string>,
  option: {
    top: {
      BOOK: ['sort_book_1_top', 'sort_book_2_top', 'sort_book_3_top'],
      ANIMAL: ['sort_animal_1_top', 'sort_animal_2_top', 'sort_animal_3_top'],
      BOY: ['sort_boy_1_top', 'sort_boy_2_top', 'sort_boy_3_top'],
      TREE: ['sort_tree_1_top', 'sort_tree_2_top', 'sort_tree_3_top'],
      BUILDING: ['sort_building_1_top', 'sort_building_2_top', 'sort_building_3_top'],
    } satisfies Record<SortThemeId, readonly [string, string, string]>,
    bottom: {
      BOOK: ['sort_book_1_bottom', 'sort_book_2_bottom', 'sort_book_3_bottom'],
      ANIMAL: ['sort_animal_1_bottom', 'sort_animal_2_bottom', 'sort_animal_3_bottom'],
      BOY: ['sort_boy_1_bottom', 'sort_boy_2_bottom', 'sort_boy_3_bottom'],
      TREE: ['sort_tree_1_bottom', 'sort_tree_2_bottom', 'sort_tree_3_bottom'],
      BUILDING: ['sort_building_1_bottom', 'sort_building_2_bottom', 'sort_building_3_bottom'],
    } satisfies Record<SortThemeId, readonly [string, string, string]>,
  },
  dom: {
    replayBtnBgUrl: 'assets/button/replay.png',
    nextBtnBgUrl: 'assets/button/next.png',
  },
  sfx: {
    click: 'sfx_click',
    correct: 'sfx_correct',
    wrong: 'sfx_wrong',
  },
} as const;

/* ===================== SORT CONTENT ===================== */

const SORT_THEMES = [
  { id: 'BOOK', label: 'Sách', tint: 0x7c4dff },
  { id: 'ANIMAL', label: 'Con vật', tint: 0x26c6da },
  { id: 'BOY', label: 'Cậu bé', tint: 0xffb300 },
  { id: 'TREE', label: 'Cây', tint: 0x66bb6a },
  { id: 'BUILDING', label: 'Tòa nhà', tint: 0xef5350 },
] as const satisfies ReadonlyArray<{ id: SortThemeId; label: string; tint: number }>;

// Helper function
const SORT_THEME_BY_ID = SORT_THEMES.reduce<Record<SortThemeId, (typeof SORT_THEMES)[number]>>((acc, theme) => {
  acc[theme.id] = theme;
  return acc;
}, {} as Record<SortThemeId, (typeof SORT_THEMES)[number]>);

const makeItemId = (theme: SortThemeId, variant: SortVariant): SortItemId => `${theme}_${variant}`;

const parseItemId = (id: SortItemId): { theme: SortThemeId; variant: SortVariant } => {
  const [themeRaw, variantRaw] = id.split('_') as [SortThemeId, string];
  const variant = Number(variantRaw) as SortVariant;
  return { theme: themeRaw, variant };
};

const getItemDef = (id: SortItemId): SortItemDef => {
  const { theme, variant } = parseItemId(id);
  const themeDef = SORT_THEME_BY_ID[theme];
  return {
    id,
    theme,
    variant,
    rank: variant,
    tint: themeDef.tint,
    label: `${themeDef.label} ${variant}`,
  };
};

/* ===================== SCALE ===================== */

const BOARD_SCALE = 1.0;

// Taller board, less wide
const BASE_BOARD_WIDTH = 790;
const BASE_BOARD_HEIGHT = 580;

const BOARD_WIDTH = BASE_BOARD_WIDTH * BOARD_SCALE;
const BOARD_HEIGHT = BASE_BOARD_HEIGHT * BOARD_SCALE;

/* ===================== LAYOUT ===================== */

const BANNER_Y = 60;
const BANNER_SCALE = 0.5;
const BANNER_MIN_WIDTH_RATIO = 0.72; // thu ngắn banner, không thu nhỏ chữ

const HINT_IMAGE_OFFSET_BY_THEME: Partial<Record<SortThemeId, { x: number; y: number }>> = {
  BOOK: { x: 0, y: -5 },
  TREE: { x: 0, y: -5 },
  BUILDING: { x: 0, y: -5 },
};

const HINT_IMAGE_SCALE_MULTIPLIER_BY_THEME: Partial<Record<SortThemeId, number>> = {
  BOOK: 0.9,
  ANIMAL: 0.9,
  BOY: 0.9,
  TREE: 0.9,
  BUILDING: 0.9,
};

const BOARD_GAP_FROM_BANNER = 30;
const BOARD_OFFSET_X = 90;
const BOARD_OFFSET_Y = -20;

const TOP_ROW_Y_RATIO = 0.3;
const BOTTOM_ROW_Y_RATIO = 0.85;
const ARROW_Y_RATIO = 0.5;

const PROMPT_FONT_SIZE = 30;
const FEEDBACK_FONT_SIZE = 22;
const FEEDBACK_BOTTOM_MARGIN = 40;

const BOARD_RESULT_MARGIN_X = 26;
const BOARD_RESULT_MARGIN_Y = 26;

const RESULT_BADGE_SCALE = 0.75 * BOARD_SCALE;

/* ===================== ALIGN ===================== */

const BOARD_INNER_PADDING_X = 40 * BOARD_SCALE;
const BOARD_INNER_PADDING_TOP = 26 * BOARD_SCALE;
const BOARD_INNER_PADDING_BOTTOM = 26 * BOARD_SCALE;

/* ===================== CHAR OFFSET ===================== */

const CHAR_OFFSET_X = -140;
const CHAR_OFFSET_Y = 12;

const DRAG_BOARD_PADDING = 10 * BOARD_SCALE;

// ✅ HITBOX RỘNG: chạm vào toàn bộ item đều kéo được
const HITAREA_PADDING = 10 * BOARD_SCALE;

// ✅ DỊCH HITBOX: sang phải + xuống dưới (tùy chỉnh)
const HITBOX_OFFSET_X = 40 * BOARD_SCALE;
const HITBOX_OFFSET_Y = 110 * BOARD_SCALE;

// Scale target for real images
const IMAGE_TARGET_SCALE = 1.15;

/* ===================== SCENE ===================== */

export default class GameScene extends Phaser.Scene {
  public levels: SortLevelConfig[] = [];
  public levelIndex = 0;
  public score = 0;
  public level = 0;

  public subgameEntered = false;
  public subgameDone = false;

  private gameState: GameState = 'WAIT_DRAG';

  private board?: Phaser.GameObjects.Image;
  private questionBanner!: Phaser.GameObjects.Image;
  private promptText!: Phaser.GameObjects.Text;
  private feedbackText!: Phaser.GameObjects.Text;
  private hintImage?: Phaser.GameObjects.Image;

  private cornerCharacter?: Phaser.GameObjects.Image;
  private resultBadge!: Phaser.GameObjects.Image;

  private directionArrow?: Phaser.GameObjects.Graphics;
  private directionArrowImage?: Phaser.GameObjects.Image;
  private referenceItems: Phaser.GameObjects.Container[] = [];

  private boardX = 0;
  private boardY = 0;

  private currentDirection: SortDirection = 'ASC'; // ✅ mặc định ASC
  private currentLevelItemIds: SortItemId[] = [];
  private currentTheme: SortThemeId = 'BUILDING';
  private currentVoiceId?: string;

  private levelVoicePlayed = false;
  private voiceCooldownUntil = 0;
  private readonly VOICE_COOLDOWN_MS = 1200;

  private slotSize = 110 * BOARD_SCALE;
  private slots: Phaser.GameObjects.Image[] = [];
  private slotCenters: Array<{ x: number; y: number }> = [];
  private startCenters: Array<{ x: number; y: number }> = [];
  private slotAssignments: Array<DraggableItem | null> = [];
  private draggableItems: DraggableItem[] = [];
  private itemByContainer = new Map<Phaser.GameObjects.Container, DraggableItem>();
  private imageScaleCache = new Map<string, number>();
  private isDragging = false;

  // ✅ NEW: tránh queue sound khi chưa unlock xong
  private audioReady = false;

  /* ===================== HINT UNIFORM SCALE ===================== */
  // ✅ 1 scale CHUNG cho tất cả hint (để ảnh chữ dài/ngắn không bị nhỏ/to khác nhau)
  private hintUniformScale = 1;
  private hintUniformScaleReady = false;

  constructor() {
    super('GameScene');
  }

  init(data: { levelIndex?: number; score?: number; keepLevels?: boolean; startIndex?: number } = {}) {
    this.levelIndex = data.levelIndex ?? 0;
    this.level = this.levelIndex;
    this.score = data.score ?? 0;

    this.subgameEntered = false;
    this.subgameDone = false;

    this.hintImage = undefined;
    this.currentVoiceId = undefined;

    this.levelVoicePlayed = false;
    this.voiceCooldownUntil = 0;

    this.slots = [];
    this.slotCenters = [];
    this.startCenters = [];
    this.slotAssignments = [];
    this.draggableItems = [];
    this.referenceItems = [];
    this.itemByContainer.clear();
    this.isDragging = false;

    // ✅ NEW: sync theo flag global
    this.audioReady = !!(window as any)[AUDIO_UNLOCKED_KEY];

    // ✅ reset uniform hint scale mỗi lần init (để layout/resize tính lại đúng)
    this.hintUniformScale = 1;
    this.hintUniformScaleReady = false;

    const globalKey = '__sortHeightLevels__';
    const totalLevels = 5;
    const savedState = (window as any)[globalKey] as { levels?: SortLevelConfig[] } | undefined;
    const hasValidSavedLevels =
      savedState?.levels?.length === totalLevels &&
      savedState.levels.every(
        (lvl) =>
          typeof (lvl as any).theme === 'string' &&
          Array.isArray((lvl as any).itemIds) &&
          (lvl as any).itemIds.length === 3,
      );

    const keepLevels = !!data.keepLevels;
    const shouldGenerateLevels = !hasValidSavedLevels || (!keepLevels && this.levelIndex === 0);

    if (shouldGenerateLevels) {
      const levels = this.generateLevels(totalLevels);
      this.levels = levels;
      (window as any)[globalKey] = { levels };
    } else {
      this.levels = savedState!.levels!;
    }

    const requestedStartIndex = Number.isFinite(data.startIndex) ? Math.floor(data.startIndex as number) : null;
    if (requestedStartIndex !== null && this.levels.length > 0) {
      const n = this.levels.length;
      const start = ((requestedStartIndex % n) + n) % n;
      if (start !== 0) {
        const rotated = [...this.levels.slice(start), ...this.levels.slice(0, start)];
        this.levels = rotated;
        (window as any)[globalKey] = { levels: rotated };
      }
    }
  }

  create() {
    // SDK: set tổng số level cho gamehub
    irukaGame.setTotal(5); // hoặc this.levels.length nếu đã có
    (window as any).irukaGameState = {
      startTime: Date.now(),
      currentScore: 0,
    };
    // ✅ iOS/Android: unlock + phát BGM + phát voice lần đầu sau gesture
    this.input.once('pointerdown', async () => {
      // ✅ FIX: nhớ trạng thái trước khi unlock (để replay không force voice lần nữa)
      const wasUnlocked = !!(window as any)[AUDIO_UNLOCKED_KEY];

      try {
        if (!wasUnlocked) {
          // ✅ await để không “miss” và không queue (đặc biệt khi dragstart ngay lập tức)
          await AudioManager.unlockAndWarmup(['sfx_click', 'sfx_correct', 'sfx_wrong', 'bgm_main']);
          (window as any)[AUDIO_UNLOCKED_KEY] = true;
        }

        this.audioReady = true;

        // ✅ chỉ bật bgm 1 lần thôi (kể cả replay/scene recreate)
        if (!AudioManager.isPlaying('bgm_main')) {
          AudioManager.play('bgm_main');
        }

        // ✅ CHỈ force voice khi vừa unlock lần đầu
        // replay: startLevel() đã play voice rồi => click màn hình không phát lại nữa
        if (!wasUnlocked) {
          this.playVoiceForLevel(true);
        }
      } catch (e) {
        console.warn('[Audio] unlock/play failed', e);
      }
    });

    try {
      (window as any).setRandomGameViewportBg?.();
    } catch {}

    const { width, height } = this.scale;
    if ((window as any).setGameButtonsVisible) (window as any).setGameButtonsVisible(true);
    if ((window as any).setRandomGameViewportBg) (window as any).setRandomGameViewportBg();

    const replayBtnEl = document.getElementById('btn-replay') as HTMLButtonElement | null;
    const nextBtnEl = document.getElementById('btn-next') as HTMLButtonElement | null;

    const setBtnBgFromUrl = (el: HTMLButtonElement | null, url?: string) => {
      if (!el || !url) return;
      el.style.backgroundImage = `url("${url}")`;
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundPosition = 'center';
      el.style.backgroundSize = 'contain';
    };

    setBtnBgFromUrl(replayBtnEl, ASSET.dom.replayBtnBgUrl);
    setBtnBgFromUrl(nextBtnEl, ASSET.dom.nextBtnBgUrl);

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.setCanvasCursor('default');
    this.input.setTopOnly(true);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stopGuideVoice();
      this.currentVoiceId = undefined;
    });

    this.board = this.add.image(0, 0, ASSET.img.board).setOrigin(0.5).setDisplaySize(BOARD_WIDTH, BOARD_HEIGHT);

    this.questionBanner = this.add
      .image(width / 2, BANNER_Y, ASSET.img.questionBanner)
      .setOrigin(0.5)
      .setScale(BANNER_SCALE * BOARD_SCALE)
      .setDepth(20);

 // Cập nhật lại vị trí của promptText để căn giữa theo chiều dọc trong banner
this.promptText = this.add.text(this.questionBanner.x, this.questionBanner.y, '', {
  fontFamily: 'Fredoka, Arial',
  fontSize: `${PROMPT_FONT_SIZE}px`,
  color: '#ffffff',
  align: 'center',
  wordWrap: { width: this.questionBanner.displayWidth * 0.82, useAdvancedWrap: true },
})
  .setOrigin(0.5)
  .setDepth(21);

// Cập nhật lại vị trí của feedbackText để căn giữa đúng với vị trí của banner
this.feedbackText = this.add.text(this.questionBanner.x, this.questionBanner.y + this.questionBanner.displayHeight / 2 , '', {
  fontFamily: 'Fredoka, Arial',
  fontSize: `${FEEDBACK_FONT_SIZE}px`,
  color: '#ffffff',
})
  .setOrigin(0.5);


    this.resultBadge = this.add
      .image(0, 0, ASSET.img.resultCorrect)
      .setOrigin(1, 1)
      .setScale(RESULT_BADGE_SCALE)
      .setVisible(false)
      .setDepth(12);

    this.directionArrow = this.add.graphics().setDepth(9);
    this.directionArrowImage = this.add.image(0, 0, ASSET.img.arrow).setOrigin(0.5).setDepth(9).setVisible(false);

    const baseCharScale = height / 720;
    this.cornerCharacter = this.add
      .image(-40, 0, ASSET.img.character)
      .setOrigin(0.5, 1)
      .setScale(baseCharScale * 0.55)
      .setDepth(15);

    this.tweens.add({
      targets: this.cornerCharacter,
      y: '-=10',
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    this.input.on('dragstart', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!(gameObject instanceof Phaser.GameObjects.Container)) return;
      if (this.gameState !== 'WAIT_DRAG') return;
      const item = this.itemByContainer.get(gameObject);
      if (!item) return;

      this.stopGuideVoice();

      this.isDragging = true;
      this.setCanvasCursor('grabbing');

      item.prevSlotIndex = item.slotIndex;
      item.dragOffsetX = pointer.worldX - gameObject.x;
      item.dragOffsetY = pointer.worldY - gameObject.y;

      // ✅ nếu đang nằm trên slot hàng trên -> nhấc lên thì slot đó trống
      if (item.slotIndex !== null) {
        this.slotAssignments[item.slotIndex] = null;
        item.slotIndex = null;
      }

      gameObject.setDepth(50);

      // ✅ IMPORTANT: chỉ play click khi audioReady (tránh queue -> iOS xả dồn)
      if (this.audioReady) {
        AudioManager.play(ASSET.sfx.click);
      }
    });

    this.input.on(
      'drag',
      (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
        void dragX;
        void dragY;
        if (!(gameObject instanceof Phaser.GameObjects.Container)) return;
        if (this.gameState !== 'WAIT_DRAG') return;
        const item = this.itemByContainer.get(gameObject);
        if (!item) return;

        const x = pointer.worldX - item.dragOffsetX;
        const y = pointer.worldY - item.dragOffsetY;

        const p = this.clampToBoard(x, y, item);
        gameObject.setPosition(p.x, p.y);
      },
    );

    this.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      void pointer;
      if (!(gameObject instanceof Phaser.GameObjects.Container)) return;
      const item = this.itemByContainer.get(gameObject);
      if (!item) return;

      this.isDragging = false;
      this.setCanvasCursor('default');
      if (this.gameState !== 'WAIT_DRAG') {
        this.restoreToPreviousPosition(item);
        return;
      }

      if (!this.trySnapToNearestSlot(item)) {
        this.restoreToPreviousPosition(item);
      }

      gameObject.setDepth(30);
      this.maybeCheckOrderComplete();
    });

    this.layoutBoard();
    this.startLevel();
    // SDK: gửi score và progress ban đầu
    sdk.score(this.score, 0);
    sdk.progress({ levelIndex: 0, total: this.levels.length });
  }

  private setCanvasCursor(cursor: string) {
    try {
      this.sys.game.canvas.style.cursor = cursor;
    } catch {}
  }

  private stopGuideVoice() {
    if (!this.currentVoiceId) return;
    AudioManager.stopSound(this.currentVoiceId);
  }

  private getContainerVisualRectLocal(container: Phaser.GameObjects.Container): Phaser.Geom.Rectangle {
    const bounds = container.getBounds(); // world-space
    const w = bounds.width || this.slotSize;
    const h = bounds.height || this.slotSize;
    return new Phaser.Geom.Rectangle(bounds.x - container.x, bounds.y - container.y, w, h);
  }

  // ✅ HITBOX: cap không đè nhau + dịch sang phải/xuống dưới
  private setDragHitArea(container: Phaser.GameObjects.Container, padding = HITAREA_PADDING): Phaser.Geom.Rectangle {
    const visual = this.getContainerVisualRectLocal(container);

    const rect = Phaser.Geom.Rectangle.Clone(visual);
    rect.x -= padding;
    rect.y -= padding;
    rect.width += padding * 2;
    rect.height += padding * 2;

    // cap width để không đè slot bên cạnh
    const maxW = this.slotSize * 1.5;
    if (rect.width > maxW) {
      rect.width = maxW;
      rect.x = -rect.width / 2;
    }

    // (tuỳ chọn) cap height cho gọn
    const maxH = this.slotSize * 1.5;
    if (rect.height > maxH) {
      rect.height = maxH;
      rect.y = -rect.height / 2;
    }

    // ✅ shift hitbox
    rect.x += HITBOX_OFFSET_X;
    rect.y += HITBOX_OFFSET_Y;

    if (!(container.scene as any)?.sys) return rect;

    container.setSize(rect.width, rect.height);
    container.setInteractive(rect, Phaser.Geom.Rectangle.Contains);
    return rect;
  }

  private clampToBoard(x: number, y: number, item: DraggableItem): { x: number; y: number } {
    const hitArea = item.dragClampRect;

    if (hitArea instanceof Phaser.Geom.Rectangle) {
      const minX = this.boardX - BOARD_WIDTH / 2 + DRAG_BOARD_PADDING - hitArea.x;
      const maxX = this.boardX + BOARD_WIDTH / 2 - DRAG_BOARD_PADDING - (hitArea.x + hitArea.width);
      const minY = this.boardY - BOARD_HEIGHT / 2 + DRAG_BOARD_PADDING - hitArea.y;
      const maxY = this.boardY + BOARD_HEIGHT / 2 - DRAG_BOARD_PADDING - (hitArea.y + hitArea.height);

      return {
        x: Phaser.Math.Clamp(x, minX, maxX),
        y: Phaser.Math.Clamp(y, minY, maxY),
      };
    }

    const bounds = item.container.getBounds();
    const halfW = (bounds.width || this.slotSize) / 2;
    const halfH = (bounds.height || this.slotSize) / 2;

    const minX = this.boardX - BOARD_WIDTH / 2 + DRAG_BOARD_PADDING + halfW;
    const maxX = this.boardX + BOARD_WIDTH / 2 - DRAG_BOARD_PADDING - halfW;
    const minY = this.boardY - BOARD_HEIGHT / 2 + DRAG_BOARD_PADDING + halfH;
    const maxY = this.boardY + BOARD_HEIGHT / 2 - DRAG_BOARD_PADDING - halfH;

    return {
      x: Phaser.Math.Clamp(x, minX, maxX),
      y: Phaser.Math.Clamp(y, minY, maxY),
    };
  }

  /* ===================== BANNER SIZE NORMALIZE (UNIFORM) ===================== */

  // ✅ tính 1 scale CHUNG cho tất cả hint (để ảnh chữ dài/ngắn không bị nhỏ/to khác nhau)
  private computeHintUniformScale() {
    const banner = this.questionBanner;

    // ✅ Tính theo kích thước banner "gốc" (scale đều X/Y), để việc thu ngắn banner (scaleX)
    // không làm chữ bị tự thu nhỏ theo.
    const baseScale = BANNER_SCALE * BOARD_SCALE;
    const baseBannerW = banner.width * baseScale;
    const baseBannerH = banner.height * baseScale;

    const targetH = baseBannerH * 0.62; // mục tiêu hiển thị theo chiều cao
    const maxAllowedW = baseBannerW * 0.82; // clamp theo bề ngang banner

    const hintKeys = Object.values(ASSET.hint) as string[];

    let maxTexW = 0;
    let maxTexH = 0;

    for (const key of hintKeys) {
      if (!this.textures.exists(key)) continue;
      const tex = this.textures.get(key);
      const src = tex.getSourceImage() as any;

      const w = (src?.width as number | undefined) ?? 0;
      const h = (src?.height as number | undefined) ?? 0;

      if (w > maxTexW) maxTexW = w;
      if (h > maxTexH) maxTexH = h;
    }

    if (!maxTexW || !maxTexH) {
      this.hintUniformScale = 1;
      this.hintUniformScaleReady = true;
      return;
    }

    const scaleByH = targetH / maxTexH;
    const scaleByW = maxAllowedW / maxTexW;

    this.hintUniformScale = Math.min(scaleByH, scaleByW);
    this.hintUniformScaleReady = true;
  }

  private applyHintUniformScale(img: Phaser.GameObjects.Image) {
    if (!this.hintUniformScaleReady) this.computeHintUniformScale();
    const mult = HINT_IMAGE_SCALE_MULTIPLIER_BY_THEME[this.currentTheme] ?? 1;
    img.setScale(this.hintUniformScale * mult);
  }

  private resetBannerScale() {
    const s = BANNER_SCALE * BOARD_SCALE;
    this.questionBanner.setScale(s, s);
  }

  private fitBannerWidthToDisplayedContent(displayW: number) {
    const baseScale = BANNER_SCALE * BOARD_SCALE;
    const texW = this.questionBanner.width || 1;
    const maxBannerW = texW * baseScale;
    const minBannerW = maxBannerW * BANNER_MIN_WIDTH_RATIO;

    if (!displayW) return;

    // 0.82 = content chiếm ~82% bề ngang banner (đồng bộ với computeHintUniformScale)
    const desiredBannerW = Phaser.Math.Clamp(displayW / 0.82, minBannerW, maxBannerW);
    const scaleX = desiredBannerW / texW;
    this.questionBanner.setScale(scaleX, baseScale);
  }

  private fitBannerWidthToHint() {
    if (!this.hintImage || !this.hintImage.visible) return;
    this.fitBannerWidthToDisplayedContent(this.hintImage.displayWidth || 0);
  }

  private positionHintInBanner() {
    if (!this.hintImage) return;
    const bx = this.questionBanner.x;
    const by = this.questionBanner.y;
    const offset = HINT_IMAGE_OFFSET_BY_THEME[this.currentTheme] ?? { x: 0, y: 0 };
    this.hintImage.setPosition(bx + offset.x, by + offset.y);
  }

  /* ===================== LAYOUT ===================== */

  private layoutBoard() {
    const { width } = this.scale;

    // ✅ Banner luôn căn giữa màn game (không đi theo boardX nữa)
    const bannerX = width / 2;

    // board vẫn giữ offset như logic cũ
    this.boardX = width / 2 + BOARD_OFFSET_X;

    // Cập nhật vị trí của banner và các đối tượng văn bản
    this.questionBanner.setPosition(bannerX, BANNER_Y);
    this.resetBannerScale();
    // Căn giữa promptText đúng tâm questionBanner (cả X và Y)
    this.promptText.setPosition(this.questionBanner.x, this.questionBanner.y);
    this.promptText.setWordWrapWidth(this.questionBanner.displayWidth * 0.82, true);

    // ✅ mỗi lần layout/resize, tính lại uniform scale theo banner gốc (không phụ thuộc scaleX)
    this.hintUniformScaleReady = false;
    this.computeHintUniformScale();

    if (this.hintImage) {
      this.positionHintInBanner();
      if (this.hintImage.visible) {
        this.applyHintUniformScale(this.hintImage);
        this.positionHintInBanner();
        this.fitBannerWidthToHint(); // thu ngắn banner theo chữ, không đổi scale chữ
        this.positionHintInBanner();
      }
    }

    const bannerBottom = this.questionBanner.y + this.questionBanner.displayHeight / 2;
    this.boardY = bannerBottom + BOARD_GAP_FROM_BANNER + BOARD_HEIGHT / 2 + BOARD_OFFSET_Y;

    this.board?.setPosition(this.boardX, this.boardY);

    const topEdge = this.boardY - BOARD_HEIGHT / 2;
    const bottomEdge = this.boardY + BOARD_HEIGHT / 2;

    this.layoutSlotsAndStarts(topEdge, bottomEdge);
    this.drawDirectionArrow();
    this.refreshDraggableHitAreas();

    // Căn giữa feedbackText với board (theo trục X của banner)
    this.feedbackText.setPosition(bannerX, this.boardY + BOARD_HEIGHT / 2 - FEEDBACK_BOTTOM_MARGIN);

    if (this.cornerCharacter) {
      const leftEdge = this.boardX - BOARD_WIDTH / 2;
      this.cornerCharacter.setPosition(leftEdge + CHAR_OFFSET_X, bottomEdge + CHAR_OFFSET_Y);
    }

    this.resultBadge.setPosition(this.boardX + BOARD_WIDTH / 2 - BOARD_RESULT_MARGIN_X, bottomEdge - BOARD_RESULT_MARGIN_Y);
  }

  private refreshDraggableHitAreas() {
    if (!this.draggableItems.length) return;

    for (const item of this.draggableItems) {
      const c = item.container;

      if (!(c.scene as any)?.sys) continue;
      if (!c.active) continue;

      const input = c.input as Phaser.Types.Input.InteractiveObject | undefined;
      if (input && !input.enabled) continue;

      const rect = this.setDragHitArea(c);
      item.dragClampRect = Phaser.Geom.Rectangle.Clone(rect);

      (c.input as Phaser.Types.Input.InteractiveObject).cursor = 'grab';
      this.input.setDraggable(c);
    }
  }

  private layoutSlotsAndStarts(topEdge: number, bottomEdge: number) {
    const innerTop = topEdge + BOARD_INNER_PADDING_TOP;
    const innerBottom = bottomEdge - BOARD_INNER_PADDING_BOTTOM;
    const innerH = innerBottom - innerTop;

    const slotsY = innerTop + innerH * TOP_ROW_Y_RATIO;
    const startsY = innerTop + innerH * BOTTOM_ROW_Y_RATIO;

    const usableW = BOARD_WIDTH - BOARD_INNER_PADDING_X * 2;
    const slotCount = this.currentLevelItemIds.length || 3;
    const gap = 26 * BOARD_SCALE;
    const maxSize = 200 * BOARD_SCALE;
    const size = Math.min(maxSize, (usableW - gap * (slotCount - 1)) / slotCount);
    this.slotSize = size;

    const totalW = slotCount * size + (slotCount - 1) * gap;
    const startX = this.boardX - totalW / 2 + size / 2;

    this.slotCenters = Array.from({ length: slotCount }, (_, i) => ({ x: startX + i * (size + gap), y: slotsY }));
    this.startCenters = Array.from({ length: slotCount }, (_, i) => ({ x: startX + i * (size + gap), y: startsY }));

    this.slots.forEach((slot, i) => {
      const c = this.startCenters[i];
      if (!c) return;
      slot.setPosition(c.x, c.y);
      slot.setDisplaySize(size, size);
    });

    this.referenceItems.forEach((ref, i) => {
      const c = this.slotCenters[i];
      if (!c) return;
      ref.setPosition(c.x, c.y);
    });

    // ✅ item nếu đã đặt lên slot trên -> bám slotCenters, còn không -> nằm hàng dưới startCenters
    this.draggableItems.forEach((item) => {
      if (item.slotIndex !== null) {
        const c = this.slotCenters[item.slotIndex];
        if (c) item.container.setPosition(c.x, c.y);
        return;
      }
      const start = this.startCenters[item.startIndex] ?? this.startCenters[0];
      if (start) item.container.setPosition(start.x, start.y);
    });
  }

  private drawDirectionArrow() {
    if (!this.directionArrow) return;

    const canUseArrowImage = !!this.directionArrowImage && this.textures.exists(ASSET.img.arrow);
    if (canUseArrowImage) {
      this.directionArrow.clear();
      this.directionArrow.setVisible(false);
      this.directionArrowImage!.setVisible(true);

      if (this.slotCenters.length < 2) return;

      const innerTop = this.boardY - BOARD_HEIGHT / 2 + BOARD_INNER_PADDING_TOP;
      const innerBottom = this.boardY + BOARD_HEIGHT / 2 - BOARD_INNER_PADDING_BOTTOM;
      const innerH = innerBottom - innerTop;
      const midY = innerTop + innerH * ARROW_Y_RATIO;
      const leftX = this.slotCenters[0].x - this.slotSize / 2;
      const rightX = this.slotCenters[this.slotCenters.length - 1].x + this.slotSize / 2;

      const padding = 10 * BOARD_SCALE;
      const startX = leftX + padding;
      const endX = rightX - padding;

      const arrow = this.directionArrowImage!;
      arrow.setPosition((startX + endX) / 2, midY);
      const desiredW = Math.abs(endX - startX);
      const texW = arrow.width || 1;

      const baseYScale = 1 * BOARD_SCALE;
      arrow.setScale(desiredW / texW, baseYScale);

      // ✅ luôn 1 chiều (trái -> phải)
      arrow.setFlipX(false);
      return;
    }

    if (this.directionArrowImage) this.directionArrowImage.setVisible(false);
    this.directionArrow.setVisible(true);
    this.directionArrow.clear();

    if (this.slotCenters.length < 2) return;

    const innerTop = this.boardY - BOARD_HEIGHT / 2 + BOARD_INNER_PADDING_TOP;
    const innerBottom = this.boardY + BOARD_HEIGHT / 2 - BOARD_INNER_PADDING_BOTTOM;
    const innerH = innerBottom - innerTop;
    const midY = innerTop + innerH * ARROW_Y_RATIO;
    const leftX = this.slotCenters[0].x - this.slotSize / 2;
    const rightX = this.slotCenters[this.slotCenters.length - 1].x + this.slotSize / 2;

    const padding = 10 * BOARD_SCALE;
    const startX = leftX + padding;
    const endX = rightX - padding;

    // ✅ luôn trái -> phải
    const fromX = startX;
    const toX = endX;

    const lineColor = 0xff4d4d;
    const thickness = 4 * BOARD_SCALE;

    this.directionArrow.lineStyle(thickness, lineColor, 1);
    this.directionArrow.beginPath();
    this.directionArrow.moveTo(fromX, midY);
    this.directionArrow.lineTo(toX, midY);
    this.directionArrow.strokePath();

    const headSize = 14 * BOARD_SCALE;
    const headHeight = 8 * BOARD_SCALE;

    this.directionArrow.fillStyle(lineColor, 1);
    this.directionArrow.fillTriangle(toX, midY, toX - headSize, midY - headHeight, toX - headSize, midY + headHeight);
  }

  private getCachedImageScale(theme: SortThemeId, kind: 'ghost' | 'solid', size: number): number | null {
    const cacheKey = `${theme}_${kind}_${Math.round(size)}`;
    const cached = this.imageScaleCache.get(cacheKey);
    if (typeof cached === 'number') return cached;

    const keys = kind === 'ghost' ? ASSET.option.top[theme] : ASSET.option.bottom[theme];
    const target = size * IMAGE_TARGET_SCALE;

    let maxMaxDim = 0;
    for (const key of keys) {
      if (!this.textures.exists(key)) continue;
      const tex = this.textures.get(key);
      const src = tex.getSourceImage() as any;
      const w = (src?.width as number | undefined) ?? 0;
      const h = (src?.height as number | undefined) ?? 0;
      maxMaxDim = Math.max(maxMaxDim, w, h);
    }

    if (!maxMaxDim) return null;
    const scale = target / maxMaxDim;
    this.imageScaleCache.set(cacheKey, scale);
    return scale;
  }

  private createBuildingChildren(def: SortItemDef, size: number, kind: 'ghost' | 'solid'): Phaser.GameObjects.GameObject[] {
    const variantIdx = Math.max(0, Math.min(2, def.variant - 1));
    const imageKey = kind === 'ghost' ? ASSET.option.top[def.theme][variantIdx] : ASSET.option.bottom[def.theme][variantIdx];

    if (imageKey && this.textures.exists(imageKey)) {
      const bottomY = size * 0.42;
      const img = this.add.image(0, bottomY + 6 * BOARD_SCALE, imageKey).setOrigin(0.5, 1);

      const scale = this.getCachedImageScale(def.theme, kind, size);
      if (scale) img.setScale(scale);
      else {
        const maxDim = Math.max(img.width || 1, img.height || 1);
        const target = size * IMAGE_TARGET_SCALE;
        img.setScale(target / maxDim);
      }

      img.setAlpha(kind === 'ghost' ? 0.35 : 1);
      return [img];
    }

    const maxRank = 3;
    const t = (def.rank - 1) / (maxRank - 1);

    const minH = size * 0.42;
    const maxH = size * 0.92;
    const height = Phaser.Math.Linear(minH, maxH, t);

    const bottomY = size * 0.34;
    const width = size * 0.44;

    const mainColor = kind === 'ghost' ? 0xb0c4de : def.tint;
    const alpha = kind === 'ghost' ? 0.22 : 0.95;

    if (kind === 'ghost') {
      const silhouette = this.add.rectangle(0, bottomY, width, height, mainColor).setOrigin(0.5, 1).setAlpha(alpha);
      return [silhouette];
    }

    const base = this.add.rectangle(0, bottomY + 6 * BOARD_SCALE, width * 1.2, 10 * BOARD_SCALE, 0x0b1d35).setAlpha(0.55);
    const body = this.add.rectangle(0, bottomY, width, height, mainColor).setOrigin(0.5, 1).setAlpha(alpha);

    const roof = this.add
      .triangle(0, bottomY - height, -width * 0.55, 0, 0, -height * 0.22, width * 0.55, 0, 0x0b1d35)
      .setAlpha(0.35);

    const windowColor = 0xffffff;
    const windowAlpha = 0.18;
    const windowW = width * 0.14;
    const windowH = height * 0.12;
    const cols = 2;
    const rows = 3;
    const gridTop = bottomY - height * 0.2;
    const gridBottom = bottomY - height * 0.85;
    const gridH = gridTop - gridBottom;
    const colGap = width * 0.18;
    const rowGap = rows <= 1 ? 0 : (gridH - rows * windowH) / (rows - 1);

    const windows: Phaser.GameObjects.Rectangle[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c === 0 ? -1 : 1) * (colGap / 2);
        const y = gridTop - r * (windowH + rowGap);
        windows.push(this.add.rectangle(x, y, windowW, windowH, windowColor).setAlpha(windowAlpha));
      }
    }

    const shine = this.add.rectangle(-width * 0.18, bottomY - height * 0.55, width * 0.12, height * 0.7, 0xffffff).setAlpha(0.14);

    return [base, body, roof, shine, ...windows];
  }

  /* ===================== LEVEL GEN ===================== */

  private generateLevels(numLevels: number): SortLevelConfig[] {
    // ✅ luôn 1 chiều theo mũi tên (ASC)
    const direction: SortDirection = 'ASC';
    const themes = Phaser.Utils.Array.Shuffle(SORT_THEMES.map((x) => x.id));

    return Array.from({ length: numLevels }, (_, i) => ({
      id: i + 1,
      direction,
      theme: themes[i % themes.length],
      itemIds: [makeItemId(themes[i % themes.length], 1), makeItemId(themes[i % themes.length], 2), makeItemId(themes[i % themes.length], 3)],
    }));
  }

  /* ===================== START LEVEL ===================== */

  private startLevel() {
    if (this.levelIndex >= this.levels.length) {
      this.scene.start('EndGameScene', { score: this.score, total: this.levels.length });
      return;
    }

    this.subgameEntered = true;
    this.subgameDone = false;
    this.gameState = 'WAIT_DRAG';

    this.levelVoicePlayed = false;

    const level = this.levels[this.levelIndex];
    this.currentDirection = level.direction; // vẫn giữ logic direction, nhưng level gen đã là ASC
    this.currentTheme = level.theme ?? 'BUILDING';
    this.currentLevelItemIds =
      level.itemIds?.length === 3 ? level.itemIds : [makeItemId(this.currentTheme, 1), makeItemId(this.currentTheme, 2), makeItemId(this.currentTheme, 3)];

    this.resetUiForNewTry();
    this.clearLevelObjects();
    this.layoutBoard();
    this.buildSortLevel();

    this.updateHintForLevel();

    // ✅ chỉ phát voice nếu audio đã unlock
    if (this.audioReady) {
      this.playVoiceForLevel();
    }
  }

private updateHintForLevel() {
  const themeLabel = SORT_THEME_BY_ID[this.currentTheme]?.label ?? 'Tòa nhà';
  const fallback = `SẮP XẾP ${themeLabel.toUpperCase()} THEO HƯỚNG MŨI TÊN!`;
  const hintKey = ASSET.hint[this.currentTheme];

  if (this.hintImage && !(this.hintImage.scene as any)?.sys) {
    this.hintImage = undefined;
  }

  if (hintKey && this.textures.exists(hintKey)) {
    this.promptText.setVisible(false);

    const bx = this.questionBanner.x;
    const by = this.questionBanner.y;

    if (!this.hintImage) this.hintImage = this.add.image(bx, by, hintKey).setOrigin(0.5).setDepth(21);
    else this.hintImage.setTexture(hintKey).setVisible(true);

    this.resetBannerScale();
    this.hintUniformScaleReady = false;
    this.computeHintUniformScale();

    // Áp dụng uniform scale nếu cần
    this.applyHintUniformScale(this.hintImage);
    this.positionHintInBanner();
    this.fitBannerWidthToHint(); // thu ngắn banner theo chữ, không đổi scale chữ
    this.positionHintInBanner();
    return;
  }

  // Nếu không có hint, hiển thị text fallback
  if (this.hintImage) this.hintImage.setVisible(false);
  this.resetBannerScale();
  this.promptText.setPosition(this.questionBanner.x, this.questionBanner.y);
  this.promptText.setWordWrapWidth(this.questionBanner.displayWidth * 0.82, true);
  this.promptText.setVisible(true).setText(fallback);
}



  private playVoiceForLevel(force = false) {
    const voiceId = ASSET.voice[this.currentTheme];
    if (!voiceId) return;

    const now = this.time?.now ?? Date.now();

    if (!force) {
      if (this.levelVoicePlayed) return;
      if (now < this.voiceCooldownUntil) return;
    }

    this.levelVoicePlayed = true;
    this.voiceCooldownUntil = now + this.VOICE_COOLDOWN_MS;

    this.stopGuideVoice();
    this.currentVoiceId = voiceId;

    if (this.audioReady) {
      AudioManager.play(voiceId);
    }
  }

  private resetUiForNewTry() {
    this.resultBadge.setVisible(false);
    this.feedbackText.setText('');
  }

  /* ===================== SORT LEVEL BUILD ===================== */

  private buildSortLevel() {
    const slotCount = this.currentLevelItemIds.length || 3;

    // ✅ slotAssignments giờ là "hàng trên"
    this.slotAssignments = Array.from({ length: slotCount }, () => null);

    const slotSize = this.slotSize;

    // ghost (ảnh gợi ý) ở hàng trên
    const expected = this.getExpectedOrder();
    this.referenceItems = expected.map((id, i) => {
      const def = getItemDef(id);
      const c = this.slotCenters[i] ?? { x: this.boardX, y: this.boardY };
      const container = this.add.container(c.x, c.y, this.createBuildingChildren(def, slotSize, 'ghost')).setDepth(11);
      container.setSize(slotSize, slotSize);
      return container;
    });

    this.slots = [];

    const ids = [...this.currentLevelItemIds];
    Phaser.Utils.Array.Shuffle(ids);

    if (ids.length === expected.length && ids.every((id, i) => id === expected[i])) {
      if (ids.length >= 2) [ids[0], ids[1]] = [ids[1], ids[0]];
      else ids.reverse();
    }

    // draggable (ảnh thật) ở hàng dưới, chưa chiếm slot trên
    this.draggableItems = ids.map((id, i) => {
      const def = getItemDef(id);
      const start = this.startCenters[i] ?? this.startCenters[0] ?? { x: this.boardX, y: this.boardY };

      const container = this.add.container(start.x, start.y, this.createBuildingChildren(def, slotSize, 'solid')).setDepth(30);

      const hitRect = this.setDragHitArea(container);
      if (container.input as Phaser.Types.Input.InteractiveObject | undefined) {
        (container.input as Phaser.Types.Input.InteractiveObject).cursor = 'grab';
      }

      container.on('pointerover', () => {
        if (this.gameState !== 'WAIT_DRAG') return;
        if (this.isDragging) return;
        this.setCanvasCursor('grab');
      });
      container.on('pointerout', () => {
        if (this.gameState !== 'WAIT_DRAG') return;
        if (this.isDragging) return;
        this.setCanvasCursor('default');
      });

      this.input.setDraggable(container);

      const item: DraggableItem = {
        id,
        container,
        startIndex: i,

        slotIndex: null, // ✅ NEW: chưa đặt lên slot hàng trên
        prevSlotIndex: null,

        dragClampRect: Phaser.Geom.Rectangle.Clone(hitRect),
        dragOffsetX: 0,
        dragOffsetY: 0,
      };

      this.itemByContainer.set(container, item);
      return item;
    });
  }

  private clearLevelObjects() {
    this.slots.forEach((x) => x.destroy());
    this.draggableItems.forEach((x) => x.container.destroy());
    this.referenceItems.forEach((x) => x.destroy());
    this.itemByContainer.clear();

    this.slots = [];
    this.draggableItems = [];
    this.slotAssignments = [];
    this.referenceItems = [];
  }

  /* ===================== DRAG/SNAP ===================== */

  private restoreToPreviousPosition(item: DraggableItem) {
    // ✅ nếu trước đó đang ở slot hàng trên -> trả về slot hàng trên
    if (item.prevSlotIndex !== null) {
      const c = this.slotCenters[item.prevSlotIndex];
      if (c) item.container.setPosition(c.x, c.y);
      item.slotIndex = item.prevSlotIndex;
      this.slotAssignments[item.prevSlotIndex] = item;
      return;
    }

    // ✅ còn lại trả về hàng dưới (start)
    const start = this.startCenters[item.startIndex] ?? this.startCenters[0] ?? { x: this.boardX, y: this.boardY };
    item.container.setPosition(start.x, start.y);
    item.slotIndex = null;
  }

  private trySnapToNearestSlot(item: DraggableItem): boolean {
    if (this.gameState !== 'WAIT_DRAG') return false;

    const threshold = this.slotSize * 0.65;

    // ✅ snap vào slot hàng trên (slotCenters)
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.slotCenters.length; i++) {
      const c = this.slotCenters[i];
      if (!c) continue;
      const d = Phaser.Math.Distance.Between(item.container.x, item.container.y, c.x, c.y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestIdx < 0 || bestDist > threshold) return false;

    const targetCenter = this.slotCenters[bestIdx];
    if (!targetCenter) return false;

    const occupant = this.slotAssignments[bestIdx];
    const prevSlot = item.prevSlotIndex;

    // ✅ nếu slot đã có item khác -> swap/đẩy về chỗ cũ
    if (occupant && occupant !== item) {
      if (prevSlot !== null) {
        const prevCenter = this.slotCenters[prevSlot];
        if (prevCenter) occupant.container.setPosition(prevCenter.x, prevCenter.y);
        occupant.slotIndex = prevSlot;
        this.slotAssignments[prevSlot] = occupant;
      } else {
        const start = this.startCenters[occupant.startIndex] ?? this.startCenters[0] ?? { x: this.boardX, y: this.boardY };
        occupant.container.setPosition(start.x, start.y);
        occupant.slotIndex = null;
      }
    }

    item.container.setPosition(targetCenter.x, targetCenter.y);
    item.slotIndex = bestIdx;
    this.slotAssignments[bestIdx] = item;
    return true;
  }

  /* ===================== CHECK ORDER ===================== */

  private maybeCheckOrderComplete() {
    if (this.gameState !== 'WAIT_DRAG') return;
    if (this.slotAssignments.length !== (this.currentLevelItemIds.length || 3)) return;
    if (this.slotAssignments.some((x) => !x)) return;

    const picked = this.slotAssignments.map((x) => (x ? x.id : null));
    const expected = this.getExpectedOrder();

    const isCorrect = picked.every((id, idx) => id === expected[idx]);
    if (isCorrect) this.onCorrect();
    else this.onWrong();
  }

  private getExpectedOrder(): SortItemId[] {
    const base = this.currentLevelItemIds.length
      ? this.currentLevelItemIds
      : [makeItemId(this.currentTheme, 1), makeItemId(this.currentTheme, 2), makeItemId(this.currentTheme, 3)];

    return [...base].sort((a, b) => {
      const ra = parseItemId(a).variant;
      const rb = parseItemId(b).variant;
      return this.currentDirection === 'DESC' ? rb - ra : ra - rb;
    });
  }

  private onCorrect() {
    if (this.gameState !== 'WAIT_DRAG') return;
    this.gameState = 'LEVEL_END';

    this.stopGuideVoice();

    this.score++;
    // SDK: cập nhật điểm và tiến trình khi đúng
    irukaGame.recordCorrect({ scoreDelta: 1 });
    (window as any).irukaGameState.currentScore = this.score;
    sdk.score(this.score, 1);
    sdk.progress({
      levelIndex: this.levelIndex,
      score: this.score,
    });
    this.subgameDone = true;

    this.feedbackText.setText('Đúng rồi!');
    this.resultBadge.setTexture(ASSET.img.resultCorrect).setVisible(true);

    if (this.audioReady) {
      AudioManager.play(ASSET.sfx.correct);
      AudioManager.playCorrectAnswer();
    }

    this.draggableItems.forEach((x) => x.container.disableInteractive());

    this.time.delayedCall(1200, () => {
      this.levelIndex++;
      this.startLevel();
    });
  }

  private onWrong() {
    // SDK: ghi nhận trả lời sai
    irukaGame.recordWrong();
    this.stopGuideVoice();

    this.feedbackText.setText('Thử lại nhé!');
    this.resultBadge.setTexture(ASSET.img.resultWrong).setVisible(true);

    if (this.audioReady) {
      AudioManager.play(ASSET.sfx.wrong);
    }

    this.time.delayedCall(700, () => {
      if (this.gameState !== 'WAIT_DRAG') return;
      this.resultBadge.setVisible(false);
    });
  }

  // Khi sử dụng gợi ý cho bé
  useHint() {
    irukaGame.addHint();
  }

  // Khi chuyển level, lưu và gửi tiến trình
  saveAndProgress() {
    sdk.requestSave({
      score: this.score,
      levelIndex: this.levelIndex,
    });
    sdk.progress({
      levelIndex: this.levelIndex,
      total: this.levels.length,
      score: this.score,
    });
  }

  // Khi chuyển sang màn EndGame
  finalizeAttempt() {
    irukaGame.finalizeAttempt();
  }

  // Khi restart game
  retryFromStart() {
    irukaGame.retryFromStart();
  }
}
