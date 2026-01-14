// GameScene.ts – TypeScript, giữ nguyên logic từ bản JS

import Phaser from "phaser";
import { preloadGameAssets, BUTTON_ASSET_URLS } from "./assetLoader";
import AudioManager from "./AudioManager";
import { ensureBgmStarted } from "./main";


// ========== TYPES ==========
interface CardData {
  index: number;
  number: number;
  asset?: string;
  cardW: number;
  cardH: number;
}

type ImageWithData = Phaser.GameObjects.Image & {
  customData?: CardData;
  hoverTint?: number;
  activeTint?: number;
};

interface HolePos {
  x: number;
  y: number;
}

interface LineSegment {
  x0: number;
  y0: number;
  bodyLen: number;
  thickness: number;
  angle: number;
}

interface LevelItem {
  number: number;
  asset: string;
  label: string;
}

interface LevelConfig {
  items: LevelItem[];
  background: string;
  character: string;
}

// ========== CONSTANTS ==========
// Vị trí tâm lỗ theo texture space (px) của asset thẻ.
// Đo trực tiếp từ các file trong `public/assets/card/`.
// Tâm lỗ (centroid của chấm lỗ) theo px trong ảnh gốc.
// Recomputed by `scripts/measure_hole_centers.py` and verified by debug overlay.
const HOLE_CENTER_PX_CARD = { x: 651.45, y: 113.96 }; // Group 13.png (lỗ bên phải)
const HOLE_CENTER_PX_CARD2 = { x: 32.47, y: 108.94 }; // Group 17.png (lỗ bên trái)
const HOLE_DIAMETER_PX = 26;

const LINE_INNER_FACTOR = 0.08; // nhỏ hơn -> line tiến gần tâm lỗ hơn

//const HOLE_ALONG_FACTOR = 0.85;
const LINE_THICKNESS_FACTOR = 0.8;
//const LINE_TRIM_FACTOR = 0.12;

const MATCH_TINT = 0xffee5e;

const AUDIO_UNLOCKED_KEY = "__audioUnlocked__";
const HAND_TUTORIAL_KEY =
  "__match_hand_tutorial_shown__" +
  (typeof window !== "undefined" ? window.location.pathname : "");

// Độ lệch lỗ theo đường chéo (chưa dùng, để 0)
const HOLE_SLOPE_OFFSET_RATIO = 0;

// Offset tinh chỉnh theo index từng thẻ
const HOLE_OFFSET_NUMBER_DX = [0, 0, 0, 0];
const HOLE_OFFSET_NUMBER_DY = [0, 0, 0, 0];
const HOLE_OFFSET_OBJECT_DX = [0, 0, 0, 0];
const HOLE_OFFSET_OBJECT_DY = [0, 0, 0, 0];


// Tay hướng dẫn
const HAND_ASSET_KEY = "hand";
const HAND_FINGER_ORIGIN_X = 0.8;
const HAND_FINGER_ORIGIN_Y = 0.2;

const ALL_ASSETS_12 = [
  "flower",
  "bear",
  "ball",
  "marble",
  "drum",
  "rabbit",
  "clock",
  "red",
  "yellow",
  "babie",
];

const LABEL_BY_ASSET: Record<string, string> = {};

const ONE_TWO_PATTERNS = [
  [1, 1, 1, 2],
  [1, 1, 2, 2],
  [1, 2, 2, 2],
];

// ========== UTILS ==========
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildOneTwoLevels(): LevelConfig[] {
  // Dùng cùng 4 asset cho nhiều màn, mỗi màn đổi pattern số và trộn thứ tự
  const bgKeys = ["bg1", "bg2", "bg3", "bg4", "bg5"];
  const charKeys = ["char1", "char2", "char1", "char2", "char1"];

  const levels: LevelConfig[] = [];

  // Đổi số màn tại đây: 2 hoặc 3
  const numLevels = 3;

  for (let i = 0; i < numLevels; i++) {
  const shuffledAssets = shuffle(ALL_ASSETS_12).slice(0, 4);
  const pattern =
    ONE_TWO_PATTERNS[Math.floor(Math.random() * ONE_TWO_PATTERNS.length)];

  const items: LevelItem[] = shuffledAssets.map((key, idx) => ({
    number: pattern[idx],
    asset: key,
    label: LABEL_BY_ASSET[key] || "",
  }));
  // ...

    levels.push({
      items,
      background: bgKeys[i % bgKeys.length],
      character: charKeys[i % charKeys.length],
    });
  }

  return levels;
}

// ========== MAIN CLASS ==========
export default class GameScene extends Phaser.Scene {
  private correctVoices: string[] = [
    'correct_answer_1',
    'correct_answer_2',
    'correct_answer_3',
    'correct_answer_4',
  ];

  levels: LevelConfig[];
  level: number = 0;

  handHint: Phaser.GameObjects.Image | null = null;
  scaleBG: number = 1;

  numbers: ImageWithData[] = [];
  objects: ImageWithData[] = [];

  matches: boolean[] = [];
  objectsMatched: boolean[] = [];
  matchedObjectIdx: Array<number | null> = [];
  matchedLines: Array<Phaser.GameObjects.Image | null> = [];
  dragLine: Phaser.GameObjects.Image | null = null;
  seenLevels: boolean[] = [];
  private introPlayedThisLevel = false;
  private introCanceledThisLevel = false;

  isDragging: boolean = false;
  dragStartIdx: number | null = null;

  replayBtn?: Phaser.GameObjects.GameObject;
  nextBtn?: Phaser.GameObjects.GameObject;

  bgm?: Phaser.Sound.BaseSound;

   // 👉 Banner câu hỏi
  private questionBanner?: Phaser.GameObjects.Image;
  private promptText?: Phaser.GameObjects.Image;


  constructor() {
    super({ key: "GameScene" });
    this.levels = buildOneTwoLevels();
  }

  preload() {
    preloadGameAssets(this);
  }

  init(data: { level?: number; seenLevels?: boolean[]; resetProgress?: boolean }) {
    const requestedLevel =
      typeof data.level === "number"
        ? data.level
        : Math.floor(Math.random() * Math.max(1, this.levels.length));
    this.level = requestedLevel;

    if (data.resetProgress || !Array.isArray(data.seenLevels)) {
      this.seenLevels = Array(this.levels.length).fill(false);
    } else {
      const next = [...data.seenLevels];
      while (next.length < this.levels.length) next.push(false);
      this.seenLevels = next.slice(0, this.levels.length);
    }
  }

  private playIntroOnce() {
    if (this.introPlayedThisLevel) return;
    this.introPlayedThisLevel = true;
    this.introCanceledThisLevel = false;
    AudioManager.cancelRetry("voice_intro");
    AudioManager.stop("voice_intro");
    AudioManager.playWithRetry("voice_intro", { retries: 12, delayMs: 150 });
  }

  private handleAnyPointerDown() {
    ensureBgmStarted();
    const win = window as any;
    if (!win[AUDIO_UNLOCKED_KEY]) {
      win[AUDIO_UNLOCKED_KEY] = true;
      this.playIntroOnce();
      return;
    }
    if (this.introPlayedThisLevel && !this.introCanceledThisLevel) {
      this.introCanceledThisLevel = true;
      AudioManager.cancelRetry("voice_intro");
      AudioManager.stop("voice_intro");
    }
  }

  private hideHandHint() {
    if (!this.handHint) return;
    this.tweens.add({
      targets: this.handHint,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        this.handHint?.destroy();
        this.handHint = null;
      },
    });
  }

  handleReplayClick() {
    AudioManager.play("sfx_click");
    this.scene.restart({
      level: Math.floor(Math.random() * Math.max(1, this.levels.length)),
      seenLevels: Array(this.levels.length).fill(false),
      resetProgress: true,
    });
  }

  // Bán kính lỗ theo chiều cao thẻ hiện tại
  getHoleRadius(card: Phaser.GameObjects.Image): number {
    const src = card.texture.getSourceImage() as HTMLImageElement | undefined;
    const texH = src?.height || card.texture.get().height || 1;
    const scaleY = card.displayHeight / texH;
    return (HOLE_DIAMETER_PX / 2) * scaleY;
  }

  // Tính tâm lỗ trên 1 card
  getHolePos(
    card: ImageWithData,
    side: "left" | "right" = "right",
    slopeDir: number = 0
  ): HolePos {
    const slopeOffset = slopeDir * card.displayHeight * HOLE_SLOPE_OFFSET_RATIO;

    let idx = card.customData?.index ?? 0;
    idx = Math.min(3, Math.max(0, idx));

    let extraDX = 0;
    let extraDY = 0;

    if (side === "right") {
      extraDX = card.displayWidth * (HOLE_OFFSET_NUMBER_DX[idx] || 0);
      extraDY = card.displayHeight * (HOLE_OFFSET_NUMBER_DY[idx] || 0);
    } else {
      extraDX = card.displayWidth * (HOLE_OFFSET_OBJECT_DX[idx] || 0);
      extraDY = card.displayHeight * (HOLE_OFFSET_OBJECT_DY[idx] || 0);
    }

    const src = card.texture.getSourceImage() as HTMLImageElement | undefined;
    const texW = src?.width || card.texture.get().width || 1;
    const texH = src?.height || card.texture.get().height || 1;

    const hole = side === "right" ? HOLE_CENTER_PX_CARD : HOLE_CENTER_PX_CARD2;
    const scaleX = card.displayWidth / texW;
    const scaleY = card.displayHeight / texH;

    // Convert texture px -> ratio, then use top-left in world space (same logic as Join-hands-feet).
    // Cards in this game are not rotated; this keeps the hole point stable and avoids matrix/origin pitfalls.
    const rx = hole.x / Math.max(1, texW);
    const ry = hole.y / Math.max(1, texH);

    const topLeftX = card.x - card.displayWidth * card.originX;
    const topLeftY = card.y - card.displayHeight * card.originY;

    return {
      x: topLeftX + rx * card.displayWidth + extraDX,
      y: topLeftY + ry * card.displayHeight + slopeOffset + extraDY,
    };
  }

  // Tính đoạn line giữa 2 lỗ
  computeSegment(
  start: HolePos,
  end: HolePos,
  rStart: number,
  rEnd: number,
  thicknessFactor = LINE_THICKNESS_FACTOR,
  innerFactor = LINE_INNER_FACTOR
): LineSegment {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    const cStart = rStart * innerFactor;
    const cEnd = rEnd * innerFactor;

    const bodyLen = Math.max(dist - cStart - cEnd, 0);

    const x0 = start.x + (dx / dist) * cStart;
    const y0 = start.y + (dy / dist) * cStart;

    const thickness = rStart * 2 * thicknessFactor;
    const angle = Math.atan2(dy, dx);

    return { x0, y0, bodyLen, thickness, angle };
  }

  // Logic vẽ line giống Join-hands-feet: line nằm giữa 2 điểm, setRotation + setDisplaySize.
  // `trimStart/trimEnd` dùng để "rút" line ra khỏi tâm lỗ theo hướng nối (tạo cảm giác như sợi chỉ chui từ lỗ ra).
  updateLineSprite(
    line: Phaser.GameObjects.Image,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    thickness: number,
    trimStart = 0,
    trimEnd = 0
  ) {
    let dx = x2 - x1;
    let dy = y2 - y1;
    const baseDist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const ux = dx / baseDist;
    const uy = dy / baseDist;

    const maxTrim = Math.max(0, baseDist / 2 - 1);
    const s = Math.min(Math.max(0, trimStart), maxTrim);
    const e = Math.min(Math.max(0, trimEnd), maxTrim);

    const ax1 = x1 + ux * s;
    const ay1 = y1 + uy * s;
    const ax2 = x2 - ux * e;
    const ay2 = y2 - uy * e;

    dx = ax2 - ax1;
    dy = ay2 - ay1;
    const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const angle = Math.atan2(dy, dx);

    line.setPosition((ax1 + ax2) / 2, (ay1 + ay2) / 2);
    line.setRotation(angle);
    line.setDisplaySize(dist, thickness);
  }

  drawAllLines() {
    if (!this.matches) return;

    for (let i = 0; i < this.matches.length; i++) {
      if (!this.matches[i]) {
        const line = this.matchedLines[i];
        if (line) line.setVisible(false);
        continue;
      }

      const startCard = this.numbers[i];
      const objIdx = this.matchedObjectIdx[i];
      if (objIdx == null) continue;
      const endCard = this.objects[objIdx];

      const start = this.getHolePos(startCard, "right", 0);
      const end = this.getHolePos(endCard, "left", 0);

      const rStart = this.getHoleRadius(startCard);
      const rEnd = this.getHoleRadius(endCard);

      const thickness = Math.min(rStart, rEnd) * 2 * LINE_THICKNESS_FACTOR;
      const trimStart = rStart * LINE_INNER_FACTOR;
      const trimEnd = rEnd * LINE_INNER_FACTOR;

      let line = this.matchedLines[i];
      if (!line) {
        line = this.add.image(0, 0, "line_glow").setOrigin(0.5).setAlpha(1);
        this.matchedLines[i] = line;
      }
      this.updateLineSprite(line, start.x, start.y, end.x, end.y, thickness, trimStart, trimEnd);
      line.setVisible(true);
    }
  }

  create() {
    const cam = this.cameras.main;
    const width = cam.width;
    const height = cam.height;
        // Hiện nút viewport ở màn game
    (window as any).setGameButtonsVisible?.(true);

    this.input.setDefaultCursor("default");

    

    // ===== INTRO: lần chạm đầu chỉ để unlock audio; sau đó intro tự phát mỗi level
    this.introPlayedThisLevel = false;
    this.introCanceledThisLevel = false;
    this.input.off("pointerdown", this.handleAnyPointerDown, this);
    this.input.on("pointerdown", this.handleAnyPointerDown, this);

    if ((window as any)[AUDIO_UNLOCKED_KEY]) {
      this.time.delayedCall(0, () => this.playIntroOnce());
    }



    const level = this.levels[this.level];

    // Random background viewport cho màn game (ngoài canvas)
    (window as any).setRandomGameViewportBg?.();

    // ===== GÁN ASSET PRELOAD CHO NÚT VIEWPORT =====
    const replayBtnEl = document.getElementById("btn-replay") as HTMLButtonElement | null;
    const nextBtnEl = document.getElementById("btn-next") as HTMLButtonElement | null;

    const setBtnBgFromUrl = (el: HTMLButtonElement | null, url: string | undefined) => {
      if (!el || !url) return;
      el.style.backgroundImage = `url("${url}")`;
      el.style.backgroundRepeat = "no-repeat";
      el.style.backgroundPosition = "center";
      el.style.backgroundSize = "contain";
    };

    setBtnBgFromUrl(replayBtnEl, BUTTON_ASSET_URLS.replay_svg);
    setBtnBgFromUrl(nextBtnEl, BUTTON_ASSET_URLS.next_svg);

    const ensureNearest = (key: string | undefined) => {
      if (!key) return;
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    };

    if (level) {
      ensureNearest(level.background);
      ensureNearest(level.character);
    }

    ["line_glow"].forEach((key) => ensureNearest(key));

    let scaleBG = 1;
    this.scaleBG = 1;

    // ===== CHARACTER =====
    let scaleChar: number;
    let charX: number;
    const charY = height - 10;

    const baseCharScale = height / 720;
    scaleChar = baseCharScale * 0.55;
    charX = width * 0.17;

        if (this.textures.exists(level.character)) {
          const charImg = this.add
            .image(charX, charY, level.character)
            .setOrigin(0.5, 1)
            .setScale(scaleChar);

          // Animation: nhún + lắc nhẹ
          this.tweens.add({
            targets: charImg,
            y: charY - height * 0.02,
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: "Sine.inOut",
          });

          this.tweens.add({
            targets: charImg,
            angle: { from: -2, to: 2 },
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: "Sine.inOut",
          });

          // Debug thông tin ảnh nhân vật (tuỳ bạn giữ hay bỏ)
          const charFrame = charImg.texture.getSourceImage();
          const charOrigW = charFrame.width || charImg.texture.get().width;
          const charOrigH = charFrame.height || charImg.texture.get().height;
        } else {
          this.add
            .text(charX, charY, "😊", {
              fontSize: `${Math.round(120 * scaleChar)}px`,
            })
            .setOrigin(0.5, 1);
        }


    // ===== BOARD =====
    const items = level.items;
    const shuffled = Phaser.Utils.Array.Shuffle([...items]);

    const boardOrigW = 1603;
    const boardOrigH = 1073;

    let boardAreaW: number;
    let boardAreaH: number;
    let boardX: number;
    let boardY: number;

    const marginX = width * 0.05;
    const spanW = width - 2 * marginX;
    boardAreaW = spanW * 0.9;
    boardAreaH = height * 0.7;
    boardX = width * 0.56;
    boardY = height * 0.57; // dịch bảng xuống một chút

    let scaleBoard = Math.min(
      boardAreaW / boardOrigW,
      boardAreaH / boardOrigH,
      1
    );
    const boardW = boardOrigW * scaleBoard;
    const boardH = boardOrigH * scaleBoard;

    // ===== BANNER CÂU HỎI (ASSET IMAGE) =====
    const bannerY = height * 0.12; // vị trí gần đầu màn hình
    const bannerScale = 0.65; // tăng scale banner

    if (this.textures.exists("banner")) {
      const banner = this.add
        .image(width / 2, bannerY, "banner")
        .setOrigin(0.5)
        .setScale(bannerScale);

      this.questionBanner = banner;
    }

    if (this.textures.exists("text")) {
      const textImg = this.add
        .image(width / 2, bannerY, "text")
        .setOrigin(0.5)
        .setScale(bannerScale * 0.9); // hơi nhỏ hơn banner một chút

      this.promptText = textImg;
    }



    if (this.textures.exists("board")) {
      const boardImg = this.add
        .image(boardX, boardY, "board")
        .setOrigin(0.5)
        .setScale(scaleBoard);
      const boardFrame = boardImg.texture.getSourceImage();
      const boardOrigW2 = boardFrame.width || boardImg.texture.get().width;
      const boardOrigH2 = boardFrame.height || boardImg.texture.get().height;
    }

    const colObjX = boardX - boardW * 0.25;
    const colNumX = boardX + boardW * 0.25;

    this.numbers = [];
    this.objects = [];

    const cardGap = 20 * scaleBoard;
    const cardW = 685 * scaleBoard;
    const cardH = 249 * scaleBoard;
    const totalH = 4 * cardH + 3 * cardGap;
    const verticalNudge = boardH * 0.012;
    const baseY = boardY - totalH / 2 + cardH / 2 + verticalNudge;

    // ===== NUMBER CARDS (LEFT) =====
    this.matches = Array(4).fill(false);

    items.forEach((item, i) => {
      const y = baseY + i * (cardH + cardGap);

      const card = this.add
        .image(colObjX, y, "card")
        .setOrigin(0.5)
        .setDisplaySize(cardW, cardH) as ImageWithData;

      const cardFrame = card.texture.getSourceImage();
      const cardOrigW = cardFrame.width || card.texture.get().width;
      const cardOrigH = cardFrame.height || card.texture.get().height;

      const hoverTint = 0xfff9c4;
      const activeTint = 0xffe082;

      card.setInteractive({
        useHandCursor: true,
        cursor: "pointer",
        draggable: true,
      });

      card.on("pointerover", () => {
        if (!this.matches[i] && this.dragStartIdx !== i) {
          card.setTint(hoverTint);
        }
      });

      card.on("pointerout", () => {
        if (!this.matches[i] && this.dragStartIdx !== i) {
          card.clearTint();
        }
      });

      this.add
        .text(colObjX, y, String(item.number), {
          fontFamily: "Fredoka",
          fontSize: `${Math.round(cardH * 0.65)}px`,
          color: "#ff006e",
          fontStyle: "900",
          stroke: "#fff",
          strokeThickness: Math.round(cardH * 0.08),
          resolution: 2,
          align: "center",
        })
        .setOrigin(0.5, 0.5);

      card.customData = {
        index: i,
        number: item.number,
        cardW,
        cardH,
      };

      card.hoverTint = hoverTint;
      card.activeTint = activeTint;

      this.numbers.push(card);
    });

    // ===== OBJECT CARDS (RIGHT) =====
    shuffled.forEach((item, i) => {
      const y = baseY + i * (cardH + cardGap);

      const card = this.add
        .image(colNumX, y, "card2")
        .setOrigin(0.5)
        .setDisplaySize(cardW, cardH) as ImageWithData;

      const card2Frame = card.texture.getSourceImage();
      const card2OrigW = card2Frame.width || card.texture.get().width;
      const card2OrigH = card2Frame.height || card.texture.get().height;

      const dropHoverTint = 0xc8e6ff;

      card.setInteractive({ useHandCursor: true, cursor: "pointer" });

      card.on("pointerover", () => {
        if (!this.objectsMatched[i]) {
          card.setTint(dropHoverTint);
        }
      });

      card.on("pointerout", () => {
        if (this.objectsMatched[i]) {
          card.setTint(MATCH_TINT);
        } else {
          card.clearTint();
        }
      });

      if (this.textures.exists(item.asset)) {
        const tmp = this.add.image(0, 0, item.asset);
        const aW = tmp.width;
        const aH = tmp.height;
        const iconFrame = tmp.texture.getSourceImage();
        const iconOrigW = iconFrame.width || tmp.texture.get().width;
        const iconOrigH = iconFrame.height || tmp.texture.get().height;
        tmp.destroy();

        const count = item.number;
        let gapX = -5;
        // Thu nhỏ khoảng cách khi có 2 trống / 2 ô màu
        if (
          count === 2 &&
          (item.asset === "drum" || item.asset === "red" || item.asset === "yellow")
        ) {
          gapX = -20;
        }

        // Giới hạn chiều cao icon để không tràn thẻ
        // Kích thước scale trước là 1 icon sau là 2 icon 
        const maxIconHeight = cardH * (count === 1 ? 1.12 : 1.12);
        let iconScale = maxIconHeight / aH;

        // ===== BOOST RIÊNG MỘT SỐ ICON =====
        if (item.asset === "drum") {
          // Trống thường nhỏ → boost lớn hơn
          iconScale *= 1.35;
        }
        if (item.asset === "marble") {
          iconScale *= 0.9;
        }
        if (item.asset === "babie") {
          iconScale *= 0.95;
        }
        if (item.asset === "bear") {
          iconScale *= 0.96;
        }
        if (item.asset === "red" || item.asset === "yellow") {
          iconScale *= 1.3;
        }

        // Giới hạn scale tối đa theo từng asset
        let maxScale = 1;
        if (item.asset === "drum") {
          maxScale = 2.0;
        } else if (item.asset === "red" || item.asset === "yellow") {
          maxScale = 1.7;
        }
        if (iconScale > maxScale) {
          iconScale = maxScale;
        }

        const iconWidthScaled = aW * iconScale;
        const totalWidth = count * iconWidthScaled + (count - 1) * Math.abs(gapX);
        const maxWidth = cardW * 0.9;
        if (totalWidth > maxWidth) {
          const shrink = maxWidth / totalWidth;
          iconScale *= shrink;
        }

        iconScale = Math.round(iconScale * 1000) / 1000;


        const stepX = aW * iconScale + gapX;
        const groupWidth = aW * iconScale + (count - 1) * stepX;

        const startX = colNumX - groupWidth / 2 + (aW * iconScale) / 2;

        // 👉 ĐẨY TOÀN BỘ ICON LÊN MỘT CHÚT
        const iconYOffset = -cardH * 0.015; // 1% chiều cao thẻ, thích thì chỉnh 0.01 / 0.02

        // Offset riêng cho từng asset (căn lại vị trí)
        let extraOffsetX = 0;
        let extraOffsetY = 0;

        if (item.asset === "rabbit") {
          // Đẩy thỏ lên cao hơn một chút
          extraOffsetY = -cardH * 0.06;
        } else if (item.asset === "marble") {
          // Đẩy bi lên cao hơn một chút
          extraOffsetY = -cardH * 0.05;
        }

        for (let k = 0; k < count; k++) {
          const iconImg = this.add
            .image(
              startX + k * stepX + extraOffsetX,
              y + iconYOffset + extraOffsetY,
              item.asset
            )
            .setOrigin(0.5, 0.5)
            .setScale(iconScale);
        }

      }

      this.add
        .text(colNumX, y + cardH / 2 - 32 * scaleBG, item.label || "", {
          fontFamily: "Fredoka",
          fontSize: `${Math.round(48 * scaleBG)}px`,
          color: "#222",
          stroke: "#fff",
          strokeThickness: 6,
          shadow: {
            offsetX: 0,
            offsetY: 2,
            color: "#000",
            blur: 4,
          },
          resolution: 2,
          align: "center",
        })
        .setOrigin(0.5, 0.5);

      card.customData = {
        index: i,
        number: item.number,
        asset: item.asset,
        cardW,
        cardH,
      };

      this.objects.push(card);
    });

    // ===== HAND HINT – CHỈ LẦN ĐẦU VÀO GAME =====
    const win = window as any;
    if (!win[HAND_TUTORIAL_KEY]) {
      win[HAND_TUTORIAL_KEY] = true;
      this.createHandHintForFirstPair(items);
    }

    // ===== DRAG CONNECT =====
    this.matchedLines = Array(4).fill(null);
    this.dragLine = null;
    this.isDragging = false;
    this.dragStartIdx = null;
    this.matches = Array(4).fill(false);
    this.matchedObjectIdx = Array(4).fill(null);
    this.objectsMatched = Array(this.objects.length).fill(false);

    this.numbers.forEach((numCard, idx) => {
      numCard.on("pointerdown", () => {
        if (this.matches[idx]) return;

        // Nếu voice_intro vẫn đang phát mà user bắt đầu nối,
        // dừng toàn bộ audio rồi bật lại BGM để tránh chồng tiếng.
        this.hideHandHint();
        this.introCanceledThisLevel = true;
        AudioManager.cancelRetry("voice_intro");
        AudioManager.stop("voice_intro");
        ensureBgmStarted();

        this.isDragging = true;
        this.dragStartIdx = idx;

        if (numCard.activeTint) {
          numCard.setTint(numCard.activeTint);
        }

        const start = this.getHolePos(numCard, "right", 0);
        const r = this.getHoleRadius(numCard);
        const thick = r * 2 * LINE_THICKNESS_FACTOR;

        this.dragLine = this.add
          .image(start.x, start.y, "line_glow")
          .setOrigin(0.5)
          .setDisplaySize(1, thick)
          .setAlpha(0);

        this.tweens.add({
          targets: this.dragLine,
          alpha: { from: 0, to: 1 },
          duration: 120,
          ease: "Quad.Out",
        });
      });
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.isDragging || this.dragStartIdx === null || !this.dragLine) return;

      const startCard = this.numbers[this.dragStartIdx];
      const dyC = p.y - startCard.y;

      // Kéo lên  -> s = -1  (dịch lỗ lên)
      // Kéo xuống -> s =  1  (dịch lỗ xuống)
      const s = dyC < 0 ? -1 : 1;

      const start = this.getHolePos(startCard, "right", s);
      const rStart = this.getHoleRadius(startCard);

      const thickness = rStart * 2 * LINE_THICKNESS_FACTOR;
      const trimStart = rStart * LINE_INNER_FACTOR;
      this.updateLineSprite(this.dragLine, start.x, start.y, p.x, p.y, thickness, trimStart, 0);
    });


    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (!this.isDragging || this.dragStartIdx === null) return;

      const startIndex = this.dragStartIdx;
      const startCard = this.numbers[startIndex];
      const n = items[startIndex].number;

      let matched = false;

      this.objects.forEach((objCardRaw, objIdx) => {
        const b = objCardRaw.getBounds();
        if (!Phaser.Geom.Rectangle.Contains(b, p.x, p.y)) return;

        const objCard = objCardRaw;
        const objN = objCard.customData!.number;
        const objAlreadyMatched = !!this.objectsMatched[objIdx];

        // Sai nếu số không khớp HOẶC thẻ vật đã được nối trước đó
        if ((n !== objN || objAlreadyMatched) && !this.matches[startIndex]) {
          const playLocked = (window as any).playVoiceLocked as
            | ((s: Phaser.Sound.BaseSoundManager, k: string) => void)
            | undefined;
          // Phát âm sai qua AudioManager
          AudioManager.play("sfx_wrong");
        }

        // Đúng chỉ khi số khớp và thẻ vật CHƯA được nối
        if (n === objN && !objAlreadyMatched && !this.matches[startIndex]) {
          matched = true;
          this.matches[startIndex] = true;
          this.objectsMatched[objIdx] = true;
          this.matchedObjectIdx[startIndex] = objIdx;

          AudioManager.play("sfx_correct");
          // Phát random correct answer qua AudioManager
          AudioManager.playCorrectAnswer();

          startCard.clearTint().setTint(MATCH_TINT);
          objCard.clearTint().setTint(MATCH_TINT);

          // Không đổi texture sau khi nối đúng (giữ asset Group 13/17).

          if (this.dragLine) {
            const st = this.getHolePos(startCard, "right", 0);
            const ed = this.getHolePos(objCard, "left", 0);

            const rStart = this.getHoleRadius(startCard);
            const rEnd = this.getHoleRadius(objCard);

            const thickness = Math.min(rStart, rEnd) * 2 * LINE_THICKNESS_FACTOR;
            const trimStart = rStart * LINE_INNER_FACTOR;
            const trimEnd = rEnd * LINE_INNER_FACTOR;
            this.updateLineSprite(this.dragLine, st.x, st.y, ed.x, ed.y, thickness, trimStart, trimEnd);

            this.matchedLines[startIndex] = this.dragLine;
            this.dragLine = null;
          }
        }
      });

      if (!matched) {
        if (this.dragLine) this.dragLine.destroy();
        if (!this.matches[startIndex]) startCard.clearTint();
      }

      this.isDragging = false;
      this.dragStartIdx = null;

      if (this.matches.every((m) => m)) {
        this.seenLevels[this.level] = true;
        const remaining: number[] = [];
        for (let li = 0; li < this.seenLevels.length; li++) {
          if (!this.seenLevels[li]) remaining.push(li);
        }
        const nextLevel =
          remaining.length > 0
            ? remaining[Math.floor(Math.random() * remaining.length)]
            : null;

        this.time.delayedCall(1500, () => {
          // Phát voice_complete qua AudioManager
          AudioManager.play("voice_complete");

          // Tự động chuyển màn sau khi phát âm hoàn thành
          this.time.delayedCall(100, () => {
            if (nextLevel == null) {
              this.scene.start("EndGameScene");
            } else {
              this.scene.restart({ level: nextLevel, seenLevels: this.seenLevels });
            }
          });
        });
      }
    });
  }

  // Tay gợi ý cho cặp đầu tiên
  createHandHintForFirstPair(items: LevelItem[]) {
    if (!this.textures.exists(HAND_ASSET_KEY)) return;
    if (!this.numbers || !this.objects || this.numbers.length === 0) return;

    for (let i = 0; i < this.numbers.length; i++) {
      const numCard = this.numbers[i];
      const n = items[i]?.number;
      if (n == null) continue;

      const objCard = this.objects.find(
        (o) => o.customData && o.customData.number === n
      );
      if (!objCard) continue;

      const startPos = this.getHolePos(numCard, "right", 0);
      const rawEndPos = this.getHolePos(objCard, "left", 0);

      const extraIntoObject = objCard.displayWidth * 0.55;

      const endPos = {
        x: rawEndPos.x + extraIntoObject,
        y: rawEndPos.y,
      };

      const handScale = this.scaleBG * 0.6;

      this.handHint = this.add
        .image(startPos.x, startPos.y, HAND_ASSET_KEY)
        .setOrigin(HAND_FINGER_ORIGIN_X, HAND_FINGER_ORIGIN_Y)
        .setScale(handScale)
        .setAlpha(0.95);

      this.tweens.add({
        targets: this.handHint,
        x: endPos.x,
        y: endPos.y,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });

      this.tweens.add({
        targets: this.handHint,
        angle: { from: -8, to: 8 },
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });

      break;
    }
  }

  redrawLines() {
    this.drawAllLines();
  }

  createButton(
    x: number,
    y: number,
    label: string,
    assetKey: string | null,
    bgColor: string | null,
    onClick: () => void,
    size: number = 32
  ): Phaser.GameObjects.GameObject {
    let btn: Phaser.GameObjects.GameObject;

    if (assetKey && this.textures.exists(assetKey)) {
      const img = this.add
        .image(x, y, assetKey)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true, cursor: "pointer" })
        .setDisplaySize(size, size);

      img.on("pointerdown", onClick);
      btn = img;
    } else {
      const txt = this.add
        .text(x, y, label, {
          fontFamily: "Fredoka",
          fontSize: `${size}px`,
          color: "#fff",
          backgroundColor: bgColor || undefined,
          padding: { left: 16, right: 16, top: 8, bottom: 8 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true, cursor: "pointer" });

      txt.on("pointerdown", onClick);
      btn = txt;
    }

    return btn;
  }

  isLevelComplete(): boolean {
    return this.matches.every((m) => m);
  }
}
