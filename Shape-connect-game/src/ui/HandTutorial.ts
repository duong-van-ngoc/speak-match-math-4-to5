
import Phaser from 'phaser';

export class HandTutorial {
    private scene: Phaser.Scene;
    private hand: Phaser.GameObjects.Image;
    private timerEvent?: Phaser.Time.TimerEvent;
    private targetFn: () => { type: 'click' | 'drag', startX: number, startY: number, endX?: number, endY?: number } | null;
    private isShowing: boolean = false;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        // Scale 0.7 as requested ("to lên 1 chút" from 0.5)
        this.hand = this.scene.add.image(0, 0, 'guide_hand').setDepth(9999).setVisible(false).setAlpha(0).setScale(0.7);
        this.targetFn = () => null;
    }

    setTarget(fn: () => { type: 'click' | 'drag', startX: number, startY: number, endX?: number, endY?: number } | null) {
        this.targetFn = fn;
        // resetting target might trigger show if currently showing
        if (this.isShowing) {
            this.show(); // refresh pos
        }
    }

    start() {
        this.show();
        this.resetTimer();
    }

    stop() {
        this.hide();
        if (this.timerEvent) {
            this.timerEvent.remove();
            this.timerEvent = undefined;
        }
    }

    onInteraction() {
        this.hide();
        this.resetTimer();
    }

    showNow() {
        this.show();
        this.resetTimer();
    }

    private resetTimer() {
        if (this.timerEvent) this.timerEvent.remove();
        this.timerEvent = this.scene.time.delayedCall(10000, () => {
            this.show();
        });
    }

    private hide() {
        this.isShowing = false;
        this.hand.setVisible(false);
        this.scene.tweens.killTweensOf(this.hand);
    }

    private show() {
        const target = this.targetFn();
        if (!target) return;

        this.isShowing = true;
        this.hand.setVisible(true).setAlpha(1).setDepth(9999);
        this.scene.tweens.killTweensOf(this.hand);

        if (target.type === 'click') {
            // Point click animation
            this.hand.setPosition(target.startX + 20, target.startY + 20);
            this.scene.tweens.add({
                targets: this.hand,
                x: target.startX, // little movement
                y: target.startY,
                scale: { from: 0.7, to: 0.6 },
                duration: 500,
                yoyo: true,
                repeat: -1
            });
        } else if (target.type === 'drag') {
            // Point drag animation
            this.hand.setPosition(target.startX, target.startY);
            this.hand.setScale(1);

            this.scene.tweens.chain({
                targets: this.hand,
                loop: -1,
                tweens: [
                    {
                        scale: 0.6,
                        duration: 200,
                    },
                    {
                        x: target.endX,
                        y: target.endY,
                        duration: 1000,
                        ease: 'Sine.easeInOut'
                    },
                    {
                        alpha: 0,
                        duration: 200,
                        delay: 200,
                    },
                    {
                        x: target.startX,
                        y: target.startY,
                        alpha: 0,
                        duration: 0,
                    },
                    {
                        alpha: 1,
                        scale: 0.7,
                        duration: 200,
                    }
                ]
            });
        }
    }
}
