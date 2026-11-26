import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry } from "three";

import { bisect, toLog } from "@kitsune/common";

export type Config = {
  border: string,
  centered: boolean,
  color: string,
  fontSize: string,
  spacing: number,
  spacingScale: number,
  verticallyCentered: boolean,
  wordWrap: boolean,
};

const defaultConfig: Config = {
  border: "",
  centered: false,
  color: "#fff",
  fontSize: "10px",
  spacing: 0,
  spacingScale: 1,
  verticallyCentered: false,
  wordWrap: false,
};

const configureCanvas = (canvas: HTMLCanvasElement, config: Partial<Config>) => {
  const {
    border, centered, color, fontSize, spacing, spacingScale, verticallyCentered, wordWrap
  } = { ...defaultConfig, ...config };

  const context = canvas.getContext("2d");
  if(context === null)
    throw new Error("Failed to get 2d context.`canvas.getContext('2d')` was null.");

  context.font = `${fontSize} monospace`
  context.fillStyle = color;
  context.textAlign = centered ? "center" : "left";
  context.textBaseline = verticallyCentered ? "middle" : "top";

  return context;
};

// TODO: Add ability to resize
export const TextSprite = (width: number, height: number, config: Partial<Config> = defaultConfig) => {
  // Mutable so `resize` can rescale the font with the pixel density (see below).
  const cfg = { ...defaultConfig, ...config };
  const { border, centered, spacing, spacingScale, verticallyCentered, wordWrap } = cfg;

	const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = configureCanvas(canvas, cfg);

  const str = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  // Line spacing depends on the CURRENT font, which can change on resize — recompute, don't capture.
  const measureSpacing = () => {
    const m = context.measureText(str);
    return (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) * spacingScale + spacing;
  };
  let actualSpacing = measureSpacing();

	// `let` because resize disposes + recreates it (see below).
	let texture = new CanvasTexture(canvas);

	const material = new MeshBasicMaterial({
		side: DoubleSide,
		map: texture,
		transparent: true,
	});

	const geometry = new PlaneGeometry(1, 1);

	const mesh = new Mesh( geometry, material );
  mesh.scale.x = 1;
  mesh.scale.y = height / width;

  const bisectWidth = (str: string, maxWidth: number) => bisect(1, str.length, num => {
    const subStr = str.slice(0, num);
    const { width } = context.measureText(subStr);

    return width - maxWidth;
  });

  // TODO: Extract this to a util function for potential reuse
  const splitByWidth = (str: string, maxWidth: number) => {
    const result: string[] = [];

    let index = 0;
    let length = bisectWidth(str, maxWidth);
    while(length < str.slice(index).length) {
      result.push(str.slice(index, index + length));
      index += length;
      length = bisectWidth(str.slice(index), maxWidth);
    }

    result.push(str.slice(index));

    return result;
  };

  const drawLines = (str: string) => {
    // Read from the live canvas, not the creation-time args — they change on resize.
    const x = centered ? canvas.width / 2 : 0;
    const lines = str.split("\n");

    const yOffset = (lines.length - 1) * (actualSpacing / 2);
    let y = verticallyCentered ? canvas.height / 2 - yOffset : 0;

    lines.forEach(line => {
      if(line.trim().length === 0) {
        y += actualSpacing;
        return;
      }

      const content = wordWrap ? splitByWidth(line, canvas.width) : [line];
      content.forEach(subLine => {
        context.fillText(subLine, x, y);
        y += actualSpacing;
      })
    });
  };

  const set = (...values: any[]) => {
    context.clearRect(0, 0, canvas.width, canvas.height);

    const str = toLog(...values);
    drawLines(str);

    if(border) {
      context.strokeStyle = border;
      context.strokeRect(0, 0, canvas.width, canvas.height);
    }

    texture.needsUpdate = true;
  };

  // `width`/`height` are the backing-canvas PIXEL size; pass `fontSize` to rescale the font with the
  // pixel density (a higher-res redraw stays crisp without shrinking on screen).
  const resize = (width: number, height: number, fontSize?: string) => {
    canvas.width = width;
    canvas.height = height;

    // Resizing the backing canvas resets ALL 2d-context state (font, color, alignment, baseline) to
    // defaults — re-apply our config (with any new font), or the next draw renders wrong.
    if (fontSize !== undefined) cfg.fontSize = fontSize;
    configureCanvas(canvas, cfg);
    actualSpacing = measureSpacing();

    mesh.scale.x = 1;
    mesh.scale.y = height / width;

    // Resizing the backing canvas does NOT reliably reallocate the GPU texture (`needsUpdate` alone
    // leaves the old allocation, so the new canvas samples out of a stale, larger texture — the
    // content appears tiny/squished and repeats). Dispose + recreate to force a clean upload.
    texture.dispose();
    texture = new CanvasTexture(canvas);
    material.map = texture;
    material.needsUpdate = true;
  };

  // We put it in a container so we can scale it evenly
  const container = new Object3D();
  container.add(mesh);

  set("Warning: `TextSprite.set(...values: any[])` was never called")

  return { mesh: container, set, resize };
};
