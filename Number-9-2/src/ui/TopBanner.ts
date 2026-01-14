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
    depth?: number;
    titleText?: string;
    titleStyle?: Phaser.Types.GameObjects.Text.TextStyle;
    titleMaxWidthRatio?: number;
    fitText?: boolean;
    textPaddingRatio?: number;
    bannerScaleXMul?: number;
    textScaleMul?: number;
  }
) {
  // Smaller by default to avoid overlapping the game board on short screens.
  const yRatio = opts?.yRatio ?? 0.1;
  const scale = opts?.scale ?? 0.55;
  const depth = opts?.depth ?? 50;
  const titleText = opts?.titleText?.trim();
  const titleMaxWidthRatio = opts?.titleMaxWidthRatio ?? 0.82;
  const fitText = opts?.fitText ?? false;
  const textPaddingRatio = opts?.textPaddingRatio ?? 0.12;
  const bannerScaleXMul = opts?.bannerScaleXMul ?? 1;
  const textScaleMul = opts?.textScaleMul ?? 1;

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
      let scaleX = scale * bannerScaleXMul;
      if (fitText && text) {
        try {
          const bannerTex = scene.textures.get(banner.texture.key);
          const textTex = scene.textures.get(text.texture.key);
          const bSrc = bannerTex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
          const tSrc = textTex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
          const bw = (bSrc?.width || 1) as number;
          const tw = (tSrc?.width || 1) as number;
          const textScale = scale * 0.9 * textScaleMul;
          const needed = (tw * textScale * (1 + textPaddingRatio)) / bw;
          scaleX = Math.max(scale * bannerScaleXMul, needed);
        } catch {}
      }
      banner.setScale(scaleX, scale);
    }
    if (text) {
      text.setPosition(x, y);
      text.setScale(scale * 0.9 * textScaleMul);
    }
    if (title) {
      title.setPosition(x, y);
      title.setWordWrapWidth(Math.max(200, width * titleMaxWidthRatio), true);
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
