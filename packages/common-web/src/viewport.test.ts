import { PerspectiveCamera, Vector2 } from "three";

import { intersectPlaneAtY, pointerNdc } from "./viewport";

describe("pointerNdc", () => {
  it("maps element corners and center into [-1,1]² with y up", () => {
    const element = {
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 200, height: 100 }),
    } as unknown as HTMLElement;
    expect(pointerNdc(100, 50, element)).toEqual(new Vector2(-1, 1)); // top-left
    expect(pointerNdc(300, 150, element)).toEqual(new Vector2(1, -1)); // bottom-right
    expect(pointerNdc(200, 100, element)).toEqual(new Vector2(0, 0)); // center
  });
});

describe("intersectPlaneAtY", () => {
  it("a straight-down view hits the ground directly below the camera", () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(3, 10, -2);
    camera.lookAt(3, 0, -2);
    camera.updateMatrixWorld();
    const hit = intersectPlaneAtY(camera, new Vector2(0, 0), 0);
    expect(hit!.x).toBeCloseTo(3);
    expect(hit!.y).toBeCloseTo(0);
    expect(hit!.z).toBeCloseTo(-2);
  });

  it("respects the plane height", () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 10, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const hit = intersectPlaneAtY(camera, new Vector2(0, 0), 4);
    expect(hit!.y).toBeCloseTo(4);
  });

  it("an oblique camera tracks the cursor consistently: off-center NDC lands off-center on the plane", () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const center = intersectPlaneAtY(camera, new Vector2(0, 0), 0)!;
    const right = intersectPlaneAtY(camera, new Vector2(0.5, 0), 0)!;
    expect(center.x).toBeCloseTo(0);
    expect(right.x).toBeGreaterThan(0.5); // cursor right ⇒ world point right of center
    expect(right.z).toBeCloseTo(center.z, 0); // roughly the same depth band
  });

  it("returns null when the ray misses the plane (camera looking up)", () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 5, 0);
    camera.lookAt(0, 10, -1); // pitched above the horizon
    camera.updateMatrixWorld();
    expect(intersectPlaneAtY(camera, new Vector2(0, 0), 0)).toBeNull();
  });
});
