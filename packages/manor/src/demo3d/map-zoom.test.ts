import { describe, expect, it } from "vitest";

import { NEAREST_SCALE, REACH_MARGIN, SHEET, farthest, frameAt, held, mapAt, nearest, reachOf, slidBy, wholeReach, zoomedAt } from "./map-zoom";
import type { Box, Frame } from "./map-zoom";

// Looking at the map: how far out the view draws back, and how it is held to what has been opened.

const FRAME: Frame = { w: 800, h: 600 };
/** Two places a little apart, well inside the sheet. */
const NEAR = [{ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }];
const reach = reachOf(NEAR);

describe("what of the map may be looked at", () => {
  it("is a box round the places on it, with a margin", () => {
    expect(reach.x0).toBeCloseTo(0.4 - REACH_MARGIN);
    expect(reach.x1).toBeCloseTo(0.6 + REACH_MARGIN);
    expect(reach.y0).toBeCloseTo(0.5 - REACH_MARGIN);
    expect(reach.y1).toBeCloseTo(0.5 + REACH_MARGIN);
  });

  it("stops at the edge of the paper", () => {
    expect(reachOf([{ x: 0.05, y: 0.98 }])).toMatchObject({ x0: SHEET.x0, y1: SHEET.y1 });
    expect(reachOf([{ x: 0.98, y: 0.05 }])).toMatchObject({ x1: SHEET.x1, y0: SHEET.y0 });
  });

  it("grows when a place farther off comes onto the map", () => {
    const wider = reachOf([...NEAR, { x: 0.4, y: 0.2 }]);
    expect(wider.y0).toBeLessThan(reach.y0);
    expect(wider.x0).toBe(reach.x0);
  });

  it("is the whole sheet when there is nothing on the map", () => {
    expect(reachOf([])).toEqual(SHEET);
  });
});

describe("how far out the view draws back", () => {
  it("is as far as takes in the whole reach, and no farther", () => {
    // The reach is wider than it is tall by more than the frame is: its width is what fills the frame.
    const widthFills = FRAME.w / (reach.x1 - reach.x0);
    expect(farthest(FRAME, reach)).toBeCloseTo(widthFills);
    // In a tall frame the same reach is held by its width still; in a very wide one, by its height.
    expect(farthest({ w: 2000, h: 300 }, reach)).toBeCloseTo(300 / (reach.y1 - reach.y0));
  });

  it("holds a look that asks for more", () => {
    const out = held({ x: 0.5, y: 0.5, scale: 1 }, FRAME, reach);
    expect(out.scale).toBeCloseTo(farthest(FRAME, reach));
    const scrolled = zoomedAt(wholeReach(FRAME, reach), FRAME, reach, 0.2, { x: 10, y: 10 });
    expect(scrolled).toEqual(wholeReach(FRAME, reach));
  });

  it("lets it draw back farther once the map has more on it", () => {
    const wider = reachOf([...NEAR, { x: 0.4, y: 0.1 }, { x: 0.1, y: 0.5 }]);
    expect(farthest(FRAME, wider)).toBeLessThan(farthest(FRAME, reach));
  });

  it("comes no nearer than the nearest", () => {
    const close = zoomedAt(wholeReach(FRAME, reach), FRAME, reach, 1000, { x: 400, y: 300 });
    expect(close.scale).toBe(NEAREST_SCALE);
    // Asked for nearer still, away from the middle: nothing moves, the map does not creep under the pointer.
    const stillAsking = zoomedAt(close, FRAME, reach, 3, { x: 100, y: 80 });
    expect(stillAsking.scale).toBe(NEAREST_SCALE);
    expect(stillAsking.x).toBeCloseTo(close.x, 9);
    expect(stillAsking.y).toBeCloseTo(close.y, 9);
    // A frame so large that the whole reach is already nearer than that: there is one scale, and it is that one.
    const vast: Frame = { w: 4000, h: 4000 };
    expect(nearest(vast, reach)).toBe(farthest(vast, reach));
  });
});

describe("where the view may be slid", () => {
  const edges = (look: { x: number; y: number; scale: number }): Box => ({ x0: look.x - FRAME.w / look.scale / 2, x1: look.x + FRAME.w / look.scale / 2, y0: look.y - FRAME.h / look.scale / 2, y1: look.y + FRAME.h / look.scale / 2 });

  it("opens on the whole reach, in the middle", () => {
    const look = wholeReach(FRAME, reach);
    expect(look.x).toBeCloseTo(0.5);
    expect(look.y).toBeCloseTo(0.5);
  });

  it("stops at the edge of the reach, drawn in close", () => {
    const close = zoomedAt(wholeReach(FRAME, reach), FRAME, reach, 1.5, { x: 400, y: 300 });
    const west = slidBy(close, FRAME, reach, 100000, 0);
    expect(edges(west).x0).toBeCloseTo(reach.x0);
    const south = slidBy(close, FRAME, reach, 0, -100000);
    expect(edges(south).y1).toBeCloseTo(reach.y1);
  });

  it("goes with the hand: a drag of so many pixels moves the map by as many", () => {
    const close = zoomedAt(wholeReach(FRAME, reach), FRAME, reach, 1.5, { x: 400, y: 300 });
    const before = frameAt(close, FRAME, { x: 0.5, y: 0.5 });
    const after = frameAt(slidBy(close, FRAME, reach, 30, -20), FRAME, { x: 0.5, y: 0.5 });
    expect(after.x - before.x).toBeCloseTo(30);
    expect(after.y - before.y).toBeCloseTo(-20);
  });

  it("keeps the reach in the middle along the way it does not fill the frame", () => {
    // Drawn right back, this reach fills the frame's width and not its height: it cannot be slid up or down.
    const look = slidBy(wholeReach(FRAME, reach), FRAME, reach, 0, 5000);
    expect(look.y).toBeCloseTo((reach.y0 + reach.y1) / 2);
  });
});

describe("zooming", () => {
  it("keeps the point under the pointer where it is", () => {
    const start = zoomedAt(wholeReach(FRAME, reach), FRAME, reach, 1.2, { x: 400, y: 300 });
    const at = { x: 430, y: 280 };
    const under = mapAt(start, FRAME, at);
    const nearer = zoomedAt(start, FRAME, reach, 1.3, at);
    expect(nearer.scale).toBeCloseTo(start.scale * 1.3);
    expect(frameAt(nearer, FRAME, under).x).toBeCloseTo(at.x);
    expect(frameAt(nearer, FRAME, under).y).toBeCloseTo(at.y);
  });

  it("reads the map and the frame the same way round", () => {
    const look = { x: 0.3, y: 0.7, scale: 900 };
    const point = { x: 0.42, y: 0.61 };
    const back = mapAt(look, FRAME, frameAt(look, FRAME, point));
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
  });
});
