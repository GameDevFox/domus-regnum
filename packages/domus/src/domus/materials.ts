import { SRGBColorSpace } from "three";

import { textureLoader } from "@kitsune/common-web";

// Textures
export const mascotTexture = textureLoader.load("/textures/mascot.png");
mascotTexture.colorSpace = SRGBColorSpace;

export const iconsTexture = textureLoader.load("/textures/icons.png");
