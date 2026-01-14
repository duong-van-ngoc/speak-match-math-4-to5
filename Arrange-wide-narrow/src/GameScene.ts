import Phaser from 'phaser';
import AudioManager from './AudioManager';
import { sdk } from './main';
import { game as irukaGame } from '@iruka-edu/mini-game-sdk';

/* ===================== AUDIO GLOBAL FLAG ===================== */
const AUDIO_UNLOCKED_KEY = '__audioUnlocked__';
const AUDIO_UNLOCKED_EVENT = 'audio-unlocked';
const SORT_LEVELS_KEY = '__sortHeightLevels__';
const SORT_LAST_THEME_KEY = '__sortLastTheme__';

/* ===================== TYPES ===================== */

type GameState = 'WAIT_DRAG' | 'LEVEL_END';
type SortDirection = 'ASC' | 'DESC';
type SortThemeId = 'ROAD' | 'BRIDGE';
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
  rank: number;
  tint: number;
};

type DraggableItem = {
  id: SortItemId;
  container: Phaser.GameObjects.Container;
  startIndex: number;
  slotIndex: number | null;
  prevSlotIndex: number | null;
  dragClampRect: Phaser.Geom.Rectangle;
  dragOffsetX: number;
  dragOffsetY: number;
  targetX: number;
  targetY: number;
};

/* ===================== ASSETS ===================== */

const ASSET = {
  img: {
    board: 'banner_question',
    questionBanner: 'btn_primary_pressed',
    character: 'char',
    resultCorrect: 'result_correct',
    resultWrong: 'result_wrong',
    arrow: 'arrow',
  },
  hint: {
    ROAD: 'sort_hint_road',
    BRIDGE: 'sort_hint_bridge',
  } satisfies Record<SortThemeId, string>,
  voice: {
    ROAD: 'voice_sort_road',
    BRIDGE: 'voice_sort_bridge',
  } satisfies Record<SortThemeId, string>,
  option: {
    top: {
      ROAD: ['sort_road_1_top', 'sort_road_2_top', 'sort_road_3_top'],
      BRIDGE: ['sort_bridge_1_top', 'sort_bridge_2_top', 'sort_bridge_3_top'],
    } satisfies Record<SortThemeId, readonly [string, string, string]>,
    bottom: {
      ROAD: ['sort_road_1_bottom', 'sort_road_2_bottom', 'sort_road_3_bottom'],
      BRIDGE: ['sort_bridge_1_bottom', 'sort_bridge_2_bottom', 'sort_bridge_3_bottom'],
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
  { id: 'ROAD', label: 'Đường', tint: 0x039be5 },
  { id: 'BRIDGE', label: 'Cây cầu', tint: 0x8e24aa },
] as const satisfies ReadonlyArray<{ id: SortThemeId; label: string; tint: number }>;

export const MAIN_LEVEL_COUNT = SORT_THEMES.length;

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

/* ===================== LAYOUT CONSTANTS ===================== */

const BOARD_SCALE = 1.0;
const BASE_BOARD_WIDTH = 790;
const BASE_BOARD_HEIGHT = 580;
const BOARD_WIDTH = BASE_BOARD_WIDTH * BOARD_SCALE;
const BOARD_HEIGHT = BASE_BOARD_HEIGHT * BOARD_SCALE;

const BANNER_Y = 60;
const BANNER_SCALE = 0.5;
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
const BOARD_INNER_PADDING_X = 40 * BOARD_SCALE;
const BOARD_INNER_PADDING_TOP = 26 * BOARD_SCALE;
const BOARD_INNER_PADDING_BOTTOM = 26 * BOARD_SCALE;

const CHAR_OFFSET_X = -140;
const CHAR_OFFSET_Y = 12;
const DRAG_BOARD_PADDING = 10 * BOARD_SCALE;
const HITAREA_PADDING = 10 * BOARD_SCALE;
const HITBOX_OFFSET_X = 40 * BOARD_SCALE;
const HITBOX_OFFSET_Y = 110 * BOARD_SCALE;
const HITAREA_DEBUG = false; // tạm thời tô màu vùng chạm để debug
const DRAG_POINTER_BIAS_X = 55 * BOARD_SCALE; // đẩy vật sang phải so với con trỏ khi kéo
const IMAGE_TARGET_SCALE = 1.15;

/* ===================== DRAG SMOOTHING ===================== */

const DRAG_DISTANCE_THRESHOLD = 0; // kéo nhẹ cũng tính là drag
const DRAG_TIME_THRESHOLD = 0;
const DRAG_LERP_STRENGTH = 0.35; // 0..1 (cao hơn = bám tay hơn)
const SNAP_TWEEN_DURATION_MS = 140;

/* ===================== VOICE CUT ON SPAM ===================== */

const VOICE_SPAM_CLICK_WINDOW_MS = 260;

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
  private hintImage?: Phaser.GameObjects.Image;
  private hintUniformScale = 1;
  private hintUniformScaleReady = false;
  private feedbackText!: Phaser.GameObjects.Text;
  private cornerCharacter?: Phaser.GameObjects.Image;
  private resultBadge!: Phaser.GameObjects.Image;
  private directionArrow?: Phaser.GameObjects.Graphics;
  private directionArrowImage?: Phaser.GameObjects.Image;
  private referenceItems: Phaser.GameObjects.Container[] = [];
  private boardX = 0;
  private boardY = 0;
  private currentDirection: SortDirection = 'ASC';
  private currentLevelItemIds: SortItemId[] = [];
  private currentTheme: SortThemeId = 'ROAD';

  private slotSize = 110 * BOARD_SCALE;
  private slots: Phaser.GameObjects.Rectangle[] = [];
  private slotCenters: Array<{ x: number; y: number }> = [];
  private startCenters: Array<{ x: number; y: number }> = [];
  private slotAssignments: Array<DraggableItem | null> = [];
  private draggableItems: DraggableItem[] = [];
  private itemByContainer = new Map<Phaser.GameObjects.Container, DraggableItem>();
  private hitDebugRects = new WeakMap<Phaser.GameObjects.Container, Phaser.GameObjects.Rectangle>();
  private isDragging = false;
  private draggingItem: DraggableItem | null = null;
  private audioReady = false;
  private levelVoicePlayed = false;
  private voiceCooldownUntil = 0;
  private currentVoiceId?: string;
  private readonly VOICE_COOLDOWN_MS = 1200;
  private lastPointerDownAt = 0;
  private readonly onAudioUnlocked = () => {
    (async () => {
      const win = window as unknown as Record<string, unknown>;
      win[AUDIO_UNLOCKED_KEY] = true;
      this.audioReady = true;

      try {
        await AudioManager.unlockAndWarmup?.();
      } catch {}

      try {
        if (!AudioManager.isPlaying('bgm_main')) AudioManager.playWhenReady?.('bgm_main');
      } catch {}

      if (!this.levelVoicePlayed) this.playVoiceForLevel(true);
    })();
  };

  constructor() {
    super('GameScene');
  }

  /* ===================== INIT ===================== */
  init(data: { levelIndex?: number; score?: number; regenLevels?: boolean; avoidTheme?: SortThemeId }) {
    const requestedLevelIndex = data.levelIndex ?? 0;
    this.levelIndex = requestedLevelIndex;
    this.level = this.levelIndex;
    this.score = data.score ?? 0;

    this.subgameEntered = false;
    this.subgameDone = false;

    this.slots = [];
    this.slotCenters = [];
    this.startCenters = [];
    this.slotAssignments = [];
    this.draggableItems = [];
    this.referenceItems = [];
    this.itemByContainer.clear();
    this.isDragging = false;
    this.draggingItem = null;
    this.levelVoicePlayed = false;
    this.voiceCooldownUntil = 0;
    this.currentVoiceId = undefined;
    this.lastPointerDownAt = 0;

    const win = window as unknown as Record<string, unknown>;
    this.audioReady = !!win[AUDIO_UNLOCKED_KEY];

    // Màn sắp xếp hiện tại: mỗi theme = 1 level chính.
    const totalLevels = MAIN_LEVEL_COUNT;
    const savedState = win[SORT_LEVELS_KEY] as { levels?: SortLevelConfig[] } | undefined;
    const hasValidSavedLevels =
      savedState?.levels?.length === totalLevels &&
      savedState.levels.every((lvl) => typeof (lvl as any).theme === 'string' && Array.isArray((lvl as any).itemIds));

    const shouldRegenerateLevels = data.regenLevels === true || this.levelIndex === 0 || !hasValidSavedLevels;
    if (shouldRegenerateLevels) {
      const levels = this.generateLevels(totalLevels);
      this.levels = levels;
      win[SORT_LEVELS_KEY] = { levels };
    } else {
      this.levels = savedState!.levels!;
    }

    // Clamp levelIndex into valid range.
    if (this.levels.length > 0) {
      this.levelIndex = Math.max(0, Math.min(this.levelIndex, this.levels.length - 1));
    } else {
      this.levelIndex = 0;
    }

    // If caller wants "random but not same theme as before", bump to another level if needed.
    if (data.avoidTheme && this.levels.length > 1) {
      if (requestedLevelIndex === 0) {
        if (this.levels[0]?.theme === data.avoidTheme) {
          const swapIndex = this.levels.findIndex((lvl) => lvl.theme !== data.avoidTheme);
          if (swapIndex > 0) {
            const tmp = this.levels[0];
            this.levels[0] = this.levels[swapIndex];
            this.levels[swapIndex] = tmp;
            win[SORT_LEVELS_KEY] = { levels: this.levels };
          }
        }
      } else {
        const currentTheme = this.levels[this.levelIndex]?.theme;
        if (currentTheme === data.avoidTheme) {
          const altIndex = this.levels.findIndex((lvl) => lvl.theme !== data.avoidTheme);
          if (altIndex >= 0) this.levelIndex = altIndex;
        }
      }
    }

    this.level = this.levelIndex;
    win[SORT_LAST_THEME_KEY] = this.levels[this.levelIndex]?.theme;
  }

  /* ===================== LEVEL GENERATION ===================== */
  private generateLevels(numLevels: number): SortLevelConfig[] {
    const direction: SortDirection = 'ASC';
    const themes = SORT_THEMES.map((x) => x.id);

    const themeSequence: SortThemeId[] = [];
    for (let i = 0; i < numLevels; i++) {
      const prev = themeSequence[i - 1];
      const pool = prev && themes.length > 1 ? themes.filter((t) => t !== prev) : themes;
      themeSequence.push(Phaser.Utils.Array.GetRandom(pool));
    }

    return Array.from({ length: numLevels }, (_, i) => ({
      id: i + 1,
      direction,
      theme: themeSequence[i]!,
      itemIds: (Phaser.Utils.Array.Shuffle([1, 2, 3]) as SortVariant[]).map((v) => makeItemId(themeSequence[i]!, v)),
    }));
  }

  /* ===================== CREATE ===================== */
  create() {
    // SDK: set tổng số level
    irukaGame.setTotal?.(this.levels?.length || 2);
    (window as any).irukaGameState = {
      startTime: Date.now(),
      currentScore: 0,
    };
    sdk?.score?.(this.score, 0);
    sdk?.progress?.({ levelIndex: 0, total: this.levels?.length || 2 });
    this.input.dragDistanceThreshold = DRAG_DISTANCE_THRESHOLD;
    this.input.dragTimeThreshold = DRAG_TIME_THRESHOLD;

    // Nhận unlock từ DOM (click/tap overlay ngoài Phaser) -> phát voice ngay sau khi unlock.
    window.addEventListener(AUDIO_UNLOCKED_EVENT, this.onAudioUnlocked, { once: true } as AddEventListenerOptions);

    // rotateOrientation.ts sẽ gọi hàm này khi bé xoay ngang lại, để phát voice hướng dẫn
    // (tránh trường hợp lần click đầu tiên xảy ra trong màn dọc -> chỉ phát voice_rotate).
    (window as any).playCurrentQuestionVoice = () => {
      this.playVoiceForLevel(true);
    };

    // Unlock audio once
    this.input.once('pointerdown', () => {
      try {
        const win = window as unknown as Record<string, unknown>;
        win[AUDIO_UNLOCKED_KEY] = true;
        // Báo cho listener DOM -> dùng chung một luồng (để không bị khác hành vi giữa local/Vercel).
        window.dispatchEvent(new Event(AUDIO_UNLOCKED_EVENT));
      } catch (e) {
        console.warn('[Audio] unlock/play failed', e);
      }
    });

    // Nếu bé click nhanh/spam -> ngắt voice hướng dẫn (không chặn click bình thường).
    this.input.on('pointerdown', () => {
      const now = this.time?.now ?? Date.now();
      const isSpam = now - this.lastPointerDownAt <= VOICE_SPAM_CLICK_WINDOW_MS;
      this.lastPointerDownAt = now;
      if (isSpam) this.stopGuideVoice();
    });

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    // ===== Viewport buttons (Replay/Next) like Arrange-high-low =====
    (window as unknown as { setGameButtonsVisible?: (visible: boolean) => void }).setGameButtonsVisible?.(true);

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

    this.board = this.add.image(0, 0, ASSET.img.board).setOrigin(0.5).setDisplaySize(BOARD_WIDTH, BOARD_HEIGHT);
    this.questionBanner = this.add
      .image(width / 2, BANNER_Y, ASSET.img.questionBanner)
      .setOrigin(0.5)
      .setScale(0.45, BANNER_SCALE * BOARD_SCALE)
      .setDepth(20);

    this.promptText = this.add
      .text(this.questionBanner.x, this.questionBanner.y, '', {
        fontFamily: 'Fredoka, Arial',
        fontSize: `${PROMPT_FONT_SIZE}px`,
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(21);

    this.feedbackText = this.add
      .text(this.questionBanner.x, this.questionBanner.y + this.questionBanner.displayHeight / 2, '', {
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

    this.cornerCharacter = this.add.image(-40, 0, ASSET.img.character).setOrigin(0.5, 1).setScale(height / 720 * 0.55).setDepth(15);
    this.tweens.add({ targets: this.cornerCharacter, y: '-=10', duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.input.on('dragstart', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!(gameObject instanceof Phaser.GameObjects.Container)) return;
      if (this.gameState !== 'WAIT_DRAG') return;
      const item = this.itemByContainer.get(gameObject);
      if (!item) return;

      // Nếu bé bắt đầu thao tác kéo thì ngắt voice hướng dẫn để đỡ chồng tiếng.
      this.stopGuideVoice();

      this.isDragging = true;
      this.draggingItem = item;
      this.setCanvasCursor('grabbing');

      item.prevSlotIndex = item.slotIndex;
      item.dragOffsetX = pointer.worldX - gameObject.x - DRAG_POINTER_BIAS_X;
      item.dragOffsetY = pointer.worldY - gameObject.y;
      item.targetX = gameObject.x;
      item.targetY = gameObject.y;

      this.tweens.killTweensOf(gameObject);

      if (item.slotIndex !== null) {
        this.slotAssignments[item.slotIndex] = null;
        item.slotIndex = null;
      }

      gameObject.setDepth(50);

      if (this.audioReady) AudioManager.play(ASSET.sfx.click);
    });

    this.input.on('drag', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!(gameObject instanceof Phaser.GameObjects.Container)) return;
      if (this.gameState !== 'WAIT_DRAG') return;
      const item = this.itemByContainer.get(gameObject);
      if (!item) return;

      const x = pointer.worldX - item.dragOffsetX;
      const y = pointer.worldY - item.dragOffsetY;

      const p = this.clampToBoard(x, y, item);
      item.targetX = p.x;
      item.targetY = p.y;
    });

    this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!(gameObject instanceof Phaser.GameObjects.Container)) return;
      const item = this.itemByContainer.get(gameObject);
      if (!item) return;

      this.isDragging = false;
      this.draggingItem = null;
      // Nếu thả chuột mà con trỏ vẫn đang nằm trong hitarea của item -> giữ cursor grab
      const input = gameObject.input as Phaser.Types.Input.InteractiveObject | undefined;
      const hitArea = input?.hitArea as Phaser.Geom.Rectangle | undefined;
      if (hitArea) {
        const pointer = this.input.activePointer;
        const localX = pointer.worldX - gameObject.x;
        const localY = pointer.worldY - gameObject.y;
        this.setCanvasCursor(Phaser.Geom.Rectangle.Contains(hitArea, localX, localY) ? 'grab' : 'default');
      } else {
        this.setCanvasCursor('default');
      }

      if (this.gameState !== 'WAIT_DRAG') {
        this.restoreToPreviousPosition(item);
        return;
      }

      // Commit vị trí cuối cùng để tránh lệch do smoothing khi thả.
      gameObject.setPosition(item.targetX, item.targetY);
      this.syncHitDebug(gameObject);

      if (!this.trySnapToNearestSlot(item)) this.restoreToPreviousPosition(item);

      gameObject.setDepth(30);
      this.maybeCheckOrderComplete();
    });

    this.layoutBoard();
    this.startLevel();
  }

  update(_time: number, delta: number) {
    const item = this.draggingItem;
    if (!item) return;
    if (this.gameState !== 'WAIT_DRAG') return;

    // delta(ms) independent smoothing
    const alpha = 1 - Math.pow(0.001, delta);
    const t = Phaser.Math.Clamp(alpha * DRAG_LERP_STRENGTH, 0, 1);

    item.container.setPosition(
      Phaser.Math.Linear(item.container.x, item.targetX, t),
      Phaser.Math.Linear(item.container.y, item.targetY, t),
    );
    this.syncHitDebug(item.container);
  }

  private setCanvasCursor(cursor: string) {
    try {
      this.sys.game.canvas.style.cursor = cursor;
    } catch {
      return;
    }
  }

  private tweenMove(container: Phaser.GameObjects.Container, x: number, y: number, durationMs = SNAP_TWEEN_DURATION_MS) {
    this.tweens.killTweensOf(container);
    this.tweens.add({
      targets: container,
      x,
      y,
      duration: durationMs,
      ease: 'Sine.out',
      onUpdate: () => this.syncHitDebug(container),
    });
  }

  private syncHitDebug(container: Phaser.GameObjects.Container) {
    const dbg = this.hitDebugRects.get(container);
    if (!dbg || !dbg.scene) return;
    const input = container.input as Phaser.Types.Input.InteractiveObject | undefined;
    const hitArea = (input?.hitArea as Phaser.Geom.Rectangle | undefined) ?? undefined;
    if (!hitArea) return;

    dbg
      .setPosition(container.x + hitArea.centerX, container.y + hitArea.centerY)
      .setSize(hitArea.width, hitArea.height)
      .setDepth(container.depth + 1);
  }

  /* ===================== START LEVEL ===================== */
  private startLevel() {
    if (this.levelIndex >= this.levels.length) {
      this.scene.start('EndGameScene', {
        lessonId: 'Arrange-wide-narrow',
        score: this.score,
        total: this.levels.length,
      });
      return;
    }

    this.subgameEntered = true;
    this.subgameDone = false;
    this.gameState = 'WAIT_DRAG';
    this.levelVoicePlayed = false;

    const level = this.levels[this.levelIndex];
    this.currentDirection = level.direction;
    this.currentTheme = level.theme ?? 'ROAD';
    this.currentLevelItemIds =
      level.itemIds?.length === 3
        ? level.itemIds
        : [makeItemId(this.currentTheme, 1), makeItemId(this.currentTheme, 2), makeItemId(this.currentTheme, 3)];

    this.resetUiForNewTry();
    this.clearLevelObjects();
    this.layoutBoard();
    this.buildSortLevel();

    this.updatePromptForLevel();

    if (this.audioReady) this.playVoiceForLevel();
  }

  private updatePromptForLevel() {
    const themeLabel = SORT_THEME_BY_ID[this.currentTheme]?.label ?? 'Đường';
    const fallback = `SẮP XẾP ${themeLabel.toUpperCase()} THEO HƯỚNG MŨI TÊN!`;
    const hintKey = ASSET.hint[this.currentTheme];

    if (this.hintImage && !(this.hintImage.scene as any)?.sys) {
      this.hintImage = undefined;
    }

    if (hintKey && this.textures.exists(hintKey)) {
      this.promptText.setVisible(false);

      const bx = this.questionBanner.x;
      const by = this.questionBanner.y;

      if (!this.hintImage) {
        this.hintImage = this.add.image(bx, by, hintKey).setOrigin(0.5).setDepth(21);
      } else {
        this.hintImage.setTexture(hintKey).setVisible(true);
      }

      this.hintImage.setPosition(bx, by);
      this.applyHintUniformScale(this.hintImage);
      return;
    }

    if (this.hintImage) this.hintImage.setVisible(false);
    this.promptText.setVisible(true).setText(fallback);
  }

  /* ===================== BANNER PROMPT IMAGE (UNIFORM SCALE) ===================== */

  private computeHintUniformScale() {
    const banner = this.questionBanner;
    const targetH = banner.displayHeight * 0.62;
    const maxAllowedW = banner.displayWidth * 0.82;

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
    img.setScale(this.hintUniformScale);
  }

  /* ===================== LAYOUT ===================== */
  private layoutBoard() {
    const { width } = this.scale;

    const bannerX = width / 2;
    this.boardX = width / 2 + BOARD_OFFSET_X;

    this.questionBanner.setPosition(bannerX, BANNER_Y);

    const bannerBottom = this.questionBanner.y + this.questionBanner.displayHeight / 2;
    this.boardY = bannerBottom + BOARD_GAP_FROM_BANNER + BOARD_HEIGHT / 2 + BOARD_OFFSET_Y;

    this.board?.setPosition(this.boardX, this.boardY);

    const topEdge = this.boardY - BOARD_HEIGHT / 2;
    const bottomEdge = this.boardY + BOARD_HEIGHT / 2;

    this.layoutSlotsAndStarts(topEdge, bottomEdge);
    this.drawDirectionArrow();
    this.refreshDraggableClampRects();

    this.promptText.setPosition(bannerX, this.questionBanner.y);

    this.hintUniformScaleReady = false;
    this.computeHintUniformScale();
    if (this.hintImage) {
      this.hintImage.setPosition(bannerX, this.questionBanner.y);
      if (this.hintImage.visible) this.applyHintUniformScale(this.hintImage);
    }
    this.feedbackText.setPosition(bannerX, this.boardY + BOARD_HEIGHT / 2 - FEEDBACK_BOTTOM_MARGIN);

    if (this.cornerCharacter) {
      const leftEdge = this.boardX - BOARD_WIDTH / 2;
      this.cornerCharacter.setPosition(leftEdge + CHAR_OFFSET_X, bottomEdge + CHAR_OFFSET_Y);
    }

    this.resultBadge.setPosition(this.boardX + BOARD_WIDTH / 2 - BOARD_RESULT_MARGIN_X, bottomEdge - BOARD_RESULT_MARGIN_Y);
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
      slot.setSize(size, size);
    });

    this.referenceItems.forEach((ref, i) => {
      const c = this.slotCenters[i];
      if (!c) return;
      ref.setPosition(c.x, c.y);
    });

    this.draggableItems.forEach((item) => {
      if (item.slotIndex !== null) {
        const c = this.slotCenters[item.slotIndex];
        if (c) {
          item.container.setPosition(c.x, c.y);
          item.targetX = c.x;
          item.targetY = c.y;
          this.syncHitDebug(item.container);
        }
        return;
      }
      const start = this.startCenters[item.startIndex] ?? this.startCenters[0];
      if (start) {
        item.container.setPosition(start.x, start.y);
        item.targetX = start.x;
        item.targetY = start.y;
        this.syncHitDebug(item.container);
      }
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
      arrow.setFlipX(this.currentDirection === 'DESC');
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

    const fromX = this.currentDirection === 'DESC' ? endX : startX;
    const toX = this.currentDirection === 'DESC' ? startX : endX;

    const lineColor = 0xff4d4d;
    const thickness = 4 * BOARD_SCALE;

    this.directionArrow.lineStyle(thickness, lineColor, 1);
    this.directionArrow.beginPath();
    this.directionArrow.moveTo(fromX, midY);
    this.directionArrow.lineTo(toX, midY);
    this.directionArrow.strokePath();

    const headSize = 14 * BOARD_SCALE;
    const headHeight = 8 * BOARD_SCALE;

    const headDir = toX > fromX ? 1 : -1;
    this.directionArrow.fillStyle(lineColor, 1);
    this.directionArrow.fillTriangle(
      toX,
      midY,
      toX - headDir * headSize,
      midY - headHeight,
      toX - headDir * headSize,
      midY + headHeight,
    );
  }

  private refreshDraggableClampRects() {
    for (const item of this.draggableItems) {
      const rect = this.setDragHitArea(item.container);
      item.dragClampRect = Phaser.Geom.Rectangle.Clone(rect);
    }
  }

  private clampToBoard(x: number, y: number, item: DraggableItem) {
    const hitArea = item.dragClampRect;

    const minX = this.boardX - BOARD_WIDTH / 2 + DRAG_BOARD_PADDING - hitArea.x;
    const maxX = this.boardX + BOARD_WIDTH / 2 - DRAG_BOARD_PADDING - (hitArea.x + hitArea.width);
    const minY = this.boardY - BOARD_HEIGHT / 2 + DRAG_BOARD_PADDING - hitArea.y;
    const maxY = this.boardY + BOARD_HEIGHT / 2 - DRAG_BOARD_PADDING - (hitArea.y + hitArea.height);

    return {
      x: Phaser.Math.Clamp(x, minX, maxX),
      y: Phaser.Math.Clamp(y, minY, maxY),
    };
  }

  private getContainerVisualRectLocal(container: Phaser.GameObjects.Container): Phaser.Geom.Rectangle {
    const bounds = container.getBounds(); // world-space
    const w = bounds.width || this.slotSize;
    const h = bounds.height || this.slotSize;
    return new Phaser.Geom.Rectangle(bounds.x - container.x, bounds.y - container.y, w, h);
  }

  // ✅ HITBOX: cap không đè nhau + shift theo Arrange-high-low
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

    container.setSize(rect.width, rect.height);
    container.setInteractive(rect, Phaser.Geom.Rectangle.Contains);

    if (HITAREA_DEBUG) {
      const existing = this.hitDebugRects.get(container);
      if (existing && existing.scene) {
        existing.setSize(rect.width, rect.height);
        existing.setFillStyle(0x00ff6a, 0.12);
        existing.setStrokeStyle(2 * BOARD_SCALE, 0x00ff6a, 0.35);
      } else {
        const dbg = this.add
          .rectangle(container.x, container.y, rect.width, rect.height, 0x00ff6a, 0.12)
          .setOrigin(0.5)
          .setStrokeStyle(2 * BOARD_SCALE, 0x00ff6a, 0.35)
          .setDepth(container.depth + 1);
        this.hitDebugRects.set(container, dbg);
      }
      this.syncHitDebug(container);
    }

    return rect;
  }

  /* ===================== SORT LEVEL BUILD ===================== */
  private createSortItemChildren(def: SortItemDef, size: number, kind: 'ghost' | 'solid'): Phaser.GameObjects.GameObject[] {
    const variantIdx = Math.max(0, Math.min(2, def.variant - 1));
    const imageKey = kind === 'ghost' ? ASSET.option.top[def.theme][variantIdx] : ASSET.option.bottom[def.theme][variantIdx];

    if (imageKey && this.textures.exists(imageKey)) {
      const bottomY = size * 0.42;
      const img = this.add.image(0, bottomY, imageKey).setOrigin(0.5, 1);
      const maxDim = Math.max(img.width || 1, img.height || 1);
      img.setScale((size * IMAGE_TARGET_SCALE) / maxDim);
      img.setAlpha(kind === 'ghost' ? 0.35 : 1);
      return [img];
    }

    const fallback = this.add.rectangle(0, 0, size * 0.7, size * 0.7, def.tint).setAlpha(kind === 'ghost' ? 0.25 : 0.9);
    return [fallback];
  }

  private buildSortLevel() {
    const slotCount = this.currentLevelItemIds.length || 3;
    this.slotAssignments = Array.from({ length: slotCount }, () => null);

    const slotSize = this.slotSize;
    const expected = this.getExpectedOrder();

    this.referenceItems = expected.map((id, i) => {
      const def = getItemDef(id);
      const c = this.slotCenters[i] ?? { x: this.boardX, y: this.boardY };

      const bg = this.add
        .rectangle(0, 0, slotSize, slotSize, 0xffffff, 0)
        .setOrigin(0.5)
        .setStrokeStyle(3 * BOARD_SCALE, 0xffffff, 0.25);
      const container = this.add
        .container(c.x, c.y, [bg, ...this.createSortItemChildren(def, slotSize, 'ghost')])
        .setDepth(11);
      container.setSize(slotSize, slotSize);
      return container;
    });

    this.slots = Array.from({ length: slotCount }, (_, i) => {
      const c = this.startCenters[i] ?? { x: this.boardX, y: this.boardY };
      return this.add
        .rectangle(c.x, c.y, slotSize, slotSize, 0xffffff, 0)
        .setOrigin(0.5)
        .setStrokeStyle(3 * BOARD_SCALE, 0xffffff, 0.18)
        .setDepth(10);
    });

    const ids = [...this.currentLevelItemIds];
    Phaser.Utils.Array.Shuffle(ids);

    if (ids.length === expected.length && ids.every((id, i) => id === expected[i])) {
      if (ids.length >= 2) [ids[0], ids[1]] = [ids[1], ids[0]];
      else ids.reverse();
    }

    this.draggableItems = ids.map((id, i) => {
      const def = getItemDef(id);
      const start = this.startCenters[i] ?? this.startCenters[0] ?? { x: this.boardX, y: this.boardY };

      const container = this.add.container(start.x, start.y, this.createSortItemChildren(def, slotSize, 'solid')).setDepth(30);

      const clampRect = this.setDragHitArea(container);
      this.syncHitDebug(container);

      container.on('pointerover', () => {
        if (this.gameState !== 'WAIT_DRAG') return;
        if (this.isDragging) return;
        // Hit area chỉ nằm bên phải ảnh, nên chỉ đổi cursor ở vùng này
        this.setCanvasCursor('grab');
      });
      container.on('pointermove', () => {
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
        slotIndex: null,
        prevSlotIndex: null,
        dragClampRect: Phaser.Geom.Rectangle.Clone(clampRect),
        dragOffsetX: 0,
        dragOffsetY: 0,
        targetX: start.x,
        targetY: start.y,
      };

      this.itemByContainer.set(container, item);
      return item;
    });
  }

  private clearLevelObjects() {
    this.draggingItem = null;
    this.isDragging = false;

    this.slots.forEach((x) => x.destroy());
    this.draggableItems.forEach((x) => {
      const dbg = this.hitDebugRects.get(x.container);
      dbg?.destroy();
      x.container.destroy();
    });
    this.referenceItems.forEach((x) => x.destroy());
    this.itemByContainer.clear();

    this.slots = [];
    this.draggableItems = [];
    this.slotAssignments = [];
    this.referenceItems = [];
  }

  /* ===================== SORT LOGIC ===================== */
  private resetUiForNewTry() {
    this.resultBadge.setVisible(false);
    this.feedbackText.setText('');
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

  /* ===================== DRAG/SNAP ===================== */
  private restoreToPreviousPosition(item: DraggableItem) {
    if (item.prevSlotIndex !== null) {
      const c = this.slotCenters[item.prevSlotIndex];
      if (c) {
        item.targetX = c.x;
        item.targetY = c.y;
        this.tweenMove(item.container, c.x, c.y);
        this.syncHitDebug(item.container);
      }
      item.slotIndex = item.prevSlotIndex;
      this.slotAssignments[item.prevSlotIndex] = item;
      return;
    }

    const start = this.startCenters[item.startIndex] ?? this.startCenters[0] ?? { x: this.boardX, y: this.boardY };
    item.targetX = start.x;
    item.targetY = start.y;
    this.tweenMove(item.container, start.x, start.y);
    this.syncHitDebug(item.container);
    item.slotIndex = null;
  }

  private trySnapToNearestSlot(item: DraggableItem): boolean {
    if (this.gameState !== 'WAIT_DRAG') return false;

    const threshold = this.slotSize * 0.65;

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

    if (occupant && occupant !== item) {
      if (prevSlot !== null) {
        const prevCenter = this.slotCenters[prevSlot];
        if (prevCenter) {
          occupant.targetX = prevCenter.x;
          occupant.targetY = prevCenter.y;
          this.tweenMove(occupant.container, prevCenter.x, prevCenter.y);
          this.syncHitDebug(occupant.container);
        }
        occupant.slotIndex = prevSlot;
        this.slotAssignments[prevSlot] = occupant;
      } else {
        const start = this.startCenters[occupant.startIndex] ?? this.startCenters[0] ?? { x: this.boardX, y: this.boardY };
        occupant.targetX = start.x;
        occupant.targetY = start.y;
        this.tweenMove(occupant.container, start.x, start.y);
        this.syncHitDebug(occupant.container);
        occupant.slotIndex = null;
      }
    }

    item.targetX = targetCenter.x;
    item.targetY = targetCenter.y;
    this.tweenMove(item.container, targetCenter.x, targetCenter.y);
    this.syncHitDebug(item.container);
    item.slotIndex = bestIdx;
    this.slotAssignments[bestIdx] = item;
    return true;
  }

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

  private onCorrect() {
    irukaGame.recordCorrect?.({ scoreDelta: 1 });
    (window as any).irukaGameState.currentScore = this.score;
    sdk?.score?.(this.score, 1);
    sdk?.progress?.({
      levelIndex: this.levelIndex,
      score: this.score,
    });
    if (this.gameState !== 'WAIT_DRAG') return;
    this.gameState = 'LEVEL_END';
    this.stopGuideVoice();
    this.score++;
    this.subgameDone = true;
    this.feedbackText.setText('Đúng rồi!');
    this.resultBadge.setTexture(ASSET.img.resultCorrect).setVisible(true);
    if (this.audioReady) {
      AudioManager.play(ASSET.sfx.correct);
      AudioManager.playCorrectAnswer();
    }
    this.draggableItems.forEach((x) => x.container.disableInteractive());

    (window as unknown as { setGameButtonsVisible?: (visible: boolean) => void }).setGameButtonsVisible?.(true);

    const base = 2 + (this.levelIndex % 3);
    const diff = 2;
    const smallerLeft = this.levelIndex % 2 === 0;
    const leftCount = smallerLeft ? base : base + diff;
    const rightCount = smallerLeft ? base + diff : base;

    this.time.delayedCall(1200, () => {
      // Subgame mapping:
      // - After ROAD: ghép chim hẹp (OP2)
      // - After BRIDGE: ghép chim rộng (OP1)
      const balanceSubject = (this.currentTheme === 'ROAD' ? 'BIRDCAGE_DOOR' : 'BIRDCAGE') as any;
      this.scene.start('BalanceScene', {
        leftCount,
        rightCount,
        subject: balanceSubject,
        nextScene: 'GameScene',
        score: this.score,
        levelIndex: this.levelIndex,
        totalLevels: this.levels.length,
        lessonId: 'Arrange-wide-narrow',
      });
    });
  }

  private onWrong() {
    irukaGame.recordWrong?.();
    this.stopGuideVoice();
    this.feedbackText.setText('Thử lại nhé!');
    this.resultBadge.setTexture(ASSET.img.resultWrong).setVisible(true);
    if (this.audioReady) AudioManager.play(ASSET.sfx.wrong);
    this.time.delayedCall(800, () => this.resultBadge.setVisible(false));
  }

  /* ===================== VOICE GUIDE ===================== */

  private stopGuideVoice() {
    if (!this.currentVoiceId) return;
    AudioManager.stopSound(this.currentVoiceId);
    this.currentVoiceId = undefined;
  }

  // Gợi ý cho bé


  private playVoiceForLevel(force = false) {
    // Khi đang ở màn dọc (rotate overlay) thì không phát voice hướng dẫn để tránh chồng với voice_rotate.
    try {
      if ((window as any).__rotateOverlayActive__ === true) return;
    } catch {}

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
      AudioManager.playWhenReady?.(voiceId);
    }
  }
}
