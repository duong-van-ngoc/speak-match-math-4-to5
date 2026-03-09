import Phaser from 'phaser';
import { game } from '@iruka-edu/mini-game-sdk';
import AudioManager from '../../audio/AudioManager';
import { GameConstants } from '../../consts/GameConstants';
import { SceneKeys } from '../../consts/Keys';
import { hideGameButtons, sdk } from '../../main';
import { resetVoiceState } from '../../utils/rotateOrientation';

export default class EndGameScene extends Phaser.Scene {
    private confettiEvent?: Phaser.Time.TimerEvent;

    constructor() {
        super(SceneKeys.EndGame);
    }

    preload() {
        this.load.image('icon', 'assets/images/ui/icon_end.png');
        this.load.image('banner_congrat', 'assets/images/bg/banner_congrat.png');
        this.load.image('btn_reset', 'assets/images/ui/btn_reset.png');
        this.load.image('btn_exit', 'assets/images/ui/btn_exit.png');
    }

    create() {
        const submitData = game.prepareSubmitData();
        window.irukaGameState = {
            ...(window.irukaGameState || {}),
            currentScore: submitData.finalScore,
            attemptFinalized: true,
        };

        resetVoiceState();

        const w = this.scale.width;
        const h = this.scale.height;

        AudioManager.loadAll();
        AudioManager.play('complete');

        this.time.delayedCall(GameConstants.ENDGAME.ANIM.FIREWORKS_DELAY, () => {
            AudioManager.play('fireworks');
            AudioManager.play('applause');
        });

        this.add
            .image(
                w / 2,
                h / 2 - h * GameConstants.ENDGAME.UI.BANNER_OFFSET,
                'banner_congrat'
            )
            .setOrigin(0.5)
            .setDepth(100)
            .setDisplaySize(w * 0.9, h * 0.9);

        if (!this.textures.exists('icon')) return;

        const icon = this.add.image(
            w / 2,
            h / 2 - GameConstants.ENDGAME.UI.ICON_OFFSET,
            'icon'
        );

        icon.setScale(0.5);
        icon.setDepth(1005);

        this.tweens.add({
            targets: icon,
            y: icon.y - 10,
            duration: GameConstants.ENDGAME.ANIM.ICON_FLOAT,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        this.tweens.add({
            targets: icon,
            angle: { from: -5, to: 5 },
            duration: GameConstants.ENDGAME.ANIM.ICON_SHAKE,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        const btnScale = Math.min(w, h) / 1280;
        const spacing = GameConstants.ENDGAME.UI.BTN_SPACING * btnScale;

        const replayBtn = this.add
            .image(
                w / 2 - spacing,
                h / 2 + h * GameConstants.ENDGAME.UI.BTN_OFFSET,
                'btn_reset'
            )
            .setOrigin(0.5)
            .setScale(btnScale)
            .setDepth(101)
            .setInteractive({ useHandCursor: true });

        replayBtn.on('pointerdown', () => {
            game.retryFromStart();

            this.time.removeAllEvents();
            this.sound.stopAll();
            AudioManager.stopAll();
            AudioManager.play('sfx-click');
            this.stopConfetti();
            this.scene.start(SceneKeys.SpeakScene);
        });

        const exitBtn = this.add
            .image(
                w / 2 + spacing,
                h / 2 + h * GameConstants.ENDGAME.UI.BTN_OFFSET,
                'btn_exit'
            )
            .setOrigin(0.5)
            .setScale(btnScale)
            .setDepth(101)
            .setInteractive({ useHandCursor: true });

        exitBtn.on('pointerdown', () => {
            AudioManager.play('sfx-click');
            AudioManager.stopAll();
            this.stopConfetti();

            const state = window.irukaGameState || {};
            sdk.complete({
                score: state.currentScore ?? submitData.finalScore,
                timeMs: state.startTime ? Date.now() - state.startTime : 0,
                extras: {
                    reason: 'user_exit',
                    stats: game.prepareSubmitData(),
                },
            });
        });

        [replayBtn, exitBtn].forEach((btn) => {
            btn.on('pointerover', () => btn.setScale(btnScale * 1.1));
            btn.on('pointerout', () => btn.setScale(btnScale));
        });

        hideGameButtons();
        this.createConfettiEffect();
    }

    private createConfettiEffect(): void {
        const width = this.cameras.main.width;
        const colors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0xaa96da];
        const shapes: Array<'circle' | 'rect'> = ['circle', 'rect'];

        this.confettiEvent = this.time.addEvent({
            delay: GameConstants.ENDGAME.CONFETTI.DELAY,
            callback: () => {
                if (!this.scene.isActive()) return;

                for (let i = 0; i < 3; i += 1) {
                    this.createConfettiPiece(
                        Phaser.Math.Between(0, width),
                        -20,
                        Phaser.Utils.Array.GetRandom(colors),
                        Phaser.Utils.Array.GetRandom(shapes)
                    );
                }
            },
            loop: true,
        });
    }

    private createConfettiPiece(
        x: number,
        y: number,
        color: number,
        shape: 'circle' | 'rect'
    ): void {
        let confetti: Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle;

        if (shape === 'circle') {
            confetti = this.add.circle(x, y, Phaser.Math.Between(4, 8), color);
        } else {
            confetti = this.add.rectangle(
                x,
                y,
                Phaser.Math.Between(6, 12),
                Phaser.Math.Between(10, 20),
                color
            );
        }

        confetti.setDepth(999);

        const { MIN_DUR, MAX_DUR } = GameConstants.ENDGAME.CONFETTI;
        const duration = Phaser.Math.Between(MIN_DUR, MAX_DUR);
        const targetY = this.cameras.main.height + 50;
        const drift = Phaser.Math.Between(-100, 100);

        this.tweens.add({
            targets: confetti,
            y: targetY,
            x: x + drift,
            rotation: confetti.rotation + Phaser.Math.Between(2, 4) * Math.PI,
            duration,
            ease: 'Linear',
            onComplete: () => confetti.destroy(),
        });

        this.tweens.add({
            targets: confetti,
            alpha: { from: 1, to: 0.3 },
            duration,
            ease: 'Cubic.easeIn',
        });
    }

    private stopConfetti(): void {
        if (this.confettiEvent) {
            this.confettiEvent.remove(false);
            this.confettiEvent = undefined;
        }
    }
}
