/**
 * UnderlineCharScene - Màn chơi 2: Gạch chân ký tự "D" trong từ
 */
import Phaser from 'phaser';
import SceneBase from '../SceneBase';
import { SceneKeys, TextureKeys } from '../../consts/Keys';
import { GameConstants } from '../../consts/GameConstants';
import { GameUtils } from '../../utils/GameUtils';
import AudioManager from '../../audio/AudioManager';
import { playVoiceLocked } from '../../utils/rotateOrientation';

/**
 * Cấu hình cho mỗi fruit item
 */
interface FruitItemConfig {
    id: string;
    imageKey: string;
    textKey: string;
    correctTextKey: string;
    audioKey: string;
    x: number;
    y: number;
    hitboxOffsetX: number;
    hitboxWidth: number;
    hitboxHeight: number;
}

export default class UnderlineCharScene extends SceneBase {
    // ========================================================================
    // REGION: PROPERTIES
    // ========================================================================
    private fruitItems: Map<string, {
        image: Phaser.GameObjects.Image;
        text: Phaser.GameObjects.Image;
        hitbox: Phaser.GameObjects.Zone;
        correctTextKey: string;
        audioKey: string;
        completed: boolean;
    }> = new Map();

    private completedCount: number = 0;
    private totalItems: number = 3;

    // ========================================================================
    // REGION: LIFECYCLE
    // ========================================================================

    constructor() {
        super(SceneKeys.UnderlineScene);
    }

    init() {
        this.fruitItems.clear();
        this.completedCount = 0;
    }

    create() {
        this.setupSystem();
        this.setupBackgroundAndAudio();
        this.createHandHint();
        this.createUI();
        this.initGameFlow();

        this.events.on('wake', this.handleWake, this);
    }

    update(_time: number, delta: number) {
        if (this.isGameActive && this.completedCount < this.totalItems) {
            this.idleManager.update(delta);
        }
    }

    shutdown() {
        this.cleanupScene();
    }

    // ========================================================================
    // REGION: UI CREATION
    // ========================================================================

    protected createUI(): void {
        const w = GameUtils.getW(this);
        const h = GameUtils.getH(this);
        const CFG = GameConstants.UNDERLINE_SCENE;

        // Banner
        const bannerX = w * CFG.BANNER.X;
        const bannerY = h * CFG.BANNER.Y;
        this.add.image(bannerX, bannerY, TextureKeys.Underline_Banner)
            .setOrigin(0.5, 0)
            .setScale(CFG.BANNER.SCALE);

        // Board
        const boardX = w * CFG.BOARD.X;
        const boardY = h * CFG.BOARD.Y;
        this.add.image(boardX, boardY, TextureKeys.S1_Board)
            .setScale(CFG.BOARD.SCALE)
            .setAlpha(CFG.BOARD.ALPHA);

        // 3 fruit items - bố cục tam giác để tối ưu hóa không gian và scale chữ to lên cho các bé dễ nhấn.
        const itemConfigs: FruitItemConfig[] = [
            {
                id: 'watermelon',
                imageKey: TextureKeys.Underline_ItemWatermelon,
                textKey: TextureKeys.Underline_TextWatermelon,
                correctTextKey: TextureKeys.Underline_TextWatermelon_Correct,
                audioKey: 'voice-g2-quaduahau',
                x: w * CFG.ITEMS.WATERMELON_X,
                y: h * CFG.ITEMS.WATERMELON_Y,
                hitboxOffsetX: CFG.HITBOX.WATERMELON_OFFSET_X,
                hitboxWidth: CFG.HITBOX.WIDTH,
                hitboxHeight: CFG.HITBOX.HEIGHT
            },
            {
                id: 'coconut',
                imageKey: TextureKeys.Underline_ItemCoconut,
                textKey: TextureKeys.Underline_TextCoconut,
                correctTextKey: TextureKeys.Underline_TextCoconut_Correct,
                audioKey: 'voice-g2-quadua',
                x: w * CFG.ITEMS.COCONUT_X,
                y: h * CFG.ITEMS.COCONUT_Y,
                hitboxOffsetX: CFG.HITBOX.COCONUT_OFFSET_X,
                hitboxWidth: CFG.HITBOX.WIDTH,
                hitboxHeight: CFG.HITBOX.HEIGHT
            },
            {
                id: 'strawberry',
                imageKey: TextureKeys.Underline_ItemStrawberry,
                textKey: TextureKeys.Underline_TextStrawberry,
                correctTextKey: TextureKeys.Underline_TextStrawberry_Correct,
                audioKey: 'voice-g2-quadautay',
                x: w * CFG.ITEMS.STRAWBERRY_X,
                y: h * CFG.ITEMS.STRAWBERRY_Y,
                hitboxOffsetX: CFG.HITBOX.STRAWBERRY_OFFSET_X,
                hitboxWidth: CFG.HITBOX.WIDTH,
                hitboxHeight: CFG.HITBOX.HEIGHT
            }
        ];

        // Tạo các fruit items
        itemConfigs.forEach(config => {
            this.createFruitItem(config);
        });
    }

    private createFruitItem(config: FruitItemConfig): void {
        const CFG = GameConstants.UNDERLINE_SCENE;

        // Tạo hình trái cây
        const image = this.add.image(config.x, config.y, config.imageKey)
            .setScale(CFG.ITEMS.SCALE)
            .setOrigin(0.5);

        this.tweens.add({
            targets: image,
            y: config.y - 10,
            duration: CFG.ANIM.FLOAT_DURATION + Math.random() * 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        const textY = config.y + image.displayHeight / 2 + CFG.TEXT.OFFSET_Y;
        const text = this.add.image(config.x, textY, config.textKey)
            .setScale(CFG.TEXT.SCALE)
            .setOrigin(0.5);

        // Tạo hitbox trong suốt trên vị trí chữ D
        const hitboxX = config.x + config.hitboxOffsetX;
        const hitboxY = textY + CFG.TEXT.OFFSET_Y;

        const hitbox = this.add.zone(hitboxX, hitboxY, config.hitboxWidth, config.hitboxHeight)
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        // Event handler - Click
        hitbox.on('pointerdown', () => this.onHitboxClick(config.id));

        // Event handler - Drag (kéo ngón tay qua như gạch chân trên giấy)
        hitbox.on('pointerover', (pointer: Phaser.Input.Pointer) => {
            const item = this.fruitItems.get(config.id);
            if (!item?.completed) {
                text.setScale(CFG.TEXT.SCALE + 0.05);

                // Nếu đang giữ ngón tay (dragging) thì kích hoạt gạch chân
                if (pointer.isDown) {
                    this.onHitboxClick(config.id);
                }
            }
        });
        hitbox.on('pointerout', () => {
            if (!this.fruitItems.get(config.id)?.completed) {
                text.setScale(CFG.TEXT.SCALE);
            }
        });

        // Lưu vào map
        this.fruitItems.set(config.id, {
            image,
            text,
            hitbox,
            correctTextKey: config.correctTextKey,
            audioKey: config.audioKey,
            completed: false
        });
    }

    // ========================================================================
    // REGION: GAME FLOW
    // ========================================================================

    protected initGameFlow(): void {
        if (this.input.keyboard) this.input.keyboard.enabled = false;

        this.startWithAudio(() => {
            this.playBgm();
            this.isGameActive = true;

            playVoiceLocked(null, 'intro-underlinechar');
            const introDuration = AudioManager.getDuration('intro-underlinechar') || 3;

            this.time.delayedCall((introDuration + 0.5) * 1000, () => {
                if (this.isGameActive && this.completedCount < this.totalItems) {
                    this.idleManager.start();
                }
            });

            if (this.input.keyboard) this.input.keyboard.enabled = true;
            this.showButtons();
        });
    }

    protected showIdleHint(): void {
        for (const [_, item] of this.fruitItems) {
            if (!item.completed) {
                this.animateHandHintTo(item.hitbox.x, item.hitbox.y);
                break;
            }
        }
    }

    // ========================================================================
    // REGION: INTERACTION HANDLERS
    // ========================================================================

    private onHitboxClick(itemId: string): void {
        if (!this.isGameActive) return;

        const item = this.fruitItems.get(itemId);
        if (!item || item.completed) return;

        this.resetIdleState();

        item.completed = true;
        this.completedCount++;

        // Swap texture thành bản correct (chữ D đỏ)
        item.text.setTexture(item.correctTextKey);

        // Animation highlight
        this.tweens.add({
            targets: item.text,
            scale: { from: GameConstants.UNDERLINE_SCENE.TEXT.SCALE, to: GameConstants.UNDERLINE_SCENE.TEXT.SCALE + 0.1 },
            duration: 200,
            yoyo: true,
            repeat: 1
        });

        // Animation cho image
        this.tweens.add({
            targets: item.image,
            scale: { from: GameConstants.UNDERLINE_SCENE.ITEMS.SCALE, to: GameConstants.UNDERLINE_SCENE.ITEMS.SCALE + 0.05 },
            duration: 200,
            yoyo: true
        });

        // Phát sfx ting và audio tên trái cây
        AudioManager.play('sfx-ting');
        this.time.delayedCall(300, () => {
            AudioManager.play(item.audioKey);
        });

        // Disable hitbox
        item.hitbox.disableInteractive();

        // Check win condition
        if (this.completedCount >= this.totalItems) {
            this.handleWin();
        }
    }

    private handleWin(): void {
        this.isGameActive = false;
        this.idleManager.stop();

        this.time.delayedCall(GameConstants.UNDERLINE_SCENE.TIMING.WIN_DELAY, () => {
            AudioManager.play('sfx-correct');

            this.time.delayedCall(1500, () => {
                this.scene.start(SceneKeys.EndGame);
            });
        });
    }

    // ========================================================================
    // REGION: PUBLIC API
    // ========================================================================

    public restartIntro(): void {
        this.resetIdleState();
        this.idleManager.stop();
        this.initGameFlow();
    }
}
