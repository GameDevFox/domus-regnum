import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { hexToRgb, maskOverlay, MAID_PALETTE, type Pixels, tintUniform } from "../maids/recolor";
import { ColorPicker } from "./ColorPicker";

// Width we downscale the source to for interactive recoloring. The art is ~1240px wide; tinting
// that per picker-drag is wasteful when the preview renders small, so we work at this size.
const WORK_W = 360;

// Checkerboard so the maid's transparency reads clearly in the preview.
const CHECKER: React.CSSProperties = {
  backgroundColor: "#fbfbfd",
  backgroundImage:
    "linear-gradient(45deg,#e3e3ea 25%,transparent 25%),linear-gradient(-45deg,#e3e3ea 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e3e3ea 75%),linear-gradient(-45deg,transparent 75%,#e3e3ea 75%)",
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0,0 10px,10px -10px,-10px 0",
};

// Load the maid art once and hand back its pixels, downscaled to WORK_W.
const useMaidSource = (): Pixels | null => {
  const [pixels, setPixels] = useState<Pixels | null>(null);
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.src = "/textures/maid.png";
    img.onload = () => {
      if (cancelled) return;
      const h = Math.round((img.height / img.width) * WORK_W);
      const c = document.createElement("canvas");
      c.width = WORK_W;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, WORK_W, h);
      setPixels(ctx.getImageData(0, 0, WORK_W, h));
    };
    return () => {
      cancelled = true;
    };
  }, []);
  return pixels;
};

// Paint a Pixels buffer onto a canvas. tintUniform returns a plain object, so wrap it in a real
// ImageData for putImageData.
const PixelCanvas = ({
  pixels,
  className,
  style,
}: {
  pixels: Pixels | null;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !pixels) return;
    c.width = pixels.width;
    c.height = pixels.height;
    c.getContext("2d")?.putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
  }, [pixels]);
  return <canvas ref={ref} className={className} style={style} />;
};

export const MaidColorPanel = () => {
  const src = useMaidSource();
  // Best-fit of the recolor (multiply) model to the original green uniform — the closest single
  // color the picker can render to the source art. Weighted least squares over the masked pixels.
  const [color, setColor] = useState("#a2ba71");
  const [showMask, setShowMask] = useState(false);

  // Live preview: tinted by the picked color, or the mask overlay when toggled.
  const preview = useMemo(() => {
    if (!src) return null;
    return showMask ? maskOverlay(src) : tintUniform(src, hexToRgb(color));
  }, [src, color, showMask]);

  // The whole palette tinted at once — recomputed only when the source loads.
  const roster = useMemo(
    () => (src ? MAID_PALETTE.map((p) => ({ ...p, pixels: tintUniform(src, hexToRgb(p.hex)) })) : []),
    [src],
  );

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Sprite Recolor — Proof of Concept</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6 sm:flex-row">
            <div
              className="flex shrink-0 items-center justify-center rounded-lg border p-2"
              style={CHECKER}
            >
              <PixelCanvas
                pixels={preview}
                className="h-auto w-[260px] max-w-full"
                style={{ imageRendering: "auto" }}
              />
            </div>

            <div className="flex flex-1 flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Choose a color:</span>
                <div className="flex items-center gap-3">
                  <ColorPicker
                    color={color}
                    onChange={setColor}
                    presets={MAID_PALETTE.map((p) => p.hex)}
                  />
                  <code className="bg-muted rounded px-2 py-1 text-sm uppercase tabular-nums">
                    {color}
                  </code>
                </div>
              </div>

              <Button
                variant={showMask ? "default" : "outline"}
                size="sm"
                className="w-fit"
                onClick={() => setShowMask((v) => !v)}
              >
                {showMask ? "Showing mask" : "Show mask"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Color Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap justify-center gap-3">
            {roster.map((m) => (
              <button
                key={m.hex}
                onClick={() => setColor(m.hex)}
                title={`Use ${m.name} (${m.hex})`}
                className="flex flex-col items-center gap-1"
              >
                <div
                  className={`rounded-md border p-1 transition-transform hover:scale-105 ${color.toLowerCase() === m.hex.toLowerCase() ? "ring-foreground ring-2" : ""
                    }`}
                  style={CHECKER}
                >
                  <PixelCanvas pixels={m.pixels} className="h-auto w-[88px]" />
                </div>
                <span className="text-muted-foreground text-xs">{m.name}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
