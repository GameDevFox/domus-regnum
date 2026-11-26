import { CSSProperties } from "react";

import { ThreeView } from "@kitsune/common-web/src/react";

import { domusApp } from "./three-app";

const style: CSSProperties = { zIndex: 1 };

// The app's canvas is persistent and owned by the Builder; <ThreeView> attaches it here and
// re-attaches across React remounts without rebuilding the scene (replaces the old ThreeCanvas
// that recreated the canvas on every mount).
export const DomusAppCanvas = () => (
  <div className="domus-canvas-host" style={style}>
    <ThreeView app={domusApp} className="domus-canvas" />
  </div>
);
