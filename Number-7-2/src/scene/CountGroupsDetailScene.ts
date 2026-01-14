import Phaser from 'phaser';
import { createTopBanner } from '../ui/TopBanner';
import { COUNT_GROUPS_ASSET_KEYS } from '../assets/assetKeys';
import AudioManager from '../audio/AudioManager';
import { computeSpeechScore, type AgeBand } from '../tts/scoreEngine';

export type CountGroupsDetailInitData = {
  groupId: string;
  label: string;
  spriteKey?: string;
  progress?: { current: number; total: number };
};

export default class CountGroupsDetailScene extends Phaser.Scene {
  private initData!: CountGroupsDetailInitData;

  private board?: Phaser.GameObjects.Image;
  private boardFallbackGfx?: Phaser.GameObjects.Graphics;
  private boardContentRect = new Phaser.Geom.Rectangle(0, 0, 0, 0);

  private progressBgGfx!: Phaser.GameObjects.Graphics;
  private progressGfx!: Phaser.GameObjects.Graphics;
  private progressFrameGfx!: Phaser.GameObjects.Graphics;
  private progressMaskGfx?: Phaser.GameObjects.Graphics;
  private progressMask?: Phaser.Display.Masks.GeometryMask;
  private vehicleCardGfx!: Phaser.GameObjects.Graphics;
  private vehicleImage!: Phaser.GameObjects.Image;
  private vehicleNameImage?: Phaser.GameObjects.Image;
  private vehicleNameText?: Phaser.GameObjects.Text;

  private speakerBtn!: Phaser.GameObjects.Container;
  private micBtn!: Phaser.GameObjects.Container;
  private handHint!: Phaser.GameObjects.Image;
  private feedbackText!: Phaser.GameObjects.Text;

  private micAnimTween?: Phaser.Tweens.Tween;
  private speakerAnimTween?: Phaser.Tweens.Tween;
  private micBtnBaseScale = 1;
  private speakerBtnBaseScale = 1;
  private speakerPlayToken = 0;
  private wasBgmPlaying = false;

  private recognizing = false;
  private recognizer?: any;
  private hintTimer?: Phaser.Time.TimerEvent;
  private hintTween?: Phaser.Tweens.Tween;
  private completed = false;
  private hintBaseScale = 0.42;
  // Score bar value (0..10) driven by computeSpeechScore.
  private accuracyScore = 0; // 0..10
  private lastAttemptOk: boolean | null = null;
  private hasAttemptedRead = false;
  private wrongAttemptCount = 0;
  private totalPoints = 0;
  private readonly scoreByGroupRegistryKey = 'stage2_detail_score_by_group';
  private readonly resultByGroupRegistryKey = 'stage2_detail_result_by_group';
  private readonly seenHintByGroupRegistryKey = 'stage2_detail_seen_hint_by_group';
  private readonly idleHintDelayMs = 7000;
  private readonly wrongHintThreshold = 2;
  // Fine-tune mic/speaker buttons & hand hint placement.
  private readonly controlsTuning = {
    mic: { maxSize: 70, offsetX: 0, offsetY: 40 },
    speaker: { maxSize: 70, offsetX: 0, offsetY: 40 },
    handToSpeaker: { baseX: 56, baseY: 32, startDx: 18, startDy: 14 },
  };
  // Design spec for the vehicle card in the sub-screen (Figma-like coordinates).
  private readonly vehicleCardDesign = {
    baseW: 2048,
    baseH: 1536,
    left: 716,
    top: 356,
    width: 727,
    height: 781,
  } as const;
  // Manual tuning for the vehicle card position (design px; negative = left/up).
  private readonly vehicleCardOffset = { dx: -80, dy: -200 } as const;
  // If the card fits too tightly, offsets get clamped and look like they do nothing.
  // Lower this to create padding (and allow the card to move).
  private readonly vehicleCardFitRatio = 0.7;
  private readonly vehicleCardScale = 1.05;
  private readonly progressScoreTextBottomInsetRatio = 0.08;
  // Frame 97 score bar (Figma): width 750, height 100, rotation 90° => visual bbox is 100x750.
  private readonly progressBarDesign = { left: 297, top: 386, width: 100, height: 750 } as const;
  // Manual tuning for the score bar position (screen px; positive dy = down).
  private readonly progressBarOffsetPx = { dx: 0, dy: 54 } as const;
  // Increase perceived fill (tunable). 1.0 = linear; >1.0 fills faster.
  private readonly progressFillGain = 1.15;

  constructor() {
    super('CountGroupsDetailScene');
  }

  private getThemeColorHex() {
    switch (this.initData?.groupId) {
      case 'sun':
        return 0x97CEFF; // vàng mặt trời
      case 'moon':
        return 0xFF7677; // xanh nhạt mặt trăng
      case 'star':
        return 0xCFF15E; // xanh vàng nhạt ngôi sao
      case 'rainbow':
        return 0xFFD294; // xanh cầu vồng
      case 'cloud':
        return 0xFFC526; // trắng đám mây
      default:
        return 0x93c5fd;
    }
  }

  private getVehicleLabelAssetKey() {
    switch (this.initData?.groupId) {
      case 'sun':
        return COUNT_GROUPS_ASSET_KEYS.detailTextSun;
      case 'moon':
        return COUNT_GROUPS_ASSET_KEYS.detailTextMoon;
      case 'rainbow':
        return COUNT_GROUPS_ASSET_KEYS.detailTextRainbow;
      case 'cloud':
        return COUNT_GROUPS_ASSET_KEYS.detailTextStar;
      case 'star':
        return COUNT_GROUPS_ASSET_KEYS.detailTextCloud;
      default:
        return undefined;
    }
  }

  private getDesignScale() {
    const { width, height } = this.scale;
    const { baseW, baseH } = this.vehicleCardDesign;
    return Math.min(width / baseW, height / baseH);
  }

  private getDesignOffset() {
    const { width, height } = this.scale;
    const { baseW, baseH } = this.vehicleCardDesign;
    const s = this.getDesignScale();
    return { x: (width - baseW * s) / 2, y: (height - baseH * s) / 2, s };
  }

  init(data: CountGroupsDetailInitData) {
    this.initData = data;
    // Scene instance is reused across launches; reset per item.
    // Force recreating the progress mask (scene can be restarted with new Graphics instances).
    this.progressMask = undefined;
    this.hasAttemptedRead = false;
    this.wrongAttemptCount = 0;
    // Restore previous score for this group (so each item has its own bar state).
    const map = (this.registry.get(this.scoreByGroupRegistryKey) as Record<string, number> | undefined) ?? {};
    const prevScore = Number(map?.[String(this.initData?.groupId ?? '')] ?? 0);
    this.accuracyScore = Number.isFinite(prevScore) ? Phaser.Math.Clamp(prevScore, 0, 10) : 0;
    const resultMap =
      (this.registry.get(this.resultByGroupRegistryKey) as Record<string, { ok?: boolean }> | undefined) ?? {};
    const prevOk = resultMap?.[String(this.initData?.groupId ?? '')]?.ok;
    this.lastAttemptOk = typeof prevOk === 'boolean' ? prevOk : null;
    const prev = Number(this.registry.get('totalPoints') ?? 0);
    this.totalPoints = Number.isFinite(prev) ? prev : 0;
  }

  create() {
    try {
      (window as any).setGameButtonsVisible?.(true);
    } catch {}

    // Keep the sub-screen canvas transparent; theme color is applied on the card/placeholder only.
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    // Banner at top (same as main mini-games).
    createTopBanner(
      this,
      { bannerKey: COUNT_GROUPS_ASSET_KEYS.topBanner, textKey: COUNT_GROUPS_ASSET_KEYS.topBannerTextRead },
      { yRatio: 0.09, scale: 0.52, bannerScaleXMul: 0.85 }
    );

    this.createBoard();
    this.ensureHandHintTexture();

    // Score bar: draw background (white) + fill + border.
    this.progressBgGfx = this.add.graphics().setDepth(9);
    this.progressGfx = this.add.graphics().setDepth(10);
    this.progressFrameGfx = this.add.graphics().setDepth(11);
    this.vehicleCardGfx = this.add.graphics().setDepth(10);
    // Mask graphics for the progress fill (lets the fill perfectly match rounded ends).
    this.progressMaskGfx = this.add.graphics().setDepth(8).setVisible(false);
    // Ensure mask is created from the current Graphics instance.
    this.progressMask = undefined;
    try {
      (this.progressGfx as any).clearMask?.(false);
    } catch {}

    const themeHex = this.getThemeColorHex();
    const placeholderKey = `__count_groups_detail_placeholder_${this.initData.groupId || 'default'}__`;
    if (!this.textures.exists(placeholderKey)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(themeHex, 1);
      g.fillRoundedRect(0, 0, 320, 240, 24);
      g.lineStyle(6, 0xffffff, 1);
      g.strokeRoundedRect(0, 0, 320, 240, 24);
      g.generateTexture(placeholderKey, 320, 240);
      g.destroy();
    }

    this.vehicleImage = this.add.image(0, 0, placeholderKey).setDepth(11);
    const labelKey = this.getVehicleLabelAssetKey();
    if (labelKey && this.textures.exists(labelKey)) {
      this.vehicleNameImage = this.add.image(0, 0, labelKey).setDepth(11).setOrigin(0.5, 0.5);
    } else {
      this.vehicleNameText = this.add
        .text(0, 0, this.initData.label ?? '', {
          fontFamily: '"Baloo Chettan 2", "Baloo 2", Baloo, Arial, sans-serif',
          fontSize: '96px',
          fontStyle: '800',
          color: '#ffffff',
          align: 'center',
          lineSpacing: -22,
          letterSpacing: 4,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(11);
    }

    this.feedbackText = this.add
      .text(0, 0, '', { fontFamily: 'Arial', fontSize: '22px', color: '#111827' })
      .setOrigin(0.5, 0.5)
      .setDepth(12)
      // Remove on-screen notification text in the sub screen (voice-only UX).
      .setVisible(false);

    this.speakerBtn = this.createImageButton(
      COUNT_GROUPS_ASSET_KEYS.speakerIcon,
      () => {
        if (this.recognizing) return;
        this.clearHint();
        void this.speakExpected();
        if (!this.hasAttemptedRead) this.scheduleHint(this.idleHintDelayMs);
      },
      {
      maxSize: this.controlsTuning.speaker.maxSize,
      }
    );
    this.micBtn = this.createImageButton(
      COUNT_GROUPS_ASSET_KEYS.micIcon,
      () => {
        if (this.recognizing) return;
        this.clearHint();
        this.resetProgressForCurrentGroup();
        this.hasAttemptedRead = true;
        void (async () => {
          try {
            // Play mic voice BEFORE starting SpeechRecognition to avoid OS/browser ducking or routing
            // the audio to the earpiece when the mic turns on.
            await AudioManager.playVoiceInterruptAndWait?.('voice_stage2_detail_press_mic');
          } catch {}
          this.startListening();
        })();
      },
      {
      maxSize: this.controlsTuning.mic.maxSize,
      }
    );

    this.speakerBtnBaseScale = this.speakerBtn.scaleX || 1;
    this.micBtnBaseScale = this.micBtn.scaleX || 1;

    this.handHint = this.add.image(0, 0, COUNT_GROUPS_ASSET_KEYS.handHint).setDepth(20).setVisible(false);
    this.handHint.setScale(this.hintBaseScale);
    this.handHint.setAngle(-12);

    if (this.initData.spriteKey && this.textures.exists(this.initData.spriteKey)) {
      this.vehicleImage.setTexture(this.initData.spriteKey);
    }

    this.scale.off('resize', this.layoutScene, this);
    this.scale.on('resize', this.layoutScene, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.layoutScene, this);
      this.stopListening();
      this.clearHint();
      this.stopMicAnim();
      this.stopSpeakerAnim();
    });

    this.layoutScene();
    // Detail enter guide (guide4)
    this.time.delayedCall(250, () => {
      try {
        AudioManager.playStage2DetailGuide();
      } catch {}
    });
    this.scheduleFirstEnterHint();
    this.scheduleHint(this.idleHintDelayMs);
  }

  private scheduleFirstEnterHint() {
    if (this.completed) return;
    const gid = String(this.initData?.groupId ?? '');
    if (!gid) return;

    const seen = (this.registry.get(this.seenHintByGroupRegistryKey) as Record<string, boolean> | undefined) ?? {};
    if (seen[gid]) return;

    try {
      this.registry.set(this.seenHintByGroupRegistryKey, { ...seen, [gid]: true });
    } catch {}

    this.time.delayedCall(900, () => {
      if (this.completed) return;
      if (this.recognizing) return;
      this.showHint();
    });
  }

  private exit(result: { ok: boolean; transcript: string } | null) {
    this.completed = !!result?.ok;
    try {
      this.sound?.stopAll?.();
    } catch {}
    this.stopListening();
    this.clearHint();
    this.events.emit('exit', result);
    this.scene.stop();
  }

  private createBoard() {
    const boardKey = COUNT_GROUPS_ASSET_KEYS.board;
    if (this.textures.exists(boardKey)) {
      this.board = this.add.image(0, 0, boardKey).setOrigin(0.5).setDepth(1);
      return;
    }

    this.boardFallbackGfx = this.add.graphics().setDepth(1);
  }

  private layoutScene() {
    const w = this.scale.width;
    const h = this.scale.height;

    // Layout board
    if (this.board) {
      const boardKey = this.board.texture.key;
      const tex = this.textures.get(boardKey);
      const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const tw = (src?.width || 1) as number;
      const th = (src?.height || 1) as number;

      const scale = Math.min((w * 0.96) / tw, (h * 0.78) / th);
      const boardOffsetY = h * 0.07;

      this.board.setAngle(0);
      this.board.setPosition(w / 2, h / 2 + boardOffsetY);
      this.board.setScale(scale);

      const bw = tw * scale;
      const bh = th * scale;

      const padX = bw * 0.065;
      const padTop = bh * 0.14;
      const padBottom = bh * 0.1;
      const boardCenterY = h / 2 + boardOffsetY;

      this.boardContentRect.setTo(
        w / 2 - bw / 2 + padX,
        boardCenterY - bh / 2 + padTop,
        bw - padX * 2,
        bh - padTop - padBottom
      );
    } else if (this.boardFallbackGfx) {
      const bw = w * 0.92;
      const bh = h * 0.82;
      const x = w / 2 - bw / 2;
      const y = h / 2 - bh / 2 + h * 0.06;

      this.boardFallbackGfx.clear();
      this.boardFallbackGfx.fillStyle(0xffffff, 1);
      this.boardFallbackGfx.lineStyle(6, 0x0ea5e9, 1);
      this.boardFallbackGfx.fillRoundedRect(x, y, bw, bh, 22);
      this.boardFallbackGfx.strokeRoundedRect(x, y, bw, bh, 22);

      const padX = bw * 0.06;
      const padTop = bh * 0.14;
      const padBottom = bh * 0.1;
      this.boardContentRect.setTo(x + padX, y + padTop, bw - padX * 2, bh - padTop - padBottom);
    }

    // Layout inside content rect
    const r = this.boardContentRect;
    if (r.width <= 0 || r.height <= 0) return;

    // Progress bar (Frame 97) using fixed design coords (Figma: 750x100 rotated 90° => bbox 100x750).
    const designOffset = this.getDesignOffset();
    const ox = designOffset.x;
    const oy = designOffset.y;
    const pbScale = designOffset.s;
    const pb = this.progressBarDesign;
    const pW = pb.width * pbScale;
    const pH = pb.height * pbScale;
    const px = ox + (pb.left + pb.width / 2) * pbScale + this.progressBarOffsetPx.dx;
    const py = oy + (pb.top + pb.height / 2) * pbScale + this.progressBarOffsetPx.dy;
    this.drawProgressBar(px, py, pW, pH);

    // Main vehicle card (centered within the board, leaving room for the progress bar)
    const gap = Math.max(12, r.width * 0.04);
    const cardAreaLeft = r.left + pW + gap;
    const cardAreaWidth = Math.max(0, r.right - cardAreaLeft);

    const { s } = this.getDesignOffset();
    const desiredW = this.vehicleCardDesign.width * s * this.vehicleCardScale;
    const desiredH = this.vehicleCardDesign.height * s * this.vehicleCardScale;
    const fit = Phaser.Math.Clamp(this.vehicleCardFitRatio, 0.6, 1);
    const maxW = cardAreaWidth * fit;
    const maxH = r.height * fit;

    let cardW = Math.min(desiredW, maxW);
    let cardH = desiredH * (cardW / (desiredW || 1));
    if (cardH > maxH) {
      const k = maxH / (cardH || 1);
      cardW *= k;
      cardH *= k;
    }

    const btnY = r.bottom - r.height * 0.14;
    const maxCardBottom = btnY - r.height * 0.06;
    const minCardTop = r.top + r.height * 0.02;

    // Compute a safe "available" region, then apply manual offsets inside it.
    const minX = cardAreaLeft + cardW / 2;
    const maxX = r.right - cardW / 2;
    const baseX = minX + Math.max(0, maxX - minX) / 2;
    const desiredCardX = baseX + this.vehicleCardOffset.dx * s;
    const cardX = Phaser.Math.Clamp(desiredCardX, minX, maxX);

    const minY = minCardTop + cardH / 2;
    const maxY = maxCardBottom - cardH / 2;
    const baseY = minY + Math.max(0, maxY - minY) / 2;
    const desiredCardY = baseY + this.vehicleCardOffset.dy * s;
    const cardY = Phaser.Math.Clamp(desiredCardY, minY, maxY);
    this.drawVehicleCard(cardX, cardY, cardW, cardH);

    // Fit vehicle image into top portion of card
    const imgTarget = Math.min(cardW * 0.75, cardH * 0.52);
    this.vehicleImage.setPosition(cardX, cardY - cardH * 0.18);
    this.vehicleImage.setScale(1);
    if (this.vehicleImage instanceof Phaser.GameObjects.Image) {
      const tex = this.textures.get(this.vehicleImage.texture.key);
      const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const tw = (src?.width || 1) as number;
      const th = (src?.height || 1) as number;
      this.vehicleImage.setScale(Math.min(imgTarget / tw, imgTarget / th));
    }

    const nameY = cardY + cardH * 0.28;
    if (this.vehicleNameImage) {
      this.vehicleNameImage.setPosition(cardX, nameY);
      const targetW = cardW * 0.84;
      const targetH = cardH * 0.18;
      try {
        const tex = this.textures.get(this.vehicleNameImage.texture.key);
        const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
        const tw = (src?.width || 1) as number;
        const th = (src?.height || 1) as number;
        this.vehicleNameImage.setScale(Math.min(targetW / tw, targetH / th));
      } catch {}
    }
    this.vehicleNameText?.setPosition(cardX, nameY);

    // Buttons (bottom)
    this.micBtn.setPosition(r.centerX + this.controlsTuning.mic.offsetX, btnY + this.controlsTuning.mic.offsetY);
    this.speakerBtn.setPosition(
      r.right - r.width * 0.09 + this.controlsTuning.speaker.offsetX,
      btnY + this.controlsTuning.speaker.offsetY
    );

    // Hand hint points to speaker like screenshot
    this.handHint.setPosition(
      this.speakerBtn.x + this.controlsTuning.handToSpeaker.baseX,
      this.speakerBtn.y + this.controlsTuning.handToSpeaker.baseY
    );

    this.feedbackText.setPosition(r.centerX, btnY + 74);
  }

  private scheduleHint(delayMs: number, opts?: { force?: boolean }) {
    if (this.completed) return;
    const force = !!opts?.force;
    if (this.hintTimer) this.hintTimer.remove(false);
    this.hintTimer = this.time.delayedCall(delayMs, () => {
      if (this.completed) return;
      if (this.recognizing) return;
      if (!force && this.hasAttemptedRead) return;
      this.showHint();
    });
  }

  private showHint() {
    this.handHint.setVisible(true);

    try {
      this.hintTween?.stop();
    } catch {}

    // Subtle "pointing" movement toward the speaker button.
    const endX = this.speakerBtn.x + this.controlsTuning.handToSpeaker.baseX;
    const endY = this.speakerBtn.y + this.controlsTuning.handToSpeaker.baseY;
    const startX = endX + this.controlsTuning.handToSpeaker.startDx;
    const startY = endY + this.controlsTuning.handToSpeaker.startDy;
    this.handHint.setPosition(startX, startY);

    this.hintTween = this.tweens.add({
      targets: this.handHint,
      x: endX,
      y: endY,
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Also pulse the speaker button a bit.
    this.tweens.add({
      targets: this.speakerBtn,
      scale: 1.06,
      duration: 220,
      yoyo: true,
      repeat: 5,
      ease: 'Sine.easeInOut',
    });
  }

  private clearHint() {
    if (this.hintTimer) {
      try {
        this.hintTimer.remove(false);
      } catch {}
      this.hintTimer = undefined;
    }
    if (this.hintTween) {
      try {
        this.hintTween.stop();
      } catch {}
      this.hintTween = undefined;
    }
    this.handHint?.setVisible(false);
  }

  private ensureHandHintTexture() {
    const key = COUNT_GROUPS_ASSET_KEYS.handHint;
    if (this.textures.exists(key)) return;

    // Fallback (should not happen if PreloadScene loaded assets/icon/hand.png).
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xfbbf24, 1);
    g.fillRoundedRect(0, 0, 120, 120, 28);
    g.lineStyle(6, 0xffffff, 0.9);
    g.strokeRoundedRect(8, 8, 104, 104, 24);
    g.generateTexture(key, 120, 120);
    g.destroy();
  }

  private drawProgressBar(x: number, y: number, w: number, h: number) {
    const score = Phaser.Math.Clamp(Math.round(this.accuracyScore), 0, 10);
    const pct = Phaser.Math.Clamp((score / 10) * this.progressFillGain, 0, 1);
    const fillColor = this.getScoreFillColor(pct, this.lastAttemptOk);

    this.progressBgGfx.clear();
    this.progressGfx.clear();
    this.progressFrameGfx.clear();

    const frameW = w;
    const frameH = h;
    const frameLeft = x - frameW / 2;
    const frameTop = y - frameH / 2;
    const frameRadius = Math.max(8, frameW / 2);

    // Draw frame like Frame 97 (white fill + green border).
    const borderW = Math.max(2, Math.round(Math.min(frameW, frameH) * 0.03));
    this.progressBgGfx.fillStyle(0xffffff, 1);
    this.progressBgGfx.fillRoundedRect(frameLeft, frameTop, frameW, frameH, frameRadius);
    this.progressFrameGfx.lineStyle(borderW, 0x3d6118, 1);
    this.progressFrameGfx.strokeRoundedRect(frameLeft, frameTop, frameW, frameH, frameRadius);

    // Fill inside the frame (mask to an inner pill so corners match).
    const inset = Math.max(1, Math.round(borderW * 0.6));
    const innerW = Math.max(2, frameW - inset * 2);
    const innerH = Math.max(2, frameH - inset * 2);
    const innerLeft = frameLeft + inset;
    const innerTop = frameTop + inset;
    const innerRadius = Math.max(8, innerW / 2);

    if (this.progressMaskGfx) {
      this.progressMaskGfx.clear();
      this.progressMaskGfx.fillStyle(0xffffff, 1);
      this.progressMaskGfx.fillRoundedRect(innerLeft, innerTop, innerW, innerH, innerRadius);
      if (!this.progressMask) this.progressMask = this.progressMaskGfx.createGeometryMask();
      this.progressGfx.setMask(this.progressMask);
    }

    const fillH = Math.max(0, innerH * pct);
    if (fillH > 0) {
      this.progressGfx.fillStyle(fillColor, 1);
      this.progressGfx.fillRect(innerLeft, innerTop + innerH - fillH, innerW, fillH);
    }

    const labelKey = '__count_groups_detail_progress_text__';
    const existing = this.children.getByName(labelKey) as Phaser.GameObjects.Text | null;
    const txt = existing
      ? existing
      : this.add
          .text(0, 0, '', { fontFamily: 'Arial', fontSize: '22px', color: '#111827' })
          .setName(labelKey)
          .setOrigin(0.5, 0.5)
          .setDepth(13);
    txt.setText(String(score));
    // Put the score number inside the scale, near the bottom.
    const bottomInset = h * this.progressScoreTextBottomInsetRatio;
    txt.setPosition(x, y + h / 2 - bottomInset);
  }

  private getScoreFillColor(pct01: number, lastOk: boolean | null) {
    const pct = Phaser.Math.Clamp(pct01, 0, 1);
    const red = 0xef4444;
    const amber = 0xf59e0b;
    const green = 0x22c55e;
    const greenDark = 0x16a34a;
    const redSoft = 0xfca5a5;
    const greenSoft = 0x86efac;

    const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
    const lerpHex = (from: number, to: number, t: number) => {
      const fr = (from >> 16) & 0xff;
      const fg = (from >> 8) & 0xff;
      const fb = from & 0xff;
      const tr = (to >> 16) & 0xff;
      const tg = (to >> 8) & 0xff;
      const tb = to & 0xff;
      const r = lerp(fr, tr, t);
      const g = lerp(fg, tg, t);
      const b = lerp(fb, tb, t);
      return (r << 16) | (g << 8) | b;
    };

    // When the last attempt was wrong: keep it in the red->amber range (no green).
    if (lastOk === false) return lerpHex(redSoft, amber, pct);
    // When the last attempt was correct: emphasize green progression.
    if (lastOk === true) return lerpHex(greenSoft, greenDark, pct);
    // Neutral/default: red -> amber -> green.
    if (pct <= 0.5) return lerpHex(red, amber, pct / 0.5);
    return lerpHex(amber, green, (pct - 0.5) / 0.5);
  }

  private drawVehicleCard(cx: number, cy: number, w: number, h: number) {
    this.vehicleCardGfx.clear();
    const x = cx - w / 2;
    const y = cy - h / 2;

    const k = Math.min(w / this.vehicleCardDesign.width, h / this.vehicleCardDesign.height) || 1;
    const radius = 64 * k;
    const borderW = Math.max(1, 1 * k);

    this.vehicleCardGfx.fillStyle(this.getThemeColorHex(), 1);
    this.vehicleCardGfx.fillRoundedRect(x, y, w, h, radius);
    this.vehicleCardGfx.lineStyle(borderW, 0x3d6118, 1);
    this.vehicleCardGfx.strokeRoundedRect(x, y, w, h, radius);
  }

  private createImageButton(
    textureKey: string,
    onClick: () => void,
    opts?: { maxSize?: number; depth?: number }
  ) {
    const maxSize = opts?.maxSize ?? 96;
    const depth = opts?.depth ?? 15;

    const fallbackKey = '__count_groups_detail_button_fallback__';
    if (!this.textures.exists(textureKey)) {
      if (!this.textures.exists(fallbackKey)) {
        const g = this.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(0x93c5fd, 1);
        g.fillCircle(48, 48, 46);
        g.lineStyle(6, 0xffffff, 0.9);
        g.strokeCircle(48, 48, 46);
        g.generateTexture(fallbackKey, 96, 96);
        g.destroy();
      }
    }

    const img = this.add.image(0, 0, this.textures.exists(textureKey) ? textureKey : fallbackKey).setDepth(depth);
    img.setOrigin(0.5, 0.5);

    // Fit to max size.
    if (img instanceof Phaser.GameObjects.Image) {
      const tex = this.textures.get(img.texture.key);
      const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const tw = (src?.width || 1) as number;
      const th = (src?.height || 1) as number;
      img.setScale(Math.min(maxSize / tw, maxSize / th));
    }

    // Use a rectangular hit area that covers the whole visible asset (not just a circle),
    // so tapping near the edges still works.
    const padding = 6;
    const hitW = Math.max(maxSize, img.displayWidth) + padding * 2;
    const hitH = Math.max(maxSize, img.displayHeight) + padding * 2;

    const root = this.add.container(0, 0, [img]).setDepth(depth);
    root.setSize(hitW, hitH);
    root.setInteractive(new Phaser.Geom.Rectangle(-hitW / 2, -hitH / 2, hitW, hitH), Phaser.Geom.Rectangle.Contains);
    (root.input as any).useHandCursor = true;
    root.on('pointerdown', () => onClick());
    root.on('pointerover', () => (img.alpha = 0.9));
    root.on('pointerout', () => (img.alpha = 1));
    return root;
  }

  private getButtonImage(btn: Phaser.GameObjects.Container): Phaser.GameObjects.Image | null {
    const child = btn?.list?.[0];
    return child instanceof Phaser.GameObjects.Image ? child : null;
  }

  private startMicAnim() {
    if (!this.micBtn) return;
    if (this.micAnimTween) return;

    const img = this.getButtonImage(this.micBtn);
    if (img) {
      try {
        img.setTint(0xff4d4d);
      } catch {}
    }

    this.micAnimTween = this.tweens.add({
      targets: this.micBtn,
      scale: (this.micBtnBaseScale || 1) * 1.08,
      duration: 240,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopMicAnim() {
    if (this.micAnimTween) {
      try {
        this.micAnimTween.stop();
      } catch {}
      this.micAnimTween = undefined;
    }
    if (this.micBtn) {
      this.micBtn.setScale(this.micBtnBaseScale || 1);
      const img = this.getButtonImage(this.micBtn);
      if (img) {
        try {
          img.clearTint();
        } catch {}
      }
    }
  }

  private startSpeakerAnim() {
    if (!this.speakerBtn) return;
    if (this.speakerAnimTween) {
      try {
        this.speakerAnimTween.stop();
      } catch {}
      this.speakerAnimTween = undefined;
    }

    this.speakerAnimTween = this.tweens.add({
      targets: this.speakerBtn,
      scale: (this.speakerBtnBaseScale || 1) * 1.08,
      duration: 220,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopSpeakerAnim() {
    if (this.speakerAnimTween) {
      try {
        this.speakerAnimTween.stop();
      } catch {}
      this.speakerAnimTween = undefined;
    }
    if (this.speakerBtn) this.speakerBtn.setScale(this.speakerBtnBaseScale || 1);
  }

  private async speakExpected() {
    const text = this.initData.label;
    if (!text?.trim()) return;

    const audioKey = `voice_vehicle_${this.initData.groupId}`;
    await this.speakWithOptionalAudio(text, audioKey, { animateSpeaker: true });
  }

  private async speakPraiseAndWait() {
    if (!AudioManager.has('voice_stage2_correct')) return;
    await AudioManager.playAndWait?.('voice_stage2_correct');
  }

  private speakExpectedFeedback() {
    if (AudioManager.has('voice_wrong')) {
      AudioManager.playVoiceInterrupt?.('voice_wrong');
    }
  }

  private async speakWithOptionalAudio(text: string, audioKey?: string, opts?: { animateSpeaker?: boolean }) {
    const trimmed = (text ?? '').trim();
    if (!trimmed) return;

    if (audioKey && AudioManager.has(audioKey)) {
      const token = ++this.speakerPlayToken;
      if (opts?.animateSpeaker) this.startSpeakerAnim();
      try {
        await AudioManager.playVoiceInterruptAndWait?.(audioKey, { timeoutMs: 8000 });
      } catch {}
      if (opts?.animateSpeaker && this.speakerPlayToken === token) this.stopSpeakerAnim();
      return;
    }
  }

  private startListening() {
    if (this.recognizing) return;
    this.clearHint();
    this.stopSpeakerAnim();

    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      this.scheduleHint(1200);
      return;
    }

    // Important: when turning on SpeechRecognition, stop all voices first to avoid them being ducked/routed to the earpiece.
    try {
      AudioManager.stopAllVoices?.();
    } catch {}
    this.pauseBgmForListening();

    this.stopListening();
    const rec = new SpeechRecognitionCtor();
    this.recognizer = rec;
    this.recognizing = true;
    this.startMicAnim();
    this.pauseBgmForListening();

    rec.lang = 'vi-VN';
    rec.interimResults = false;
    rec.maxAlternatives = 3;

    // Audio-only UX: avoid extra on-screen instruction text here.
    this.feedbackText.setText('');

    rec.onresult = (e: any) => {
      const transcript = String(e?.results?.[0]?.[0]?.transcript ?? '').trim();
      const matchScore10 = this.computeAccuracyScore(transcript, this.initData.label);
      const ok = matchScore10 >= 8;
      this.lastAttemptOk = ok;

      const ageBand = (this.registry.get('ageBand') as AgeBand | undefined) ?? '4-5';
      const wordMatchPct = this.computeWordMatchPct(transcript, this.initData.label);
      const speechScore = computeSpeechScore({
        ageBand,
        metrics: { wordMatchPct },
        basePoints: 10,
      });
      // Drive the progress bar by the scoring engine points (0..10).
      this.setAccuracyScore(speechScore.points);
      try {
        const existing = (this.registry.get(this.scoreByGroupRegistryKey) as Record<string, number> | undefined) ?? {};
        const next = { ...existing, [String(this.initData.groupId)]: speechScore.points };
        this.registry.set(this.scoreByGroupRegistryKey, next);
        const existingRes =
          (this.registry.get(this.resultByGroupRegistryKey) as Record<string, { ok?: boolean }> | undefined) ?? {};
        const nextRes = { ...existingRes, [String(this.initData.groupId)]: { ok } };
        this.registry.set(this.resultByGroupRegistryKey, nextRes);
      } catch {}
      this.totalPoints += speechScore.points;
      this.registry.set('totalPoints', this.totalPoints);
      const shouldPraise = speechScore.score01 >= 0.8;

      if (ok) {
        // Voice-only feedback (no on-screen "Đúng/Sai" text).
        this.feedbackText.setText('');
        this.completed = true;
        this.wrongAttemptCount = 0;
        try {
          AudioManager.playWhenReady?.('sfx_correct');
        } catch {}
        this.stopListening();
        void (async () => {
          try {
            if (shouldPraise) {
              await this.speakPraiseAndWait();
            }
            await AudioManager.playCorrectAnswerAndWait();
          } catch {}
          this.exit({ ok: true, transcript });
        })();
      } else {
        // Voice-only feedback (no on-screen "Sai" text).
        this.feedbackText.setText('');
        this.wrongAttemptCount += 1;
        try {
          AudioManager.playWhenReady?.('sfx_wrong');
        } catch {}
        // Stop SpeechRecognition before playing any voice feedback.
        this.stopListening();
        this.speakExpectedFeedback();
        if (this.wrongAttemptCount >= this.wrongHintThreshold) {
          this.scheduleHint(900, { force: true });
        }
      }

      this.stopListening();
    };

    rec.onerror = () => {
      this.stopListening();
      this.scheduleHint(1800);
    };

    rec.onend = () => {
      this.stopListening();
    };

    try {
      rec.start();
    } catch {
      this.stopListening();
    }
  }

  private stopListening() {
    this.recognizing = false;
    try {
      this.recognizer?.stop?.();
    } catch {}
    this.recognizer = undefined;
    this.stopMicAnim();
    this.resumeBgmAfterListening();
  }

  private pauseBgmForListening() {
    try {
      this.wasBgmPlaying = AudioManager.isPlaying('bgm_main');
    } catch {
      this.wasBgmPlaying = false;
    }
    if (!this.wasBgmPlaying) return;
    try {
      AudioManager.stop('bgm_main');
    } catch {}
  }

  private resumeBgmAfterListening() {
    if (!this.wasBgmPlaying) return;
    this.wasBgmPlaying = false;
    try {
      if (!AudioManager.isPlaying('bgm_main')) {
        AudioManager.playWhenReady?.('bgm_main');
      }
    } catch {}
  }

  private setAccuracyScore(score: number) {
    this.accuracyScore = Phaser.Math.Clamp(score, 0, 10);
    // Redraw the left bar immediately.
    this.layoutScene();
  }

  private resetProgressForCurrentGroup() {
    this.lastAttemptOk = null;
    this.setAccuracyScore(0);
    try {
      const gid = String(this.initData?.groupId ?? '');
      if (!gid) return;

      const existing = (this.registry.get(this.scoreByGroupRegistryKey) as Record<string, number> | undefined) ?? {};
      this.registry.set(this.scoreByGroupRegistryKey, { ...existing, [gid]: 0 });

      const existingRes =
        (this.registry.get(this.resultByGroupRegistryKey) as Record<string, { ok?: boolean }> | undefined) ?? {};
      this.registry.set(this.resultByGroupRegistryKey, { ...existingRes, [gid]: { ok: undefined } });
    } catch {}
  }

  private computeAccuracyScore(transcript: string, expected: string): number {
    const t = this.normalizeForMatch(transcript);
    const e = this.normalizeForMatch(expected);
    if (!t || !e) return 0;

    // Only exact match gets 10.
    if (t === e) return 10;

    const tTokens = t.split(' ').filter(Boolean);
    const eTokens = e.split(' ').filter(Boolean);

    const expectedTokenCount = eTokens.length || 1;
    let matchTokens = 0;
    for (const tok of eTokens) {
      if (tTokens.includes(tok)) matchTokens++;
    }
    const tokenScore = Phaser.Math.Clamp(matchTokens / expectedTokenCount, 0, 1);

    const dist = this.levenshteinDistance(t, e);
    const maxLen = Math.max(t.length, e.length) || 1;
    const charSim = Phaser.Math.Clamp(1 - dist / maxLen, 0, 1);

    // Combine token + char similarity and make it stricter (non-linear).
    const combined = Phaser.Math.Clamp(tokenScore * 0.65 + charSim * 0.35, 0, 1);
    const strict = Math.pow(combined, 1.8);
    return Math.round(strict * 10);
  }

  private computeWordMatchPct(transcript: string, expected: string): number {
    const t = this.normalizeForMatch(transcript);
    const e = this.normalizeForMatch(expected);
    if (!e) return 0;
    if (!t) return 0;

    const tTokens = t.split(' ').filter(Boolean);
    const eTokens = e.split(' ').filter(Boolean);
    if (eTokens.length === 0) return 0;

    const counts = new Map<string, number>();
    for (const tok of tTokens) counts.set(tok, (counts.get(tok) ?? 0) + 1);

    let matched = 0;
    for (const tok of eTokens) {
      const c = counts.get(tok) ?? 0;
      if (c <= 0) continue;
      matched++;
      counts.set(tok, c - 1);
    }

    return Math.round((matched / eTokens.length) * 100);
  }

  private normalizeForMatch(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;

    const m = a.length;
    const n = b.length;
    const prev = new Array<number>(n + 1);
    const curr = new Array<number>(n + 1);

    for (let j = 0; j <= n; j++) prev[j] = j;

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      const ai = a.charCodeAt(i - 1);
      for (let j = 1; j <= n; j++) {
        const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      for (let j = 0; j <= n; j++) prev[j] = curr[j];
    }
    return prev[n];
  }

  // Legacy matcher kept during refactors; replaced by `computeAccuracyScore()`.
}
