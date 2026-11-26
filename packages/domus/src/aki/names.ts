// Aki expression/pose sets — the filenames under public/aki/{poses,eyes,mouths} (kebab-case).

export const POSES = ["relaxed-hands", "joined-hands", "gesture", "pointing"] as const;
export const EYES = ["open", "semi-open", "closed", "happy", "sparkle", "embarrassed", "angry"] as const;
export const MOUTHS = ["closed", "semi-open", "open", "smile", "large-smile", "grin", "pout", "angry"] as const;

export type PoseName = (typeof POSES)[number];
export type EyesName = (typeof EYES)[number];
export type MouthName = (typeof MOUTHS)[number];
