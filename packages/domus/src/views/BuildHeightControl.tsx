import { ChevronDown, ChevronUp, Layers } from "lucide-react";
import { useState } from "react";

import { useValue } from "@kitsune/common-web/src/react";

import { Button } from "@/components/ui/button";

import { EditorApp } from "../domus-app/level-editor";

// Keep in sync with the PgUp/PgDn key bindings (domus-app/editor-input.ts) — e2e asserts the
// resulting "Height: X.XX m" texts.
const HEIGHT_SNAP = 0.05; // m — typed values snap like the steppers
const HEIGHT_NUDGE = 0.5; // m — the ▼/▲ stepper increment

// The multi-level build-plane height control: a Layers icon, ▼/▲ steppers, and a click-to-edit
// numeric readout. Owns the small "editing" state; reads/writes the editor's `buildHeight` Value.
export const BuildHeightControl = ({ app }: { app: EditorApp }) => {
  const buildHeight = useValue(app.buildHeight);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const commit = () => {
    const v = parseFloat(draft);
    if (Number.isFinite(v)) app.buildHeight.set(Math.round(v / HEIGHT_SNAP) * HEIGHT_SNAP);
    setEditing(false);
  };

  return (
    <div
      className="flex items-center gap-1.5"
      title="Build-plane elevation — PgUp / PgDn (Shift = storey jump, Alt = fine)"
    >
      <Layers className="text-muted-foreground size-4" />
      <Button size="sm" variant="secondary" onClick={() => app.nudgeBuildHeight(-HEIGHT_NUDGE)}>
        <ChevronDown className="size-4" />
      </Button>
      {editing ? (
        <input
          type="number"
          step={HEIGHT_SNAP}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") setEditing(false);
          }}
          className="bg-background w-16 rounded border px-1 py-0.5 text-center text-sm tabular-nums"
        />
      ) : (
        <button
          type="button"
          className="hover:bg-secondary w-16 rounded px-1 py-0.5 text-center text-sm tabular-nums"
          title="Click to type an exact elevation (m)"
          onClick={() => {
            setDraft(buildHeight.toFixed(2));
            setEditing(true);
          }}
        >
          {buildHeight.toFixed(2)} m
        </button>
      )}
      <Button size="sm" variant="secondary" onClick={() => app.nudgeBuildHeight(HEIGHT_NUDGE)}>
        <ChevronUp className="size-4" />
      </Button>
    </div>
  );
};
