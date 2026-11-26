import { CHAPTERS, CHAPTER_DAYS } from "./content/world";
import type { Game } from "./types";

// Where the house is in its chapter. The occasion is the evening of the chapter's last day.

export const chapterLength = (chapter: number): number => CHAPTER_DAYS[Math.min(chapter, CHAPTERS) - 1];
export const isOccasionDay = (g: Game): boolean => g.chapterDay === chapterLength(g.chapter);
export const daysToOccasion = (g: Game): number => chapterLength(g.chapter) - g.chapterDay;
/** Has this chapter's occasion already been held? */
export const occasionOver = (g: Game): boolean => g.occasion !== null && g.occasion.done;
