import { test, expect } from "@playwright/test";

// Visual harness spec — the "see and interact" loop the night harness is built for. Each test loads
// the app, waits for the deterministic driver (window.domus), pauses RAF, triggers some controls,
// advances a known amount of virtual time, then screenshots. PNGs land in e2e/__screenshots__/.
//
// This is a *capture* harness, not (yet) an assertion harness — the screenshots are for a human (or
// Claude) to eyeball. For pixel-stable regression baselines, seed the sims' RNG first (see
// docs/headless-harness.md → "Determinism caveats").

// Minimal shape of the dev-only harness published on window.domus (see domus-app/harness.ts).
type Domus = {
  pause: () => void;
  resume: () => void;
  advance: (seconds: number, dt?: number) => number;
  now: () => number;
};
declare global {
  interface Window {
    domus: Domus;
  }
}

const SHOTS = "e2e/__screenshots__";

// Load a built-in sample via the Files modal (Save/Load/Import/Export/Samples/Clear all live there).
const loadSample = async (page: import("@playwright/test").Page, label: string) => {
  await page.getByRole("button", { name: "Files" }).click();
  await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" }); // let the modal finish closing
};

// Start a fresh room via the Files modal's "New" button (the old toolbar Clear lives there now).
const clearLevel = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: "Files" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "New" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
};

// Add a node via the graph editor's palette (an overlay on the canvas, collapsed by default —
// the same pattern as the 3D canvas's block palette). Entries are grouped into collapsible
// categories (open by default) and labelled in PascalCase, e.g. "rectPoint" → "RectPoint".
// Opens the palette on first use.
const addNode = async (page: import("@playwright/test").Page, kind: string) => {
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  const item = page.getByRole("button", { name: label, exact: true });
  if (!(await item.isVisible()))
    await page.getByRole("button", { name: "Toggle node palette" }).click();
  await item.click();
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // The splash gates on asset load; wait for the harness to be published, then for the splash to go.
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await page.evaluate(() => window.domus.pause());
});

test("game tab — authored room after 3s of the Tidy House sim", async ({ page }) => {
  // Block textures load async. `advance()` runs frames synchronously and can't yield for the image
  // to decode, so wait for the wallpaper response before freezing + advancing — otherwise the walls
  // screenshot black (the very texture-loading bug this harness helped surface).
  const wallpaperLoaded = page
    .waitForResponse((r) => r.url().includes("wallpaper-red.png"), { timeout: 15_000 })
    .catch(() => {}); // tolerate an already-cached load
  // Trigger controls via real key events (exercises the actual handlers): B = room, T = tidy sim.
  await page.keyboard.press("b");
  await page.keyboard.press("t");
  await wallpaperLoaded;
  // Let three virtual seconds pass deterministically, rendering each frame, then capture.
  await page.evaluate(() => window.domus.advance(3));
  await page.screenshot({ path: `${SHOTS}/game-room-tidy-3s.png` });
});

test("game tab — right-drag drops the camera into manual mode", async ({ page }) => {
  // The camera starts in Controlled (auto-orbit) mode; a right-drag should flip it to Click & Drag.
  const camBtn = page.getByRole("button", { name: "Toggle camera mode" });
  await expect(camBtn).toHaveAttribute("title", /Controlled/);
  const canvas = page.locator(".domus-canvas canvas");
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(cx + 60, cy, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await expect(camBtn).toHaveAttribute("title", /Click & Drag/); // right-drag switched modes
});

test("builder tab — ghost cursor + gizmo", async ({ page }) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  // Hold a palette block (floor) so the translucent ghost appears, hover the canvas, then snapshot
  // the whole tab (canvas + controls card) so the UI chrome is visible too.
  const canvas = page.locator(".path-debug-canvas canvas");
  await expect(canvas).toBeVisible();
  await page.keyboard.press("e"); // open the palette
  await page.getByRole("button", { name: "floor", exact: true }).click(); // hold floor → place mode → ghost cursor
  await canvas.hover({ position: { x: 400, y: 240 } });
  await page.screenshot({ path: `${SHOTS}/builder-ghost.png`, fullPage: true });
});

test("builder tab — build plane stacks a second floor", async ({ page }) => {
  // Multi-level (free-Y) check: stamp floor tiles at ground, raise the build plane one storey
  // (Shift+]), stamp again — the upper tiles should render lifted above the lower ones.
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  const canvas = page.locator(".path-debug-canvas canvas");
  await expect(canvas).toBeVisible();
  page.on("dialog", (d) => d.accept()); // Clear now asks "are you sure?"
  await clearLevel(page); // empty level so the stacking is clear
  await page.keyboard.press("e"); // open the palette
  await page.getByRole("button", { name: "floor", exact: true }).click(); // hold floor → place mode
  for (const dx of [-50, 0, 50]) {
    await canvas.click({ position: { x: 400 + dx, y: 300 } });
  }
  // Raise the plane by typing an exact elevation into the click-to-edit readout, then confirm.
  await page.getByRole("button", { name: "0.00 m" }).click();
  await page.locator('input[type="number"]').fill("3.3");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Height: 3.30 m")).toBeVisible(); // the plane rose a full storey
  // PageUp/PageDown nudge the plane too (½ m default) — round-trip back to the storey height.
  await page.keyboard.press("PageUp");
  await expect(page.getByText("Height: 3.80 m")).toBeVisible();
  await page.keyboard.press("PageDown");
  await expect(page.getByText("Height: 3.30 m")).toBeVisible();
  for (const dx of [-50, 0, 50]) {
    await canvas.click({ position: { x: 400 + dx, y: 320 } });
  }
  // Turn on the nav overlay: the navmesh now has per-elevation nodes, so the two unconnected storeys
  // (no stairs yet) form separate regions — the disconnection warning proves cross-storey nav nodes.
  await page.getByRole("button", { name: "Toggle navmesh overlay" }).click();
  await expect(page.getByText(/Navmesh split into \d+ regions/)).toBeVisible();
  // Orbit to an oblique angle (RIGHT-drag = rotate) so the two stacked floors visibly separate.
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 140, { steps: 10 });
  await page.mouse.up({ button: "right" });
  await page.screenshot({ path: `${SHOTS}/builder-multilevel.png`, fullPage: true });
});

test("builder tab — placement works beyond the old bounded area", async ({ page }) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  const canvas = page.locator(".path-debug-canvas canvas");
  await expect(canvas).toBeVisible();
  page.on("dialog", (d) => d.accept()); // Clear now asks "are you sure?"
  await clearLevel(page);
  await page.keyboard.press("e"); // open the palette
  await page.getByRole("button", { name: "floor", exact: true }).click(); // hold floor → place mode

  // Glide the view well past the old ±16-column clamp, then stamp at the view centre. (Nominal
  // pan speed is 6 m/s, but the glide's 50 ms dt cap halves it under SwiftShader's slow frames —
  // ~4.5 s ≈ 13 m ≈ 26 cells at tile 0.5.)
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(4500);
  await page.keyboard.up("ArrowRight");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

  // The block landed (clamped picking used to return null out there) — and the hovered-cell
  // readout confirms we're outside the old [-16, 15] column range.
  await expect(page.getByText("1 blocks")).toBeVisible();
  await expect(page.getByText(/Cell -?(1[6-9]|[2-9]\d|\d{3,}), /)).toBeVisible();
});

test("builder tab — palette toggles with E; grabbing pops the plane to the item", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  const canvas = page.locator(".path-debug-canvas canvas");
  await expect(canvas).toBeVisible();

  // The block palette is collapsed by default; E shows it, E hides it again.
  const floorBtn = page.getByRole("button", { name: "floor", exact: true });
  await expect(floorBtn).toBeHidden();
  await page.keyboard.press("e");
  await expect(floorBtn).toBeVisible();
  await page.keyboard.press("e");
  await expect(floorBtn).toBeHidden();
  // The corner tap target toggles it too (mobile, where E isn't available).
  const paletteToggle = page.getByRole("button", { name: "Toggle block palette" });
  await paletteToggle.click();
  await expect(floorBtn).toBeVisible();

  // Hold a chair (palette click), stamp it at ground, then clear and grab it back.
  page.on("dialog", (d) => d.accept()); // Clear now asks "are you sure?"
  await clearLevel(page);
  await page.getByRole("button", { name: "chair" }).click(); // hold chair → place mode
  await canvas.click({ position: { x: 420, y: 300 } }); // stamp a chair at ground (y = 0)
  await page.keyboard.press("Escape"); // clear the held block → idle/select
  await canvas.click({ position: { x: 420, y: 300 } }); // grab the chair we just placed
  await expect(page.getByText(/grabbing chair/)).toBeVisible();

  // Ride it up a storey: the plane, the grabbed chair, AND the camera focus all rise together, so
  // the chair stays under the same screen point.
  await page.keyboard.press("Shift+PageUp");
  await expect(page.getByText("Height: 3.30 m")).toBeVisible();
  await canvas.click({ position: { x: 420, y: 300 } }); // drop it (still under the cursor)

  // Re-grabbing at the SAME screen point only finds the chair if the camera followed it up to
  // 3.30 m — and grabbing pops the plane to the item's height.
  await canvas.click({ position: { x: 420, y: 300 } });
  await expect(page.getByText(/grabbing chair/)).toBeVisible();
  await expect(page.getByText("Height: 3.30 m")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/builder-grab-pops-plane.png`, fullPage: true });
});

test("builder tab — Graph Room: resizing the rect node regenerates the whole room", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });

  // Load the parametric starter doc: one rect (6×5 m) driving floor + walls + a centered table.
  await loadSample(page, "Graph Room");
  // 1 floor area + 4 merged wall RUNS + 1 table = 6 derived blocks (counts are size-stable).
  await expect(page.getByText("10 blocks")).toBeVisible();
  await expect(page.getByText("6×5m @ (-3, -2.5)")).toBeVisible(); // the rect node summary

  // The node graph canvas shows the doc: 4 nodes, 3 binding noodles out of the rect.
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);

  // Select the rect node on the canvas and widen it via the inspector: size.x 6 → 8 m.
  await page.locator(".react-flow__node", { hasText: "rect-1" }).click();
  // Scoped to the inspector — width is the size Point's x sub-field (the canvas node carries it too).
  const row = page.getByTestId("node-inspector").getByRole("spinbutton", { name: "size x" });
  await row.fill("8");
  await row.press("Enter");

  // Floor, walls, and the table's centering all regenerate (the rect summary changes).
  await expect(page.getByText("6×5m @ (-3, -2.5)")).not.toBeVisible();
  await page.screenshot({ path: `${SHOTS}/builder-graph-room.png`, fullPage: true });

  // The whole edit is ONE undo step: undo returns to the 6×5 m room.
  await page.keyboard.press("Control+z");
  await expect(page.getByText("6×5m @ (-3, -2.5)")).toBeVisible();
});

test("builder tab — grouping: group a node, edit in place, ungroup (doc 18, Phase 3)", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("10 blocks")).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);

  // Select the walls node and fold it into a reusable component.
  await page.locator(".react-flow__node", { hasText: "walls-1" }).click();
  await page.getByRole("button", { name: "Group selection into a component" }).click();

  // Geometry is unchanged (grouping only reshapes the graph); the instance replaces the walls node.
  await expect(page.getByText("10 blocks")).toBeVisible();
  const instance = page.locator(".react-flow__node", { hasText: "group-1" });
  await expect(instance).toBeVisible();

  // Double-click the instance → descend into its definition (breadcrumb appears); the sub-graph
  // holds the generated `rect` input plus the wrapped walls node.
  await instance.dblclick();
  await expect(page.getByRole("button", { name: "Exit component" })).toBeVisible();
  const inputNode = page.locator(".react-flow__node", { hasText: "input" });
  await expect(inputNode).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "walls" })).toBeVisible();
  // The interface `input` is a SOURCE: it exposes an OUTPUT handle (right) wired INTO the sub-graph,
  // plus ONE input handle (left) on its `default` row — a rect-typed connector for wiring a fallback
  // value (a complex type can't be typed inline; doc 18). `name`/`type` stay config, no handle.
  await expect(inputNode.locator(".react-flow__handle-right")).toHaveCount(1);
  await expect(inputNode.locator(".react-flow__handle-left")).toHaveCount(1);

  // Pop back up, then ungroup — the instance explodes back to nodes, geometry still unchanged.
  await page.getByRole("button", { name: "Exit component" }).click();
  await expect(page.getByRole("button", { name: "Exit component" })).toHaveCount(0);
  await page.locator(".react-flow__node", { hasText: "group-1" }).click();
  await page.getByRole("button", { name: "Ungroup instance" }).click();
  await expect(page.getByText("10 blocks")).toBeVisible();
  // Back to 4 top-level nodes (the instance collapsed), with the walls node inlined under the old
  // instance id — the interface `input` dissolved back into the rect-1 binding.
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.locator(".react-flow__node", { hasText: "group-1/walls-1" })).toBeVisible();
});

test("builder tab — grouping: Shift-click selects multiple nodes to group (doc 18, Phase 3)", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("10 blocks")).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);

  // Click one node, then Shift-click a second — both stay selected (xyflow multi-selection).
  await page.locator(".react-flow__node", { hasText: "floor-1" }).click();
  await page.locator(".react-flow__node", { hasText: "walls-1" }).click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Group selection into a component" }).click();

  // Both folded into ONE instance: 4 nodes → 3 (rect-1, spawn-1, group-1). Had Shift-click NOT
  // accumulated, only walls would group and 4 nodes would remain. Geometry is unchanged.
  await expect(page.getByText("10 blocks")).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  // Inside the definition, both grouped nodes are present (sharing one `rect` input).
  await page.locator(".react-flow__node", { hasText: "group-1" }).dblclick();
  await expect(page.locator(".react-flow__node", { hasText: "floor" })).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "walls" })).toBeVisible();
});

test("builder tab — Component Demo: a `Walls` component instance derives the room (doc 18)", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Component Demo");

  // The instance produces the perimeter geometry (floor + the component-wrapped walls) — proving the
  // editor resolves + evaluates an author-defined component instance, not just built-in kinds.
  await expect(page.getByText("9 blocks")).toBeVisible();

  // The instance node is on the canvas and resolves its INTERFACE: selecting it, the inspector
  // shows a `region` input (a rect source) derived from the definition's `input` node.
  await page.locator(".react-flow__node", { hasText: "walls-1" }).click();
  await expect(
    page.getByTestId("node-inspector").getByRole("combobox", { name: "region source" }),
  ).toBeVisible();
});

test("builder tab — Graph Manor: the parametric manor derives connected, rooms grouped", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });

  // The Manor rebuilt as a doc: shell rect → floor + culled walls, openings wired into holes,
  // two-point partitions with seg-basis doors, hand-placed furnishings in the manual node.
  await loadSample(page, "Graph Manor");
  await expect(page.getByText("57 blocks")).toBeVisible(); // shell + furnishings (count unchanged)
  await expect(page.getByText("13.5×8.5m @ (-6.75, -4.25)")).toBeVisible(); // the shell rect summary
  // Each room's furniture is now folded into a furniture-only component, so the top-level graph
  // collapses from the flat fixture's 71 nodes to the shell + four room instances. The 57 blocks
  // above prove the grouping stayed output-preserving; assert the collapse + that the shell renders,
  // rather than pinning exact node/edge counts (which would thrash on any future regrouping).
  const nodeCount = await page.locator(".react-flow__node").count();
  expect(nodeCount).toBeGreaterThan(20); // shell (~22) + four room instances
  expect(nodeCount).toBeLessThan(40); // far below the flat fixture's 71
  await expect(page.locator(".react-flow__node", { hasText: "rect-1" })).toBeVisible();

  // Nav overlay shows no disconnection warning — the doorways keep every room reachable.
  await page.getByRole("button", { name: "Toggle navmesh overlay" }).click();
  await expect(page.getByText(/⚠/)).not.toBeVisible();
  await page.screenshot({ path: `${SHOTS}/builder-graph-manor.png`, fullPage: true });
});

test("builder tab — Organize expands to Compact / Layered, applies, and collapses", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Manor");

  // The wand is a toggle: clicking it reveals the two layout modes (no dropdown).
  await page.getByRole("button", { name: "Organize nodes" }).click();
  await expect(page.getByRole("button", { name: "Compact" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Layered" })).toBeVisible();

  // Picking one applies the layout AND collapses the fly-out.
  await page.getByRole("button", { name: "Compact" }).click();
  await expect(page.getByRole("button", { name: "Compact" })).toHaveCount(0);

  // Re-open, then dismiss with Escape without applying — also collapses.
  await page.getByRole("button", { name: "Organize nodes" }).click();
  await expect(page.getByRole("button", { name: "Layered" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Layered" })).toHaveCount(0);
});

test("builder tab — viewport rect selection + Scale drag tool (press-drag-release)", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("10 blocks")).toBeVisible();
  await expect(page.getByText("6×5m @ (-3, -2.5)")).toBeVisible();

  const canvas = page.locator(".path-debug-canvas canvas");

  // Clicking the GENERATED floor selects the rect that drives it → Move/Scale appear.
  await canvas.click({ position: { x: 495, y: 240 } });
  await expect(page.getByRole("button", { name: "Scale", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move", exact: true })).toBeVisible();

  // Scale: arm the tool, then press-drag-release on the canvas — the press anchors the gesture
  // on the rect's plane, dragging outward grows the room live, release locks it in as ONE undo
  // step (the tool stays armed). Fetch the box AFTER the clicks above — they can scroll the
  // page, and raw mouse coordinates from a stale boundingBox land off-canvas (hard-won lesson).
  await page.getByRole("button", { name: "Scale", exact: true }).click();
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx + 60, cy);
  await page.mouse.down(); // press anchors the gesture
  await page.mouse.move(cx + 150, cy, { steps: 6 }); // outward = grow
  await page.mouse.up(); // release commits
  await expect(page.getByText("6×5m @ (-3, -2.5)")).not.toBeVisible(); // the room grew
  await page.screenshot({ path: `${SHOTS}/builder-rect-scale.png`, fullPage: true });

  await page.keyboard.press("Control+z"); // the whole drag is one undo step
  await expect(page.getByText("6×5m @ (-3, -2.5)")).toBeVisible();
});

test("builder tab — X deletes the selected graph edge (unwires the binding)", async ({ page }) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("10 blocks")).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);

  // Select the floor-1 ← rect-1 noodle and press X: the binding unwires (one undo step) and
  // the floor's generated area vanishes. The Builder's own X-delete stands down inside the
  // graph. The click DISPATCHES on the edge's own (invisible, 20 px wide) interaction path —
  // a physical click can be intercepted by a NEIGHBOR edge's interaction path overlapping the
  // label, and a bezier's bounding-box center isn't on the path.
  const edge = page.locator(".react-flow__edge").first();
  await edge.locator(".react-flow__edge-interaction").dispatchEvent("click");
  await expect(edge).toHaveClass(/selected/);
  await page.keyboard.press("x");
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await expect(page.getByText("9 blocks")).toBeVisible();

  await page.keyboard.press("Control+z"); // undo re-wires and the floor returns
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  await expect(page.getByText("10 blocks")).toBeVisible();
});

test("builder tab — X in Scale mode locks the axis, does NOT delete the selected graph node", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("10 blocks")).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);

  // Select the rect node, arm Scale (S), then press X to lock the X axis. Regression: react-flow's
  // GLOBAL X-delete used to fire here and remove the very node being scaled.
  await page.locator(".react-flow__node", { hasText: "rect-1" }).click();
  await page.keyboard.press("s"); // arm scale → X now means axis-lock, not delete
  await page.keyboard.press("x");
  await expect(page.locator(".react-flow__node")).toHaveCount(4); // the node survives
  await page.keyboard.press("Escape"); // exit the tool
});

test("builder tab — graph canvas zooms with Shift+Scroll only; plain scroll passes through", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("10 blocks")).toBeVisible();

  const canvas = page.getByTestId("node-canvas");
  await canvas.scrollIntoViewIfNeeded(); // raw mouse coords need the canvas on screen
  const viewport = canvas.locator(".react-flow__viewport");
  const before = (await viewport.getAttribute("style"))!;
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // Shift+Scroll first (it preventDefaults, so the page — and the canvas — hold still): zoom.
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, -200);
  await page.keyboard.up("Shift");
  await expect(viewport).not.toHaveAttribute("style", before);

  // Plain scroll: the page scrolls instead; the graph transform stays right where the zoom
  // left it. (A wrongful zoom would land well within the grace wait.)
  const zoomed = (await viewport.getAttribute("style"))!;
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(250);
  await expect(viewport).toHaveAttribute("style", zoomed);
});

test("builder tab — graph editor resizes via its drag bar", async ({ page }) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  const canvas = page.getByTestId("node-canvas");
  const before = (await canvas.boundingBox())!.height;
  const bar = page.getByRole("separator", { name: "Resize graph editor" });
  await bar.scrollIntoViewIfNeeded();
  const bb = (await bar.boundingBox())!;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2 + 120, { steps: 6 });
  await page.mouse.up();
  expect((await canvas.boundingBox())!.height).toBeCloseTo(before + 120, 0);
});

test("builder tab — fly camera toggles; editing input stands down while flying", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("10 blocks")).toBeVisible();

  const flyBtn = page.getByRole("button", { name: "Toggle fly camera" });
  await flyBtn.click();
  await expect(flyBtn).toHaveClass(/bg-primary/); // active

  // The fly layer masks editor keys: E must NOT open the palette while flying.
  await page.keyboard.press("e");
  await expect(page.getByRole("button", { name: "floor", exact: true })).toBeHidden();

  // W flies (the fly RAF is live); Escape drops back to orbit and editing returns.
  await page.keyboard.down("w");
  await page.waitForTimeout(300);
  await page.keyboard.up("w");
  await page.keyboard.press("Escape");
  await expect(flyBtn).not.toHaveClass(/bg-primary/);
  await page.keyboard.press("e");
  await expect(page.getByRole("button", { name: "floor", exact: true })).toBeVisible();
});

test("builder tab — anchor primitive: Move arms (no Scale), yaw edits inline", async ({ page }) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await addNode(page, "anchor");
  // A primitive: the Move tool applies, Scale doesn't (no size).
  await expect(page.getByRole("button", { name: "Move", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scale", exact: true })).not.toBeVisible();
  // Yaw is inline on the canvas node and round-trips to the inspector.
  const anchorNode = page.locator(".react-flow__node", { hasText: "anchor-1" });
  const yaw = anchorNode.getByRole("spinbutton", { name: "yaw" });
  await yaw.fill("45");
  await yaw.press("Enter");
  await expect(
    page.getByTestId("node-inspector").getByRole("spinbutton", { name: "yaw" }),
  ).toHaveValue("45");
});

test("builder tab — hole node punches bare gaps; corner-touching holes remove posts", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("10 blocks")).toBeVisible();

  // A bare hole has NO fill — wiring it just splits the N wall: 10 → 11 blocks.
  await addNode(page, "hole");
  const holeNode = page.locator(".react-flow__node", { hasText: "hole-1" });
  const wallsNode = page.locator(".react-flow__node", { hasText: "walls-1" });
  const src = (await holeNode.locator(".react-flow__handle.source").boundingBox())!;
  const tgt = (await wallsNode.locator('[data-handleid="holes"]').boundingBox())!;
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByText("11 blocks")).toBeVisible();

  // Slide the hole into the NE corner (pos scale 1): the touched post disappears and the N side
  // keeps a single segment — 11 → 9 blocks (one run merged back, one post gone).
  const posScale = holeNode.getByRole("spinbutton", { name: "pos scale" });
  await posScale.fill("1");
  await posScale.press("Enter");
  await expect(page.getByText("9 blocks")).toBeVisible();
});

test("builder tab — door node punches its hole: opening socket → walls.holes (multi input)", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("10 blocks")).toBeVisible();

  // Add a door, then wire its `rect` to the shell explicitly (auto-connect is off) — it emits its fill.
  await addNode(page, "door");
  await page
    .getByTestId("node-inspector")
    .getByRole("combobox", { name: "rect source" })
    .selectOption("rect-1");
  await expect(page.getByText("11 blocks")).toBeVisible();

  // …and wiring its opening socket into walls.holes punches the wall: N splits in two.
  const doorNode = page.locator(".react-flow__node", { hasText: "door-1" });
  const wallsNode = page.locator(".react-flow__node", { hasText: "walls-1" });
  const src = (await doorNode.locator(".react-flow__handle.source").boundingBox())!;
  const tgt = (await wallsNode.locator('[data-handleid="holes"]').boundingBox())!;
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByText("12 blocks")).toBeVisible();

  // ONE value drives both: slide the door along the wall via its inline pos offset (half of
  // the paired measure fields) — the hole tracks (still split, same block count) and the fill
  // moves with it.
  const posOffset = doorNode.getByRole("spinbutton", { name: "pos offset" });
  await posOffset.fill("1");
  await posOffset.press("Enter");
  await expect(page.getByText("12 blocks")).toBeVisible();

  // The wiring is one undo step (and the slide another): unwind both, the wall heals.
  await page.keyboard.press("Control+z"); // un-slide
  await page.keyboard.press("Control+z"); // un-wire
  await expect(page.getByText("11 blocks")).toBeVisible();
});

test("builder tab — opening `fill` dropdown switches door / none / window", async ({ page }) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("10 blocks")).toBeVisible();

  // Add a door and wire its `rect` to the shell (auto-connect is off) → it sockets its fill → 11 blocks.
  await addNode(page, "door");
  await page
    .getByTestId("node-inspector")
    .getByRole("combobox", { name: "rect source" })
    .selectOption("rect-1");
  await expect(page.getByText("11 blocks")).toBeVisible();
  await page.locator(".react-flow__node", { hasText: "door-1" }).click();
  const fill = page.getByTestId("node-inspector").getByRole("combobox", { name: "fill" });

  // Switch the fill OFF → a bare gap, no frame: 11 → 10.
  await fill.selectOption("none");
  await expect(page.getByText("10 blocks")).toBeVisible();

  // Switch to a window → its frame returns: 10 → 11. One node, three socketed states.
  await fill.selectOption("window");
  await expect(page.getByText("11 blocks")).toBeVisible();
});

test("builder tab — Texture tool drags a wall's pattern offset; wheel tunes sensitivity", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("10 blocks")).toBeVisible();

  // Select the walls node on the graph canvas — the Texture button appears top-center.
  await page
    .locator(".react-flow__node", { hasText: "walls-1" })
    .getByText("walls-1", { exact: true })
    .click();
  await page.getByRole("button", { name: "Texture offset tool" }).click();
  await expect(page.getByText("5.0 mm/px")).toBeVisible(); // sensitivity readout, default

  // Wheel over the 3D canvas tunes sensitivity (no Shift — that stays camera zoom).
  const canvas = page.locator(".path-debug-canvas canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -300); // coarser
  await expect(page.getByText("5.0 mm/px")).toBeHidden();
  await page.mouse.wheel(0, 300); // back to default
  await expect(page.getByText("5.0 mm/px")).toBeVisible();

  // Press-drag-release slides texOffset: 160 px at 5 mm/px = 0.8 m, ONE undo step. The delta
  // is NEGATED so the visible pattern follows the cursor (offset advances the sample window).
  await page.mouse.move(cx - 80, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy, { steps: 8 });
  await page.mouse.up();
  const inspectorTex = page
    .getByTestId("node-inspector")
    .getByRole("spinbutton", { name: "texOffset" });
  await expect(inspectorTex).toHaveValue("-0.8");
  await page.keyboard.press("Control+z");
  await expect(inspectorTex).toHaveValue("0");
});

test("builder tab — two points + a wall node make an individual wall; points Move, no Scale", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("10 blocks")).toBeVisible();

  // Two points and a wall, wired to them explicitly (auto-connect is off): ONE run, no corner posts.
  await addNode(page, "point");
  await addNode(page, "point");
  await addNode(page, "wall");
  const wallInspector = page.getByTestId("node-inspector");
  await wallInspector.getByRole("combobox", { name: "a source" }).selectOption("point-1");
  await wallInspector.getByRole("combobox", { name: "b source" }).selectOption("point-2");
  await expect(page.getByText("11 blocks")).toBeVisible();

  // Inline thickness on the CANVAS NODE (wall is freshly selected, so the inspector is open):
  // type into the field on wall-1 itself; the commit round-trips to the inspector's thickness
  // field — same prop, same doc.
  const wallNode = page.locator(".react-flow__node", { hasText: "wall-1" });
  const inlineThickness = wallNode.getByRole("spinbutton", { name: "thickness" });
  await inlineThickness.fill("0.5");
  await inlineThickness.press("Enter");
  await expect(
    page.getByTestId("node-inspector").getByRole("spinbutton", { name: "thickness" }),
  ).toHaveValue("0.5");

  // The style input is a DROPDOWN (closed value set — no typing): flip the node's inline select
  // to wood; the inspector's dropdown follows (same prop, same doc).
  await wallNode.getByRole("combobox", { name: "style" }).selectOption("wood");
  await expect(
    page.getByTestId("node-inspector").getByRole("combobox", { name: "style" }),
  ).toHaveValue("wood");

  // A selected point gets Move (G) but no Scale — it has no size. Products-first outliner:
  // the wall is the root; expand it to reach the points it derives from.
  await page.getByRole("button", { name: "Toggle outliner" }).click();
  const outliner = page.getByTestId("outliner");
  await outliner.locator('div[title^="wall node"]').getByRole("button", { name: "Expand" }).click();
  await outliner.getByText("point-1", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Move", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scale", exact: true })).not.toBeVisible();

  // A `value` constant node feeds thickness through the graph: drag its noodle onto the wall's
  // thickness handle — the inline field yields to the binding, and the inspector shows the
  // source. (Close the outliner first so it can't overlap the graph.)
  await page.getByRole("button", { name: "Toggle outliner" }).click();
  await addNode(page, "value");
  const valueNode = page.locator(".react-flow__node", { hasText: "value-1" });
  await expect(valueNode).toBeVisible();
  const src = (await valueNode.locator(".react-flow__handle.source").boundingBox())!;
  const tgt = (await wallNode.locator('[data-handleid="thickness"]').boundingBox())!;
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(inlineThickness).toHaveCount(0); // bound → the inline field yields to the noodle
  await wallNode.getByText("wall-1", { exact: true }).click(); // select the wall → inspector
  await expect(
    page.getByTestId("node-inspector").getByRole("combobox", { name: "thickness binding source" }),
  ).toHaveValue("value-1");
});

test("builder tab — G starts the immediate Blender gesture; click confirms and exits", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("6×5m @ (-3, -2.5)")).toBeVisible();

  const canvas = page.locator(".path-debug-canvas canvas");
  await canvas.click({ position: { x: 495, y: 240 } }); // select the rect via its floor
  await expect(page.getByRole("button", { name: "Move", exact: true })).toBeVisible();

  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy); // cursor on the canvas BEFORE the key — the gesture anchors here
  await page.keyboard.press("g");
  await page.keyboard.press("z"); // axis constraint: the Z key locks the world-Z axis — X is ignored
  await page.mouse.move(cx + 120, cy, { steps: 6 }); // the rect follows with NO button held
  await expect(page.getByText("6×5m @ (-3, -2.5)")).toBeVisible(); // +X delta locked out
  await page.keyboard.press("z"); // toggle the constraint off — the gesture re-applies live
  await expect(page.getByText("6×5m @ (-3, -2.5)")).not.toBeVisible(); // now the move lands
  await page.mouse.click(cx + 120, cy); // click = confirm + exit to selection
  await expect(page.getByText("6×5m @ (-3, -2.5)")).not.toBeVisible(); // the room moved
  await expect(page.getByRole("button", { name: "Move", exact: true })).toBeVisible(); // still selected

  await page.keyboard.press("Control+z"); // the whole gesture is one undo step
  await expect(page.getByText("6×5m @ (-3, -2.5)")).toBeVisible();
});

test("builder tab — outliner lists the DAG both ways and drives selection", async ({ page }) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });

  // Parametric doc, PRODUCTS FIRST by default: generators are roots (placement counts shown),
  // what each derives from nests inside. The outliner starts CLOSED, rows start COLLAPSED.
  await loadSample(page, "Graph Room");
  await expect(page.getByTestId("outliner")).not.toBeVisible();
  await page.getByRole("button", { name: "Toggle outliner" }).click();
  const outliner = page.getByTestId("outliner");
  await expect(outliner).toBeVisible();
  await expect(outliner.getByText("walls-1", { exact: true })).toBeVisible();
  await expect(outliner.getByText("8", { exact: true })).toBeVisible(); // 4 runs + 4 corner posts
  await expect(outliner.getByText("rect-1", { exact: true })).not.toBeVisible(); // nested, collapsed
  await outliner.getByRole("button", { name: "Expand" }).first().click(); // floor-1's chevron
  await expect(outliner.getByText("rect-1", { exact: true })).toBeVisible();

  // Flip to SOURCES FIRST: the rect is the root and its generators nest (collapsed again).
  await outliner.getByRole("button", { name: "Outliner order" }).click();
  await expect(outliner.getByText("rect-1", { exact: true })).toBeVisible();
  await expect(outliner.getByText("floor-1", { exact: true })).not.toBeVisible();
  await outliner.getByRole("button", { name: "Expand" }).first().click(); // rect-1's chevron
  await expect(outliner.getByText("floor-1", { exact: true })).toBeVisible();
  await expect(outliner.getByText("walls-1", { exact: true })).toBeVisible();

  // Clicking the rect row selects it → the Move/Scale modal buttons appear.
  await outliner.getByText("rect-1", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Move", exact: true })).toBeVisible();

  // Manual blocks: load the Manor (all hand-placed), expand the list, select a wall.
  await loadSample(page, "Manor");
  await expect(outliner.getByText("Hand-placed", { exact: true })).toBeVisible();
  await outliner.getByRole("button", { name: "Expand" }).first().click();
  await outliner
    .getByText(/^wall\s/)
    .first()
    .click();
  await expect(page.getByText("wall properties")).toBeVisible(); // BlockInspector opened
  // Hand-placed walls get a numeric Thickness property (clamped to the schema's max of 1).
  const thickness = page.getByRole("spinbutton", { name: "Thickness" });
  await thickness.fill("2");
  await thickness.press("Enter");
  await expect(thickness).toHaveValue("1");
  // …and a Style enum: flipping to wood panel re-meshes the wall and the button goes active.
  await page.getByRole("button", { name: "Wood panel" }).click();
  await expect(page.getByRole("button", { name: "Wood panel" })).toHaveClass(/bg-primary/);
  await page.screenshot({ path: `${SHOTS}/builder-outliner.png`, fullPage: true });
});

test("builder tab — Export Model downloads a non-trivial .glb", async ({ page }) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("10 blocks")).toBeVisible();

  const downloadP = page.waitForEvent("download");
  await page.getByRole("button", { name: "Files" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Export Model" }).click();
  const download = await downloadP;
  expect(download.suggestedFilename()).toMatch(/^domus-room-.*\.glb$/);
  const path = await download.path();
  const fs = await import("fs");
  const size = fs.statSync(path!).size;
  expect(size).toBeGreaterThan(10_000); // real geometry + textures, not an empty shell
  // GLB magic bytes: "glTF"
  const head = fs.readFileSync(path!).subarray(0, 4).toString("ascii");
  expect(head).toBe("glTF");
});

test("game tab — left-edge camera zoom slider dollies the view", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await page.waitForTimeout(800);

  // Light the stage (Builder Room + tidy sim) so the close-up actually shows something.
  await page.keyboard.press("b");
  await page.keyboard.press("t");
  await page.waitForTimeout(600);

  const thumb = page.locator('[data-slot="slider-thumb"]');
  await expect(thumb).toBeVisible();
  await thumb.click();
  await page.keyboard.press("End"); // max zoom = closest radius
  await expect(thumb).toHaveAttribute("aria-valuenow", "100");
  await page.waitForTimeout(400); // a few frames at the new radius
  await page.screenshot({ path: `${SHOTS}/game-zoom-close.png` });
  await page.keyboard.press("Home"); // min zoom = farthest
  await expect(thumb).toHaveAttribute("aria-valuenow", "0");

  // Two-way: in manual camera mode, Shift+Scroll zoom drives the slider back. (Entering manual
  // keeps the framing — radius 20 — so the slider stays at 0 until the wheel moves the camera.)
  await page.keyboard.press("c"); // manual ("Click & Drag") camera
  const canvas = page.locator("canvas").first();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Shift"); // shift-to-zoom gates the wheel
  await page.mouse.wheel(0, -600); // zoom IN
  await page.keyboard.up("Shift");
  await expect
    .poll(async () => Number(await thumb.getAttribute("aria-valuenow")))
    .toBeGreaterThan(0); // the slider followed the manual zoom
});

test("builder tab — field-level wiring: a point's x ← rect-1.w (number-input path binding)", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("10 blocks")).toBeVisible();

  // Field-level (path) wiring lives on NUMBER inputs now that rect's position/size are whole Points.
  // Add a point and link its x to rect-1's `w` output. Select it via the outliner (open it first).
  await addNode(page, "point");
  await page.getByRole("button", { name: "Toggle outliner" }).click();
  const outliner = page.getByTestId("outliner");
  await outliner.getByText("point-1", { exact: true }).click();

  // Link its x to rect-1, path "w": x is now derived (12), and the binding row shows source.path.
  await page.getByRole("button", { name: "Link x" }).click();
  const source = page.getByRole("combobox", { name: "x binding source" });
  await expect(source).toBeVisible();
  await source.selectOption("rect-1");
  const pathField = source.locator("..").locator("input"); // the path field in the same row
  await pathField.fill("w");
  await pathField.press("Enter");

  // Unlink restores a literal field for x.
  await page.getByRole("button", { name: "Unlink x" }).click();
  await expect(page.getByRole("button", { name: "Link x" })).toBeVisible();
});

test("game tab — WASD pans the free camera; builder arrows pan the grid view", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await page.waitForTimeout(800);

  // Enter free-camera mode, glide forward-left for half a second — must not throw, and the
  // mode must survive (the keys don't collide with the game's toggles).
  await page.getByRole("button", { name: "Toggle camera mode" }).click();
  await page.keyboard.down("w");
  await page.keyboard.down("a");
  await page.waitForTimeout(500);
  await page.keyboard.up("w");
  await page.keyboard.up("a");
  await expect(page.getByRole("button", { name: "Toggle camera mode" })).toHaveAttribute(
    "title",
    /Click & Drag/,
  );

  // Third mode: Fly — WASD free flight (no orbit). Cycle to it, fly briefly (must not throw),
  // and the zoom slider hides (fly has no orbit radius for it to mean anything).
  await page.getByRole("button", { name: "Toggle camera mode" }).click(); // manual → fly
  await expect(page.getByRole("button", { name: "Toggle camera mode" })).toHaveAttribute(
    "title",
    /Fly/,
  );
  await expect(page.getByLabel("Camera zoom")).toBeHidden();
  await page.keyboard.down("w");
  await page.waitForTimeout(300);
  await page.keyboard.up("w");
  await expect(page.getByRole("button", { name: "Toggle camera mode" })).toHaveAttribute(
    "title",
    /Fly/,
  );
  await page.getByRole("button", { name: "Toggle camera mode" }).click(); // fly → controlled, for the Builder leg

  // Builder: arrows pan (and must NOT scroll the page or fight the G/S modal keys).
  await page.getByRole("tab", { name: "Builder" }).click();
  await page.waitForTimeout(1500);
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(400);
  await page.keyboard.up("ArrowUp");
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore); // preventDefault held
});

test("builder tab — Files modal: save the current room, reload it from the list, delete it", async ({
  page,
}) => {
  await page.goto("/build");
  await page.waitForFunction(() => Boolean(window.domus), null, { timeout: 30_000 });
  await loadSample(page, "Graph Room");
  await expect(page.getByText("10 blocks")).toBeVisible();

  // Save the current room under a name → it joins the modal's list as a user entry.
  await page.getByRole("button", { name: "Files" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Save current room as" }).fill("My Test Room");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "My Test Room", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  // Switch to a different room, then reload the saved one from the list — its blocks come back.
  await loadSample(page, "Graph Manor");
  await expect(page.getByText("57 blocks")).toBeVisible();
  await loadSample(page, "My Test Room");
  await expect(page.getByText("10 blocks")).toBeVisible();

  // Built-in rows are read-only (no delete); the user's save deletes and disappears from the list.
  await page.getByRole("button", { name: "Files" }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Delete Graph Manor" }),
  ).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "Delete My Test Room" }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "My Test Room", exact: true }),
  ).toHaveCount(0);
});

test("builder tab — /build/:roomId loads that room directly from the URL", async ({ page }) => {
  // A deep link boots straight into the Builder with the slugged room loaded. (Gate on the block
  // count, not window.domus — that's the game harness, and loading the manor on mount delays it.)
  await page.goto("/build/graph-manor");
  await expect(page.getByText("57 blocks")).toBeVisible({ timeout: 30_000 }); // Graph Manor, from the URL

  await page.goto("/build/graph-room");
  await expect(page.getByText("10 blocks")).toBeVisible({ timeout: 30_000 }); // a different slug swaps it
});
