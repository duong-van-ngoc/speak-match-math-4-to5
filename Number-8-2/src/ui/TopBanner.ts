import Phaser from 'phaser';

export type TopBannerKeys = {
  bannerKey: string;
  textKey?: string;
};

export function createTopBanner(
  scene: Phaser.Scene,
  keys: TopBannerKeys,
  opts?: {
    yRatio?: number;
    scale?: number;
    scaleXMul?: number;
    scaleYMul?: number;
    textScaleMul?: number;
    textScaleXMul?: number;
    textScaleYMul?: number;
    titleScaleMul?: number;
    fitToText?: boolean;
    fitTextPaddingRatio?: number;
    depth?: number;
    titleText?: string;
    titleStyle?: Phaser.Types.GameObjects.Text.TextStyle;
    titleMaxWidthRatio?: number;
  }
) {
  // Smaller by default to avoid overlapping the game board on short screens.
  const yRatio = opts?.yRatio ?? 0.1;
  const scale = opts?.scale ?? 0.55;
  const scaleXMul = opts?.scaleXMul ?? 1;
  const scaleYMul = opts?.scaleYMul ?? 1;
  const textScaleMul = opts?.textScaleMul ?? 1;
  const textScaleXMul = opts?.textScaleXMul ?? scaleXMul;
  const textScaleYMul = opts?.textScaleYMul ?? scaleYMul;
  const titleScaleMul = opts?.titleScaleMul ?? 1;
  const fitToText = opts?.fitToText ?? false;
  const fitTextPaddingRatio = opts?.fitTextPaddingRatio ?? 0.2;
  const depth = opts?.depth ?? 50;
  const titleText = opts?.titleText?.trim();
  const titleMaxWidthRatio = opts?.titleMaxWidthRatio ?? 0.82;

  const bannerExists = scene.textures.exists(keys.bannerKey);
  const textExists = !titleText && !!keys.textKey && scene.textures.exists(keys.textKey);
  if (!bannerExists && !textExists && !titleText) return;

  const banner = bannerExists
    ? scene.add.image(0, 0, keys.bannerKey).setOrigin(0.5).setDepth(depth)
    : undefined;
  const text = textExists
    ? scene.add.image(0, 0, keys.textKey!).setOrigin(0.5).setDepth(depth + 1)
    : undefined;
  const title = titleText
    ? scene.add
        .text(0, 0, titleText, {
          fontFamily: 'Baloo 2, Baloo, Arial',
          fontSize: '34px',
          fontStyle: '800',
          color: '#ffffff',
          align: 'center',
          ...(opts?.titleStyle ?? {}),
        })
        .setOrigin(0.5, 0.5)
        .setDepth(depth + 1)
    : undefined;

  const layout = () => {
    const { width, height } = scene.scale;
    const x = width / 2;
    const y = height * yRatio;

    if (banner) {
      banner.setPosition(x, y);
      banner.setScale(scale * scaleXMul, scale * scaleYMul);
    }
    if (text) {
      text.setPosition(x, y);
      text.setScale(scale * 0.9 * textScaleXMul * textScaleMul, scale * 0.9 * textScaleYMul * textScaleMul);
    }
    if (title) {
      title.setPosition(x, y);
      title.setScale(titleScaleMul);
      title.setWordWrapWidth(Math.max(200, width * titleMaxWidthRatio), true);
    }

    if (banner && fitToText) {
      const textWidth = text?.displayWidth ?? title?.displayWidth ?? 0;
      if (textWidth > 0) {
        const src = banner.texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
        const tw = (src?.width || 1) as number;
        const desiredW = textWidth * (1 + fitTextPaddingRatio);
        const scaleX = desiredW / tw;
        banner.setScale(scaleX, scale * scaleYMul);
      }
    }
  };

  scene.scale.off('resize', layout);
  scene.scale.on('resize', layout);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off('resize', layout);
  });

  layout();

  return { banner, text, title };
}
