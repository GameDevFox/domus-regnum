import { Texture, Vector2 } from "three";

import { TextureWindowGrid } from "./texture-window";
import { createSprite } from "./create-sprite";

// Icon grid layout (world units): a 10-wide grid hovering over the room.
const ICON_SPACING = 5 / 9;
const GRID_ORIGIN = { x: -2.5, z: -1.5 }; // NW icon (the old -2.5 + the +1 z offset, folded)
const ICON_HEIGHT = 4;
const ICON_SCALE = 0.5;

export const spawnIcons = (iconsTexture: Texture) => {
  const icons = [];

  for(let i=0; i<100; i++) {
    const texture = iconsTexture.clone();

    const select = TextureWindowGrid(texture, {
      count: new Vector2(10, 10),
    });

    select(i);

    // setInterval(() => {
    //   select(++i);
    //   // select(Math.floor(Math.random() * 100));
    // // }, 1000 / 15);
    // }, 1000 / 10);

    // TODO: column / row to index fn?
    const column = i % 10;
    const row = Math.floor(i / 10);

    const xPos = column * ICON_SPACING + GRID_ORIGIN.x;
    const zPos = row * ICON_SPACING + GRID_ORIGIN.z;

    const sprite = createSprite(texture);
    sprite.position.set(xPos, ICON_HEIGHT, zPos);
    sprite.scale.set(ICON_SCALE, ICON_SCALE, 1);

    icons.push(sprite);
  }

  return icons;
};
