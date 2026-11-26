import { TextSprite } from "@kitsune/common-web";

const PADDING = 20;
const FONT_PT = 12;

export const Console2 = (canvas: HTMLCanvasElement) => {
  const textSprite = TextSprite(canvas.width - PADDING, canvas.height - PADDING, {
    fontSize: `${FONT_PT}pt`,
    wordWrap: false,
  });

  // Lay the console out for the current canvas, in CSS pixels. The camera2d frustum is in CSS-pixel
  // units centered on the screen (see utils.ts), so a plane scaled to (width − PADDING) sits centered
  // with a PADDING/2 inset — landing the top-left-drawn text in the corner. The backing TEXTURE is
  // sized at the device pixel ratio (with a matching font scale) so the text is CRISP on HiDPI and in
  // fullscreen without changing its on-screen size. MUST be re-run on resize (frustum + dpr change),
  // called from setAnimationLoop.
  const layout = (width: number, height: number, dpr = 1) => {
    textSprite.resize(
      Math.round((width - PADDING) * dpr),
      Math.round((height - PADDING) * dpr),
      `${FONT_PT * dpr}pt`,
    );
    const scale = width - PADDING;
    textSprite.mesh.scale.set(scale, -scale, 1);
  };

  layout(canvas.width, canvas.height);

  return { ...textSprite, layout };
};
