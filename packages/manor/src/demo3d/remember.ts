// A choice kept in this browser, from one visit to the next: a yes or a no, a number, or a piece of text.

export type Remembered = { get: () => boolean; set: (on: boolean) => void };

/** A choice kept under a name. A browser's storage can be shut off; then nothing is remembered, and it reads as no. */
export const remembered = (key: string): Remembered => ({
  get: (): boolean => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  },
  set: (on: boolean): void => {
    try {
      if (on) localStorage.setItem(key, "1");
      else localStorage.removeItem(key);
    } catch {
      // Not remembered, then: it will read as no again next time.
    }
  },
});

export type RememberedNumber = { get: () => number | null; set: (value: number) => void };

/** A number kept under a name. With storage shut off, or nothing kept, or what is kept no number, it reads as null. */
export const rememberedNumber = (key: string): RememberedNumber => ({
  get: (): number | null => {
    try {
      const kept = localStorage.getItem(key);
      return kept === null || kept === "" || !Number.isFinite(Number(kept)) ? null : Number(kept);
    } catch {
      return null;
    }
  },
  set: (value: number): void => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // Not remembered, then: it will read as nothing kept next time.
    }
  },
});

export type RememberedText = { get: () => string | null; set: (value: string) => void };

/** A piece of text kept under a name. With storage shut off, or nothing kept, it reads as null. */
export const rememberedText = (key: string): RememberedText => ({
  get: (): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Not remembered, then: it will read as nothing kept next time.
    }
  },
});
