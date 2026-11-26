import { useEffect } from "react";

import { attachDomInput, Key } from "@kitsune/common-web";

import { EditorApp } from "../domus-app/level-editor";

// Builder keyboard shortcuts, routed through the editor's EventRouter. The editor-owned bindings
// (G/S/R/X/Q/Esc/PgUp/PgDn/undo + the tool layers' axis constraints) live in
// domus-app/editor-input.ts; this hook owns the TAB SCOPING — the DOM adapter attaches when the
// Builder view mounts and detaches when you leave it, so keys never leak to the Game/Debug tabs —
// plus the one React-coupled binding (E toggles the palette overlay).
export const useEditorShortcuts = (
  app: EditorApp,
  setPaletteOpen: (update: (open: boolean) => boolean) => void,
): void => {
  useEffect(() => {
    const { events } = app;

    events.layer("editor-ui", {
      key: {
        // Toggle the left-edge block palette overlay.
        [Key.E]: {
          down: (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) return false;
            setPaletteOpen((v) => !v);
          },
        },
      },
    });

    // Enter the editor layers BELOW any mode layer that's already armed (a tool, region draw) —
    // set() keeps those on top where enter() would push the editor base above them.
    const modes = events.active().filter((n) => n !== "editor" && n !== "editor-ui");
    events.set(["editor", "editor-ui", ...modes]);

    const detach = attachDomInput(events, { pointerTarget: app.renderer.domElement });
    return () => {
      detach();
      events.set(events.active().filter((n) => n !== "editor" && n !== "editor-ui"));
    };
  }, [app, setPaletteOpen]);
};
