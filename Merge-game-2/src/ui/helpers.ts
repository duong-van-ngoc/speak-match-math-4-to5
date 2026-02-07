import Phaser from 'phaser';

export type NumBox = {
  n: number;
  rect: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  cx: number;
  y: number;
  w: number;
  h: number;
  painted?: boolean;
  paint?: (color: number) => void;
  numberImage?: Phaser.GameObjects.Image;
  image?: Phaser.GameObjects.Image;
  setNumberTint?: (color?: number) => void;
  renderTexture?: Phaser.GameObjects.RenderTexture;
  paintProgress?: number;
  paintedPixels?: Set<string>;
};

export function makeTopBanner(scene: Phaser.Scene, text: string) {
  const w = scene.scale.width;

  const g = scene.add.graphics();
  g.fillStyle(0x0f3a6a, 1).fillRoundedRect(24, 14, w - 48, 44, 12);
  g.lineStyle(4, 0xffa500, 1).strokeRoundedRect(24, 14, w - 48, 44, 12);

  const t = scene
    .add.text(w / 2, 36, text, {
      fontFamily: 'system-ui',
      fontSize: '18px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: w - 120 },
    })
    .setOrigin(0.5);

  return { container: scene.add.container(0, 0, [g, t]).setDepth(50), textObj: t };
}

