    import Phaser from 'phaser';

    export type Side = 'LEFT' | 'RIGHT';

    type Ref = {
    scene: Phaser.Scene;

    leftBtn: Phaser.GameObjects.Image;
    rightBtn: Phaser.GameObjects.Image;

    leftPickX: Phaser.GameObjects.Image;
    rightPickX: Phaser.GameObjects.Image;

    leftStack: Phaser.GameObjects.Container;
    rightStack: Phaser.GameObjects.Container;

    resultBadge: Phaser.GameObjects.Image;

    answerScale: number;
    pickXScale: number;
    boardScale: number;

    resultBadgeScale: number;
    resultCorrectKey: string;
    resultWrongKey: string;
    };

    export class ChoiceFeedback {
    private ref: Ref;

    constructor(ref: Ref) {
        this.ref = ref;
    }

    show(side: Side, correct: boolean) {
        const { scene } = this.ref;
        const {
        leftBtn,
        rightBtn,
        leftPickX,
        rightPickX,
        leftStack,
        rightStack,
        resultBadge,
        answerScale,
        pickXScale,
        resultBadgeScale,
        resultCorrectKey,
        resultWrongKey,
        boardScale,
        } = this.ref;

        const btn = side === 'LEFT' ? leftBtn : rightBtn;
        const otherBtn = side === 'LEFT' ? rightBtn : leftBtn;

        const pick = side === 'LEFT' ? leftPickX : rightPickX;
        const otherPick = side === 'LEFT' ? rightPickX : leftPickX;

        const stack = side === 'LEFT' ? leftStack : rightStack;

        // kill tween để khỏi chồng hiệu ứng
        scene.tweens.killTweensOf([btn, otherBtn, pick, otherPick, stack, resultBadge]);

        // reset nhẹ trước khi show
        btn.clearTint().setAlpha(1).setScale(answerScale);
        otherBtn.clearTint().setAlpha(1).setScale(answerScale);

        stack.setAngle(0).setScale(1).setAlpha(1);

        // ✅ HIỆN DẤU X ĐÚNG Ô
        leftPickX.setVisible(side === 'LEFT');
        rightPickX.setVisible(side === 'RIGHT');
        otherPick.setVisible(false);

        // đảm bảo X nằm đúng tâm nút (phòng layout đổi)
        pick.setPosition(btn.x, btn.y);
        pick.setAngle(0);
        pick.setAlpha(1);
        pick.setScale(pickXScale * 0.92);

        // pop nhẹ cho X (chung đúng/sai)
        scene.tweens.add({
        targets: pick,
        scale: pickXScale,
        duration: 120,
        ease: 'Quad.Out',
        });

        // ✅ BADGE đúng/sai
        resultBadge
        .setTexture(correct ? resultCorrectKey : resultWrongKey)
        .setVisible(true)
        .setScale(resultBadgeScale * 0.92);

        scene.tweens.add({
        targets: resultBadge,
        scale: resultBadgeScale,
        duration: 160,
        ease: correct ? 'Back.Out' : 'Quad.Out',
        });

        if (correct) {
        // Animation đúng
        scene.tweens.add({
            targets: btn,
            scale: answerScale * 1.08,
            duration: 140,
            yoyo: true,
            ease: 'Back.Out',
        });

        scene.tweens.add({
            targets: stack,
            scale: 1.06,
            duration: 160,
            yoyo: true,
            repeat: 1,
            ease: 'Sine.inOut',
        });

        scene.tweens.add({
            targets: otherBtn,
            alpha: 0.55,
            duration: 180,
            ease: 'Quad.Out',
        });

        scene.cameras.main.flash(100, 255, 255, 255);
        } else {
        // Animation sai
        const shakeDist = 14 * boardScale;
        const baseX = btn.x;

        btn.setTint(0xff6b6b);

        scene.tweens.add({
            targets: btn,
            x: baseX + shakeDist,
            duration: 40,
            yoyo: true,
            repeat: 4,
            ease: 'Sine.inOut',
            onComplete: () => {
            btn.x = baseX;
            btn.clearTint();
            },
        });

        scene.tweens.add({
            targets: pick,
            angle: { from: -10, to: 10 },
            duration: 60,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.inOut',
            onComplete: () => pick.setAngle(0),
        });

        scene.tweens.add({
            targets: stack,
            angle: { from: -2, to: 2 },
            duration: 70,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.inOut',
            onComplete: () => stack.setAngle(0),
        });

        scene.cameras.main.shake(110, 0.003);
        }
    }
    }
