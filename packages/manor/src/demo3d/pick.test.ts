import { describe, expect, it } from "vitest";

import { HOUSE } from "../space";
import { underFloor } from "./pick";
import { SHOWN_IN } from "./views";

// A click on someone is not a click on her when a floor that is drawn is between the eye and her.

const WAIST = 0.9;
const at = (x: number, floorY: number, z: number) => ({ x, y: floorY + WAIST, z });
const GROUND = HOUSE.storeys.ground.y;
const FIRST = HOUSE.storeys.first.y;
const CELLAR = HOUSE.storeys.cellar.y;
/** Someone at the kitchen table, on the ground floor: the dormitory is over her. */
const inKitchen = at(5, GROUND, 3.2);
/** High over the house, a little to the south-east, as the page opens. */
const ABOVE = { x: 20, y: 22, z: 18 };

describe("clicking someone under a floor", () => {
  it("is a click on the floor: the dormitory's boards are over the kitchen when the first floor is drawn", () => {
    expect(underFloor(HOUSE, SHOWN_IN.first, false, ABOVE, inKitchen)).toBe(true);
  });

  it("is a click on her when the floor above is lifted away", () => {
    expect(underFloor(HOUSE, SHOWN_IN.ground, false, ABOVE, inKitchen)).toBe(false);
  });

  it("is a click on her when she is on the top storey drawn: her own floor is under her, not over her", () => {
    expect(underFloor(HOUSE, SHOWN_IN.first, false, ABOVE, at(4.5, FIRST, 3.5))).toBe(false);
    expect(underFloor(HOUSE, SHOWN_IN.ground, false, ABOVE, inKitchen)).toBe(false);
  });

  it("is a click on her through a stair well, which is a hole in the floor", () => {
    // Straight down the main stair's well from over it: someone in the hall at its foot.
    const overTheWell = { x: 8.875, y: 20, z: 8 };
    expect(underFloor(HOUSE, SHOWN_IN.first, false, overTheWell, at(8.875, GROUND, 8))).toBe(false);
    // A step to the side of the well, the landing's boards are in the way.
    expect(underFloor(HOUSE, SHOWN_IN.first, false, { x: 10.5, y: 20, z: 8 }, at(10.5, GROUND, 8))).toBe(true);
  });

  it("is a click on her where nothing is built over her: the pantry has no room above it", () => {
    expect(underFloor(HOUSE, SHOWN_IN.first, false, { x: 0.5, y: 20, z: 5 }, at(0.5, GROUND, 5))).toBe(false);
  });

  it("with the roof on, nobody indoors is clicked through it, upstairs or down or under a low roof", () => {
    expect(underFloor(HOUSE, SHOWN_IN.house, true, ABOVE, at(4.5, FIRST, 3.5))).toBe(true);
    expect(underFloor(HOUSE, SHOWN_IN.house, true, ABOVE, inKitchen)).toBe(true);
    expect(underFloor(HOUSE, SHOWN_IN.house, true, { x: 0.5, y: 20, z: 5 }, at(0.5, GROUND, 5))).toBe(true);
  });

  it("looking into the cellar, nothing is over the people in it", () => {
    expect(underFloor(HOUSE, SHOWN_IN.cellar, false, ABOVE, at(15.5, CELLAR, 3.8))).toBe(false);
  });
});
