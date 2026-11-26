// Maps script image names to the placeholder art URLs (served by Vite from demo/assets/). These
// files are gitignored — see .gitignore. Swap the map (or pass your own resolveImage) to use real
// art. Returning null for an unknown name makes the stage fall back to a labeled placeholder.

const ASSETS: Record<string, string> = {
  "bg-meadow": "/assets/bg-meadow.jpg",
  "bg-club": "/assets/bg-club.jpg",
  "sylvie-normal": "/assets/sylvie-normal.png",
  "sylvie-smile": "/assets/sylvie-smile.png",
  "sylvie-giggle": "/assets/sylvie-giggle.png",
  "sylvie-surprised": "/assets/sylvie-surprised.png",
};

export const resolveImage = (name: string): string | null => ASSETS[name] ?? null;
