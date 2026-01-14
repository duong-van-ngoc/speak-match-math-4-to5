import Phaser from 'phaser';
import type { LevelConfig } from './types';
import AudioManager from './AudioManager';
import { ChoiceFeedback } from './ChoiceFeedback'; // ✅ file riêng
import { game as irukaGame } from "@iruka-edu/mini-game-sdk";

type GameState =
  | 'SHOW_LEVEL'
  | 'WAIT_CHOICE'
  | 'CHECK_CHOICE'
  | 'BALANCING'
  | 'LEVEL_END'
  | 'GAME_END';

type Subject = 'SNAIL' | 'AQUARIUM';
type Side = 'LEFT' | 'RIGHT';

// ✅ 2 asset trái/phải cho mỗi subject
const STACK_TEXTURE: Record<Subject, { LEFT: string; RIGHT: string }> = {
  SNAIL: { LEFT: 'snail1', RIGHT: 'snail2' },
  AQUARIUM: { LEFT: 'aquarium1', RIGHT: 'aquarium2' },
};

// ✅ asset UI mới
const PICK_X_KEY = 'pick_x';
const RESULT_CORRECT_KEY = 'result_correct';
const RESULT_WRONG_KEY = 'result_wrong';
const ANSWER_DEFAULT = 'answer_default';

// ✅ asset chữ câu hỏi (banner text bằng image)
const QUESTION_IMG_KEY: Record<Subject, string> = {
  SNAIL: 'q_less_snail',
  AQUARIUM: 'q_less_aquarium',
};

// ===== SCALE =====
const BOARD_SCALE = 1.0;

const BASE_BOARD_WIDTH = 900;
const BASE_BOARD_HEIGHT = 550;

const BASE_ANSWER_SCALE = 0.6;
const BASE_ITEM_SCALE = 0.55;
const BASE_ITEM_GAP_Y = 18;
const BASE_ITEM_GAP_X = 10;

const BOARD_WIDTH = BASE_BOARD_WIDTH * BOARD_SCALE;
const BOARD_HEIGHT = BASE_BOARD_HEIGHT * BOARD_SCALE;

const ANSWER_SCALE = BASE_ANSWER_SCALE * BOARD_SCALE;
const ITEM_SCALE = BASE_ITEM_SCALE * BOARD_SCALE;
const ITEM_GAP_Y = BASE_ITEM_GAP_Y * BOARD_SCALE;
const ITEM_GAP_X = BASE_ITEM_GAP_X * BOARD_SCALE;

// ===== LAYOUT =====
const BOARD_TOP_Y = 140; // từ đỉnh viewport đến đỉnh board
const BANNER_Y = 80; // từ đỉnh viewport đến tâm banner
const BANNER_SCALE = 0.65; // scale gốc của banner câu hỏi

// ✅ khoảng cách từ đáy BOARD lên nút chọn (giữ để tạo vị trí tạm ban đầu)
const BUTTON_BOTTOM_MARGIN = 70; // từ đáy board đến tâm nút
const BUTTON_OFFSET_Y = 0; // dịch thêm Y cho nút (dương => lên, âm => xuống)

// ✅ khoảng cách giữa stack và nút (dùng làm “gap” khi căn trên/dưới)
const STACK_GAP_ABOVE_BUTTON = 20;

const PROMPT_FONT_SIZE = 30; // font size gốc của prompt text (fallback)
const FEEDBACK_FONT_SIZE = 22; // font size gốc của feedback text
const FEEDBACK_BOTTOM_MARGIN = 40;

const BOARD_RESULT_MARGIN_X = 26; // từ phải board đến tâm badge kết quả
const BOARD_RESULT_MARGIN_Y = 26; // từ đáy board đến tâm badge kết quả

const PICK_X_SCALE = 0.55 * BOARD_SCALE; // scale gốc của icon X khi chọn
const RESULT_BADGE_SCALE = 0.75 * BOARD_SCALE; // scale gốc của badge đúng/sai

// ✅ scale ảnh chữ trong banner (tune)
const PROMPT_IMG_SCALE = 0.7 * BOARD_SCALE;

const QUESTION_VOICE_KEY: Record<Subject, string> = {
  SNAIL: 'less_snail',
  AQUARIUM: 'less_aquarium',
};

/** ✅ TUNE trái/phải */
const BOARD_INNER_PADDING_X = 40 * BOARD_SCALE; // tăng => cụm vào trong
const COLUMN_RATIO_LEFT = 0.2; // từ trái board đến cột trái
const COLUMN_RATIO_RIGHT = 0.8; // từ trái board đến cột phải

/** ✅ TUNE trên/dưới */
const BOARD_INNER_PADDING_TOP = 26 * BOARD_SCALE; // tăng => cụm xuống
const BOARD_INNER_PADDING_BOTTOM = 26 * BOARD_SCALE; // tăng => cụm lên

/**
 * ✅ FIX “asset bị lệch” do PNG có vùng trong suốt (padding) không cân
 * - x dương: đẩy hình sang phải | x âm: sang trái
 * - y dương: đẩy hình xuống     | y âm: đẩy hình lên
 *
 * Tune aquarium1/aquarium2 là chủ yếu.
 */
const STACK_BIAS_BY_KEY: Record<string, { x: number; y: number }> = {
  snail1: { x: 0, y: 0 },
  snail2: { x: 0, y: 0 },

  aquarium1: { x: 5, y: -25 },
  aquarium2: { x: -10, y: -25 },
};


export default class GameScene extends Phaser.Scene {
  public levels: LevelConfig[] = [];
  public levelIndex = 0;
  public score = 0;
  public level = 0;

  private gameState: GameState = 'SHOW_LEVEL';

  // ✅ promptText giữ làm fallback
  private promptText!: Phaser.GameObjects.Text;
  // ✅ promptImage: chữ trong banner bằng asset
  private promptImage?: Phaser.GameObjects.Image;

  private feedbackText!: Phaser.GameObjects.Text;

  private leftBtn!: Phaser.GameObjects.Image;
  private rightBtn!: Phaser.GameObjects.Image;
  private questionBanner!: Phaser.GameObjects.Image;

  private leftStack!: Phaser.GameObjects.Container;
  private rightStack!: Phaser.GameObjects.Container;

  private cornerCharacter?: Phaser.GameObjects.Image;
  private leftPickX!: Phaser.GameObjects.Image;
  private rightPickX!: Phaser.GameObjects.Image;
  private resultBadge!: Phaser.GameObjects.Image;

  private boardX = 0;
  private boardY = 0;

  private levelSubjects: Subject[] = [];
  private levelQuestions: string[] = [];

  public subgameEntered = false;
  public subgameDone = false;

  // ✅ helper animation/feedback (1 lệnh)
  private choiceFeedback!: ChoiceFeedback;

  constructor() {
    super('GameScene');
  }

  init(data: { levelIndex?: number; score?: number }) {
    this.levelIndex = data.levelIndex ?? 0;
    this.level = this.levelIndex;
    this.score = data.score ?? 0;

    this.subgameEntered = false;
    this.subgameDone = false;

    // ✅ quan trọng: scene restart sẽ destroy object cũ nhưng class field vẫn giữ reference
    this.promptImage = undefined;

    const globalKey = '__comparisonLevels__';

    if (this.levelIndex === 0 || !(window as any)[globalKey]) {
      const { levels, subjects, questions } = this.generateLevels(2);
      this.levels = levels;
      this.levelSubjects = subjects;
      this.levelQuestions = questions;
      (window as any)[globalKey] = { levels, subjects, questions };
    } else {
      const saved = (window as any)[globalKey];
      this.levels = saved.levels;
      this.levelSubjects = saved.subjects;
      this.levelQuestions = saved.questions;
    }

    // SDK: set tổng số câu hỏi
    irukaGame.setTotal(this.levels.length);
    // Khởi tạo trạng thái game cho SDK
    (window as any).irukaGameState = {
      startTime: Date.now(),
      currentScore: this.score,
    };
  }

  public isLevelComplete(): boolean {
    return this.subgameDone;
  }

  // ...existing code...

  /** ✅ căn trái/phải theo board, dùng displayWidth thật của nút để khỏi “kênh” */
  private layoutColumns(btnY: number, stackY: number) {
    const boardLeft = this.boardX;
    const boardRight = this.boardX + BOARD_WIDTH;

    const halfBtnW = this.leftBtn.displayWidth / 2;
    const usableLeft = boardLeft + BOARD_INNER_PADDING_X + halfBtnW;
    const usableRight = boardRight - BOARD_INNER_PADDING_X - halfBtnW;
    const usableW = Math.max(0, usableRight - usableLeft);

    const leftX = usableLeft + usableW * COLUMN_RATIO_LEFT;
    const rightX = usableLeft + usableW * COLUMN_RATIO_RIGHT;

    this.leftBtn.setPosition(leftX, btnY);
    this.rightBtn.setPosition(rightX, btnY);

    this.leftPickX.setPosition(this.leftBtn.x, this.leftBtn.y);
    this.rightPickX.setPosition(this.rightBtn.x, this.rightBtn.y);

    this.leftStack.setPosition(this.leftBtn.x, stackY);
    this.rightStack.setPosition(this.rightBtn.x, stackY);
  }
  // ...existing code...

  /** ✅ căn trên/dưới: block(stack + gap + button) nằm cân giữa trong board */
  private layoutVerticalBalanced() {
    if (!this.leftStack || !this.rightStack || !this.leftBtn || !this.rightBtn) return;

    const boardTop = this.boardY + BOARD_INNER_PADDING_TOP;
    const boardBottom = this.boardY + BOARD_HEIGHT - BOARD_INNER_PADDING_BOTTOM;
    const boardH = Math.max(0, boardBottom - boardTop);

    const bL = this.leftStack.getBounds();
    const bR = this.rightStack.getBounds();
    const stackH = Math.max(bL.height, bR.height);

    const btnH = Math.max(this.leftBtn.displayHeight, this.rightBtn.displayHeight);
    const gap = STACK_GAP_ABOVE_BUTTON * BOARD_SCALE;

    const blockH = stackH + gap + btnH;
    const topY = boardTop + Math.max(0, (boardH - blockH) / 2);

    const currentTop = Math.min(bL.top, bR.top);
    const deltaY = topY - currentTop;

    this.leftStack.y += deltaY;
    this.rightStack.y += deltaY;

    const nL = this.leftStack.getBounds();
    const nR = this.rightStack.getBounds();
    const newStackBottom = Math.max(nL.bottom, nR.bottom);

    const btnY = newStackBottom + gap + btnH / 2;

    this.leftBtn.y = btnY;
    this.rightBtn.y = btnY;

    this.leftPickX.y = btnY;
    this.rightPickX.y = btnY;
  }

  create() {
    const { width, height } = this.scale;

    if ((window as any).setGameButtonsVisible) (window as any).setGameButtonsVisible(true);
    if ((window as any).setRandomGameViewportBg) (window as any).setRandomGameViewportBg();

    const audioUnlockedKey = '__questionAudioUnlocked__';
    const audioUnlocked = !!(window as any)[audioUnlockedKey];

    if (audioUnlocked) {
      this.playCurrentQuestionVoice();
    } else {
      this.input.once('pointerdown', () => {
        (window as any)[audioUnlockedKey] = true;
        this.playCurrentQuestionVoice();
      });
    }

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

    // ===== BOARD =====
    this.boardX = (width - BOARD_WIDTH) / 2 + 65;
    this.boardY = BOARD_TOP_Y;
    const boardCenterX = this.boardX + BOARD_WIDTH / 2;

    this.add
      .image(this.boardX + BOARD_WIDTH / 2, this.boardY + BOARD_HEIGHT / 2, 'banner_question')
      .setDisplaySize(BOARD_WIDTH, BOARD_HEIGHT)
      .setOrigin(0.5);

    // Banner câu hỏi
    const bannerY = BANNER_Y;
    this.questionBanner = this.add
      .image(boardCenterX, bannerY, 'btn_primary_pressed')
      .setOrigin(0.5)
      .setScale(BANNER_SCALE * BOARD_SCALE);

    // ✅ promptText fallback (ẩn/hiện tuỳ có asset)
    this.promptText = this.add
      .text(boardCenterX, bannerY, '', {
        fontFamily: 'Fredoka, San Francisco, "Noto Sans", system-ui, sans-serif',
        fontSize: `${PROMPT_FONT_SIZE * BOARD_SCALE}px`,
        fontStyle: '700',
        color: '#FFFFFF',
        align: 'center',
        stroke: '#222',
        strokeThickness: 4,
        resolution: 2,
      })
      .setOrigin(0.5);

    const btnY = this.boardY + BOARD_HEIGHT - BUTTON_BOTTOM_MARGIN * BOARD_SCALE + BUTTON_OFFSET_Y;

    this.leftBtn = this.add
      .image(boardCenterX - 200, btnY, ANSWER_DEFAULT)
      .setScale(ANSWER_SCALE)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.handleChoice('LEFT'))
      .on('pointerover', () => {
        if (this.gameState === 'WAIT_CHOICE') this.leftBtn.setTint(0xffffaa).setAlpha(0.95);
      })
      .on('pointerout', () => this.leftBtn.clearTint().setAlpha(1));

    this.rightBtn = this.add
      .image(boardCenterX + 200, btnY, ANSWER_DEFAULT)
      .setScale(ANSWER_SCALE)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.handleChoice('RIGHT'))
      .on('pointerover', () => {
        if (this.gameState === 'WAIT_CHOICE') this.rightBtn.setTint(0xffffaa).setAlpha(0.95);
      })
      .on('pointerout', () => this.rightBtn.clearTint().setAlpha(1));

    this.leftPickX = this.add
      .image(this.leftBtn.x, this.leftBtn.y, PICK_X_KEY)
      .setScale(PICK_X_SCALE)
      .setVisible(false)
      .setDepth(50);

    this.rightPickX = this.add
      .image(this.rightBtn.x, this.rightBtn.y, PICK_X_KEY)
      .setScale(PICK_X_SCALE)
      .setVisible(false)
      .setDepth(50);

    const stackY = btnY - this.leftBtn.displayHeight / 2 - STACK_GAP_ABOVE_BUTTON * BOARD_SCALE;

    this.leftStack = this.add.container(this.leftBtn.x, stackY);
    this.rightStack = this.add.container(this.rightBtn.x, stackY);

    this.layoutColumns(btnY, stackY);

    this.resultBadge = this.add
      .image(
        this.boardX + BOARD_WIDTH - BOARD_RESULT_MARGIN_X,
        this.boardY + BOARD_HEIGHT - BOARD_RESULT_MARGIN_Y,
        RESULT_CORRECT_KEY,
      )
      .setOrigin(1, 1)
      .setScale(RESULT_BADGE_SCALE)
      .setVisible(false)
      .setDepth(60);

    // ✅ init helper (sau khi đã có đủ refs)
    this.choiceFeedback = new ChoiceFeedback({
      scene: this,
      leftBtn: this.leftBtn,
      rightBtn: this.rightBtn,
      leftPickX: this.leftPickX,
      rightPickX: this.rightPickX,
      leftStack: this.leftStack,
      rightStack: this.rightStack,
      resultBadge: this.resultBadge,
      answerScale: ANSWER_SCALE,
      pickXScale: PICK_X_SCALE,
      boardScale: BOARD_SCALE,
      resultBadgeScale: RESULT_BADGE_SCALE,
      resultCorrectKey: RESULT_CORRECT_KEY,
      resultWrongKey: RESULT_WRONG_KEY,
    });

    // ===== NHÂN VẬT NỀN =====
    const baseCharScale = height / 720;
    const charScale = baseCharScale * 0.55;
    const charX = width * 0.1;
    const charY = height - 10;

    this.cornerCharacter = this.add
      .image(charX, charY, 'char')
      .setOrigin(0.5, 1)
      .setScale(charScale)
      .setDepth(15);

    this.tweens.add({
      targets: this.cornerCharacter,
      y: charY - height * 0.02,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    this.tweens.add({
      targets: this.cornerCharacter,
      angle: { from: -2, to: 2 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    this.feedbackText = this.add
      .text(width / 2, height - FEEDBACK_BOTTOM_MARGIN, '', {
        fontSize: `${FEEDBACK_FONT_SIZE * BOARD_SCALE}px`,
        color: '#333',
      })
      .setOrigin(0.5);

    (window as any).playCurrentQuestionVoice = () => this.playCurrentQuestionVoice();

    this.startLevel();
  }

  private generateLevels(numLevels: number): {
    levels: LevelConfig[];
    subjects: Subject[];
    questions: string[];
  } {
    const baseSubjects: Subject[] = ['SNAIL', 'AQUARIUM'];

    for (let i = baseSubjects.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [baseSubjects[i], baseSubjects[j]] = [baseSubjects[j], baseSubjects[i]];
    }

    const total = Math.min(numLevels, baseSubjects.length);

    const levels: LevelConfig[] = [];
    const subjects: Subject[] = [];
    const questions: string[] = [];

    for (let i = 0; i < total; i++) {
      const subject = baseSubjects[i];

      const leftCount = 1;
      const rightCount = 1;

      levels.push({
        id: i + 1,
        leftCount,
        rightCount,
        mode: 'LESS' as any,
      });

      subjects.push(subject);
    }

    return { levels, subjects, questions };
  }

  private playCurrentQuestionVoice() {
    if (this.levelIndex >= this.levels.length || !this.levelSubjects[this.levelIndex]) return;
    const subject = this.levelSubjects[this.levelIndex];
    const voiceKey = QUESTION_VOICE_KEY[subject];
    try {
      AudioManager.play(voiceKey);
    } catch {}
  }

  // ✅ render stack: đối xứng quanh tâm container + bù lệch texture (biasX/biasY)
  private renderStack(container: Phaser.GameObjects.Container, subject: Subject, count: number, side: Side) {
    container.removeAll(true);

    const key = STACK_TEXTURE[subject][side];
    const bias = STACK_BIAS_BY_KEY[key] ?? { x: 0, y: 0 };

    for (let i = 0; i < count; i++) {
      let x = 0;
      if (i > 0) {
        const step = Math.ceil(i / 2);
        const sign = i % 2 === 1 ? 1 : -1;
        x = sign * step * ITEM_GAP_X;
      }

      const y = -i * ITEM_GAP_Y;

      const img = this.add.image(x + bias.x, y + bias.y, key);
      img.setScale(ITEM_SCALE);
      img.setRotation(0);
      container.add(img);
    }

    container.setAlpha(1);
    container.setScale(1);
  }

  private resetUiForNewTry() {
    this.leftBtn.setAlpha(1).clearTint();
    this.rightBtn.setAlpha(1).clearTint();

    this.leftPickX.setVisible(false);
    this.rightPickX.setVisible(false);

    this.leftStack.setAlpha(1).setScale(1).setAngle(0);
    this.rightStack.setAlpha(1).setScale(1).setAngle(0);

    this.resultBadge.setVisible(false);
  }

  private startLevel() {
    if (this.levelIndex >= this.levels.length) {
      this.scene.start('EndGameScene', {
        score: this.score,
        total: this.levels.length,
      });
      return;
    }

    const subject = this.levelSubjects[this.levelIndex];
    const level = this.levels[this.levelIndex];

    // ✅ dùng asset chữ trong banner (fallback text nếu thiếu)
    const imgKey = QUESTION_IMG_KEY[subject];
    const hasImg = this.textures.exists(imgKey);

    // ✅ FIX sys: nếu promptImage cũ đã bị destroy (scene restart) thì bỏ reference
    if (this.promptImage && !this.promptImage.scene) {
      this.promptImage = undefined;
    }

    if (hasImg) {
      if (!this.promptImage) {
        this.promptImage = this.add
          .image(this.questionBanner.x, this.questionBanner.y, imgKey)
          .setOrigin(0.5)
          .setScale(PROMPT_IMG_SCALE)
          .setDepth(this.promptText.depth + 1);
      } else {
        this.promptImage
          .setTexture(imgKey)
          .setVisible(true)
          .setScale(PROMPT_IMG_SCALE)
          .setPosition(this.questionBanner.x, this.questionBanner.y);
      }
      this.promptText.setVisible(false);
    } else {
      this.promptText.setVisible(true);
      this.promptText.setText(this.levelQuestions[this.levelIndex]);
      this.promptImage?.setVisible(false);
    }

    // ✅ scale banner theo nội dung (image hoặc text)
    const contentWidth =
      hasImg && this.promptImage ? this.promptImage.displayWidth : this.promptText.width;

    const baseBannerWidth = this.questionBanner.width;
    const padding = 145;
    const minBannerWidth = 800;
    const desiredWidth = Math.max(minBannerWidth, contentWidth + padding);

    const scaleX = desiredWidth / baseBannerWidth;
    const scaleY = BANNER_SCALE * BOARD_SCALE;
    this.questionBanner.setScale(scaleX, scaleY);

    this.renderStack(this.leftStack, subject, level.leftCount, 'LEFT');
    this.renderStack(this.rightStack, subject, level.rightCount, 'RIGHT');

    this.layoutVerticalBalanced();

    this.resetUiForNewTry();

    this.feedbackText.setText('');
    this.gameState = 'WAIT_CHOICE';
  }

  private handleChoice(side: Side) {
    Object.values(QUESTION_VOICE_KEY).forEach((key) => AudioManager.stopSound(key));

    if (this.gameState !== 'WAIT_CHOICE') return;
    this.gameState = 'CHECK_CHOICE';

    const level = this.levels[this.levelIndex];

    const lessSide: Side = level.leftCount < level.rightCount ? 'LEFT' : 'RIGHT';
    const isCorrect = side === lessSide;

    // ✅ 1 lệnh: hiện X + badge + animation đúng/sai
    this.choiceFeedback.show(side, isCorrect);

    if (isCorrect) {
      this.subgameEntered = true;
      this.score++;

      // ✅ giữ nguyên audio logic hiện tại
      AudioManager.play('sfx_correct');
      AudioManager.playCorrectAnswer();

      this.gameState = 'LEVEL_END';

      if ((window as any).setGameButtonsVisible) {
        (window as any).setGameButtonsVisible(true);
      }

      this.time.delayedCall(1800, () => {
        this.scene.start('BalanceScene', {
          leftCount: level.leftCount,
          rightCount: level.rightCount,
          nextScene: 'GameScene',
          score: this.score,
          levelIndex: this.levelIndex,
          subject: this.levelSubjects[this.levelIndex],
          lessCharacter: lessSide,
        });
      });
    } else {
      // ✅ giữ nguyên audio logic hiện tại
      AudioManager.play('sfx_wrong');

      this.time.delayedCall(700, () => {
        this.resetUiForNewTry();
        this.feedbackText.setText('');
        this.gameState = 'WAIT_CHOICE';
      });
    }
  }
}
