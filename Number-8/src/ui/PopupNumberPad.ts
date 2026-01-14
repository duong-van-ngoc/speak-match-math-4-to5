    import Phaser from 'phaser';

    type ShowOpts = {
    anchorX: number;
    anchorY: number;
    title: string;
    spriteKey?: string;
    expectedText: string;
    progress?: { current: number; total: number };
    onResult: (res: { ok: boolean; transcript: string }) => void;
    onClose?: () => void;
    };

    export class PopupNumberPad {
    private scene: Phaser.Scene;

    private backdrop: Phaser.GameObjects.Rectangle;
    private root: Phaser.GameObjects.Container;

    private cardBg: Phaser.GameObjects.Graphics;
    private titleText: Phaser.GameObjects.Text;
    private closeBtn: Phaser.GameObjects.Text;
    private expectedText!: string;
    private resultCb!: ShowOpts['onResult'];

    private vehicleImage: Phaser.GameObjects.Image;
    private vehicleCardBg: Phaser.GameObjects.Graphics;
    private vehicleNameText: Phaser.GameObjects.Text;
    private feedbackText: Phaser.GameObjects.Text;
    private speakerBtn: Phaser.GameObjects.Container;
    private micBtn: Phaser.GameObjects.Container;
    private scoreDots: Phaser.GameObjects.Container;

    private visible = false;
    private onClose?: () => void;
    private recognizing = false;
    private recognizer?: any;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;

        const cam = scene.cameras.main;

        this.backdrop = scene.add
        .rectangle(cam.centerX, cam.centerY, cam.width, cam.height, 0x000000, 0.25)
        .setScrollFactor(0)
        .setDepth(999)
        .setVisible(false)
        .setInteractive();

        this.root = scene.add.container(0, 0).setDepth(1000).setVisible(false).setScrollFactor(0);

        this.cardBg = scene.add.graphics();
        this.titleText = scene.add
        .text(0, 0, '', { fontFamily: 'Arial', fontSize: '26px', color: '#111827' })
        .setOrigin(0.5, 0);

        this.closeBtn = scene.add
        .text(0, 0, '✕', { fontFamily: 'Arial', fontSize: '28px', color: '#111827' })
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true });

        this.vehicleCardBg = scene.add.graphics();

        const placeholderKey = '__popup_placeholder__';
        if (!scene.textures.exists(placeholderKey)) {
        const g = scene.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(0xe5e7eb, 1);
        g.fillRoundedRect(0, 0, 220, 160, 18);
        g.lineStyle(4, 0x93c5fd, 1);
        g.strokeRoundedRect(0, 0, 220, 160, 18);
        g.generateTexture(placeholderKey, 220, 160);
        g.destroy();
        }
        this.vehicleImage = scene.add.image(0, 0, placeholderKey).setVisible(false);

        this.vehicleNameText = scene.add
        .text(0, 0, '', { fontFamily: 'Arial', fontSize: '34px', color: '#ffffff' })
        .setOrigin(0.5, 0.5)
        .setVisible(false);

        this.feedbackText = scene.add
        .text(0, 0, '', { fontFamily: 'Arial', fontSize: '22px', color: '#111827' })
        .setOrigin(0.5, 0.5);

        this.scoreDots = scene.add.container(0, 0);

        this.speakerBtn = this.createIconButton('🔊', () => this.speakExpected());
        this.micBtn = this.createIconButton('🎤', () => this.startListening(), { radius: 38 });

        this.root.add([
        this.cardBg,
        this.titleText,
        this.closeBtn,
        this.scoreDots,
        this.vehicleCardBg,
        this.vehicleImage,
        this.vehicleNameText,
        this.feedbackText,
        this.speakerBtn,
        this.micBtn,
        ]);

        this.backdrop.on('pointerdown', () => this.hide());
        this.closeBtn.on('pointerdown', () => this.hide());
    }

    show(opts: ShowOpts) {
        const cam = this.scene.cameras.main;
        this.onClose = opts.onClose;
        this.expectedText = opts.expectedText;
        this.resultCb = opts.onResult;

        const cardW = 820;
        const cardH = 460;

        this.drawCard(cardW, cardH);

        this.titleText.setText(opts.title);
        this.titleText.setPosition(0, -cardH / 2 + 16);

        this.closeBtn.setPosition(cardW / 2 - 14, -cardH / 2 + 10);

        this.renderScoreDots(opts.progress?.current ?? 0, opts.progress?.total ?? 0);
        this.scoreDots.setPosition(-cardW / 2 + 70, -cardH / 2 + 38);

        const spriteKey = opts.spriteKey;
        const label = opts.expectedText;
        this.drawVehicleCard();
        this.vehicleNameText.setText(label);
        this.vehicleNameText.setVisible(true);

        if (spriteKey && this.scene.textures.exists(spriteKey)) {
        this.vehicleImage.setTexture(spriteKey);
        this.vehicleImage.setVisible(true);
        } else {
        this.vehicleImage.setTexture('__popup_placeholder__');
        this.vehicleImage.setVisible(true);
        }

        const cardX = 0;
        const cardY = -20;
        const innerW = 280;
        const innerH = 280;
        const innerTop = cardY - innerH / 2 + 18;

        this.vehicleImage.setPosition(cardX, innerTop + 120);
        this.vehicleNameText.setPosition(cardX, cardY + innerH / 2 - 34);

        // fit image into inner card area
        const maxW = innerW * 0.62;
        const maxH = innerH * 0.55;
        const tex = this.scene.textures.get(this.vehicleImage.texture.key);
        const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
        const tw = (src?.width || 1) as number;
        const th = (src?.height || 1) as number;
        const scale = Math.min(maxW / tw, maxH / th);
        this.vehicleImage.setScale(scale);

        // Buttons layout like screenshot: mic center bottom, speaker bottom-right.
        const bottomY = cardH / 2 - 92;
        this.micBtn.setPosition(0, bottomY);
        this.speakerBtn.setPosition(cardW / 2 - 90, bottomY);

        this.feedbackText.setText('Bấm mic để nói');
        this.feedbackText.setPosition(0, cardH / 2 - 44);

        const desiredX = opts.anchorX;
        const desiredY = opts.anchorY - 140;

        const halfW = cardW / 2;
        const halfH = cardH / 2;

        const x = Phaser.Math.Clamp(desiredX, halfW + 10, cam.width - halfW - 10);
        const y = Phaser.Math.Clamp(desiredY, halfH + 10, cam.height - halfH - 10);

        this.root.setPosition(x, y);

        this.backdrop.setVisible(true);
        this.root.setVisible(true);
        this.root.setScale(0.85);
        this.root.setAlpha(0);

        this.scene.tweens.add({
        targets: this.root,
        scale: 1,
        alpha: 1,
        duration: 140,
        ease: 'Quad.easeOut',
        });

        this.visible = true;
    }

    hide() {
        if (!this.visible) return;
        this.stopListening();

        this.scene.tweens.add({
        targets: this.root,
        scale: 0.9,
        alpha: 0,
        duration: 120,
        ease: 'Quad.easeIn',
        onComplete: () => {
            this.root.setVisible(false);
            this.backdrop.setVisible(false);
            this.visible = false;
            this.onClose?.();
            this.onClose = undefined;
        },
        });
    }

    private drawCard(w: number, h: number) {
        this.cardBg.clear();
        this.cardBg.fillStyle(0xffffff, 1);
        this.cardBg.lineStyle(4, 0x0ea5e9, 1);
        this.cardBg.fillRoundedRect(-w / 2, -h / 2, w, h, 18);
        this.cardBg.strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    }

    private createIconButton(icon: string, onClick: () => void, opts?: { radius?: number }) {
        const radius = opts?.radius ?? 32;
        const bg = this.scene.add
        .circle(0, 0, radius, 0xeff6ff, 1)
        .setStrokeStyle(4, 0x93c5fd, 1);

        const txt = this.scene.add
        .text(0, 0, icon, { fontFamily: 'Arial', fontSize: `${Math.round(radius * 0.95)}px`, color: '#111827' })
        .setOrigin(0.5);

        const root = this.scene.add.container(0, 0, [bg, txt]);
        root.setSize(radius * 2, radius * 2);
        root.setInteractive(new Phaser.Geom.Circle(0, 0, radius), Phaser.Geom.Circle.Contains);

        root.on('pointerdown', () => onClick());
        root.on('pointerover', () => bg.setFillStyle(0xdbebff, 1));
        root.on('pointerout', () => bg.setFillStyle(0xeff6ff, 1));

        return root;
    }

    private drawVehicleCard() {
        // blue rounded square, centered like screenshot
        this.vehicleCardBg.clear();
        const w = 300;
        const h = 300;
        const x = -w / 2;
        const y = -h / 2 - 20;

        this.vehicleCardBg.fillStyle(0x93c5fd, 1);
        this.vehicleCardBg.fillRoundedRect(x, y, w, h, 18);

        // keep image + label within this card bounds by positioning in show()
    }

    private renderScoreDots(current: number, total: number) {
        this.scoreDots.removeAll(true);
        if (!total || total <= 0) return;

        const dotR = 8;
        const gap = 12;
        for (let i = 0; i < total; i++) {
        const x = i * (dotR * 2 + gap);
        const fill = i < current ? 0x22c55e : 0xe5e7eb;
        const stroke = 0x0ea5e9;
        const dot = this.scene.add.circle(x, 0, dotR, fill, 1).setStrokeStyle(2, stroke, 1);
        this.scoreDots.add(dot);
        }
    }

    private speakExpected() {
        const text = this.expectedText;
        if (!text?.trim()) return;

        if ('speechSynthesis' in window) {
        try {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'vi-VN';
            window.speechSynthesis.speak(u);
        } catch {}
        }
    }

    private startListening() {
        if (this.recognizing) return;

        const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognitionCtor) {
        this.feedbackText.setText('Thiết bị không hỗ trợ mic (SpeechRecognition).');
        return;
        }

        this.stopListening();
        const rec = new SpeechRecognitionCtor();
        this.recognizer = rec;
        this.recognizing = true;

        rec.lang = 'vi-VN';
        rec.interimResults = false;
        rec.maxAlternatives = 3;

        this.feedbackText.setText('Con nói vào mic…');

        rec.onresult = (e: any) => {
        const transcript = String(e?.results?.[0]?.[0]?.transcript ?? '').trim();
        const ok = this.matchesExpected(transcript, this.expectedText);

        this.resultCb?.({ ok, transcript });

        if (ok) {
            this.feedbackText.setText('Đúng rồi!');
            this.scene.time.delayedCall(220, () => this.hide());
        } else {
            this.feedbackText.setText(`Chưa đúng (${transcript || 'không nghe rõ'}). Bấm mic nói lại nhé`);
        }

        this.stopListening();
        };

        rec.onerror = () => {
        this.feedbackText.setText('Không mở được mic. Bấm mic thử lại nhé');
        this.stopListening();
        };

        rec.onend = () => {
        this.stopListening();
        };

        try {
        rec.start();
        } catch {
        this.feedbackText.setText('Không mở được mic. Bấm mic thử lại nhé');
        this.stopListening();
        }
    }

    private stopListening() {
        this.recognizing = false;
        try {
        this.recognizer?.stop?.();
        } catch {}
        this.recognizer = undefined;
    }

    private matchesExpected(transcript: string, expected: string): boolean {
        const norm = (s: string) =>
        s
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const t = norm(transcript);
        const e = norm(expected);
        if (!t || !e) return false;
        if (t === e) return true;
        if (t.includes(e)) return true;
        if (e.includes(t)) return true;
        return false;
    }
    }
