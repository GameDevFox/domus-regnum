import { Texture, Vector2 } from "three";

// TODO: Move to `common-web`
export const TextureWindow = (texture: Texture) => {
  // TODO: Fix the very slight border/offset/misalignment on the top right sides of the square
  const result = (start: Vector2, size: Vector2) => {
    const textureStart = new Vector2(
      start.x / texture.width,
      start.y / texture.height,
    );
    const textureSize = new Vector2(
      size.x / texture.width,
      size.y / texture.height,
    );

    texture.offset.set(
      textureStart.x,
      1 - (textureSize.y + textureStart.y),
    );

    texture.repeat.set(
      textureSize.x,
      textureSize.y,
    );
  };

  return result;
};

type TextureWindowOptions = {
  count: Vector2,
};

export const TextureWindowGrid = (texture: Texture, options: TextureWindowOptions) => {
  const { count } = options;

  const textureSize = new Vector2(texture.width, texture.height);
  const size = textureSize.divide(count);

  const setWindow = TextureWindow(texture);

  const result = (index: number) => {
    const base = index % (count.x * count.y);

    const column = base % count.x;
    const row = Math.floor(base / count.x);

    setWindow(
      new Vector2(column * size.x, row * size.y),
      size,
    );
  };

  return result;
};


