import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { SEASONS, WEEKDAYS, dateAt, dateSays, dayOf, dayOfDate, holidayOn, isSabbath, pageBeside, pageOf, runToDay, sceneDue } from "../game";
import type { CalendarDate, Game } from "../game";
import { named } from "./dom";
import { LAYER, openLayer } from "./keys";
import { el } from "./panel";
import { ui } from "./ui-layer";
import "./calendar.css";

// The calendar: a season to a page, a week to a row, as on a real one. It opens on the season
// it is, with today marked; the pages before and after can be turned to. On it are the
// Sabbaths, the holidays, and the day the house's occasion is to be held, once one is chosen.

type CalendarProps = {
  game: Game;
  open: Value<boolean>;
  /** The game's clock, in minutes: the page is drawn again when the day changes. */
  daytime: Value<number>;
  /** Whether the dev menu is unlocked: a right-click on a day to come then runs the game on to that morning. */
  dev: Value<boolean>;
};

/** The picture for the house's occasion, on the day it is to be held. */
const OCCASION = "🫖";
const SABBATH_SAYS = "Sundays are the Sabbath";

/** What the legend under the page says: the Sabbath, and each holiday and the house's occasion, if the page holds it. */
export const legendOf = (dates: CalendarDate[], occasionDay: number | null): string => {
  const holidays = new Map(dates.flatMap((date) => {
    const holiday = holidayOn(date);
    return holiday ? [[holiday.id, `${holiday.glyph} ${holiday.name}`] as const] : [];
  }));
  const occasion = occasionDay !== null && dates.some((date) => dayOfDate(date.year, date.season, date.day) === occasionDay);
  return [SABBATH_SAYS, ...holidays.values(), ...(occasion ? [`${OCCASION} the house's occasion`] : [])].join(" · ");
};

export const mountCalendar = (scope: Scope, { game, open, daytime, dev }: CalendarProps): void => {
  scope.effect((use, shown) => {
    if (!use(open)) return;
    const veil = el("div", "calendar-veil");
    const card = el("div", "help-card calendar");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Calendar");
    const before = el("button", "chip", "‹");
    named(before, "The season before");
    const after = el("button", "chip", "›");
    named(after, "The season after");
    const today = el("button", "chip", "Today");
    const close = el("button", "chip", "Close");
    named(close, "Close — key Esc");
    const title = el("h2", "title calendar-title");
    const top = el("div", "calendar-top");
    top.append(before, title, after, today, close);
    const grid = el("div", "calendar-grid");
    const legend = el("p", "calendar-legend");
    card.append(top, grid, legend);
    veil.append(card);
    ui().append(veil);
    shown.add(() => veil.remove());
    openLayer(shown, LAYER.card, () => open.set(false));

    // It opens on the season it is.
    const now = dateAt(game.clock);
    let page = { year: now.year, season: now.season };
    let drawnDay = -1;
    let drawnPage = "";
    let drawnOccasion: number | null = null;

    const draw = (): void => {
      const count = dayOf(game.clock);
      const which = `${page.year}/${page.season}`;
      if (count === drawnDay && which === drawnPage && game.occasionDay === drawnOccasion) return;
      drawnDay = count;
      drawnPage = which;
      drawnOccasion = game.occasionDay;
      const season = SEASONS[page.season];
      title.textContent = `${season.glyph} ${season.name} · Year ${page.year}`;
      card.dataset.season = season.id;
      const { lead, dates } = pageOf(page.year, page.season);
      const cells: HTMLElement[] = WEEKDAYS.map((name, n) => {
        const head = el("span", n === WEEKDAYS.length - 1 ? "calendar-weekday sabbath" : "calendar-weekday", name.slice(0, 2));
        head.title = name;
        return head;
      });
      // The first day stands under its own day of the week: the days before it in that week are of the season before.
      for (let n = 0; n < lead; n++) cells.push(el("span", "calendar-blank"));
      for (const date of dates) {
        const at = dayOfDate(date.year, date.season, date.day);
        const holiday = holidayOn(date);
        const occasion = game.occasionDay === at;
        const cell = el("span", "calendar-day");
        cell.dataset.day = String(date.day);
        cell.dataset.count = String(at);
        cell.classList.toggle("to-come", at > count);
        cell.classList.toggle("today", at === count);
        cell.classList.toggle("past", at < count);
        cell.classList.toggle("sabbath", isSabbath(date));
        const marks = [holiday?.glyph, occasion ? OCCASION : undefined].filter((mark): mark is string => mark !== undefined);
        cell.append(el("span", "calendar-number", String(date.day)), el("span", "calendar-marks", marks.join("")));
        const says = [dateSays(date), at === count ? "today" : "", isSabbath(date) ? "the Sabbath" : "", holiday?.name ?? "", occasion ? "the house's occasion" : ""].filter(Boolean).join(": ").replace(": the", ", the");
        cell.title = says;
        cell.setAttribute("aria-label", says);
        cells.push(cell);
      }
      grid.replaceChildren(...cells);
      legend.textContent = legendOf(dates, game.occasionDay);
    };
    const turnTo = (to: { year: number; season: number }): void => {
      // There is no year before the first.
      if (to.year < 1) return;
      page = to;
      draw();
    };

    shown.effect((useIn) => {
      useIn(daytime);
      draw();
    });
    shown.listen(before, "click", () => turnTo(pageBeside(page.year, page.season, -1)));
    shown.listen(after, "click", () => turnTo(pageBeside(page.year, page.season, 1)));
    shown.listen(today, "click", () => {
      const date = dateAt(game.clock);
      turnTo({ year: date.year, season: date.season });
    });
    // With the dev menu unlocked, a right-click on a day to come runs the game on to the morning of it: all that would have happened by then does.
    shown.listen(grid, "contextmenu", (e: MouseEvent) => {
      const day = Number((e.target as Element).closest<HTMLElement>(".calendar-day.to-come")?.dataset.count);
      if (!dev.peek() || !day) return;
      e.preventDefault();
      runToDay(game, day);
      // Stopped short by a scene, or by someone asking what she is to do: the calendar gets out of its way.
      if (game.scene !== null || sceneDue(game) !== null || game.asks.length > 0) return open.set(false);
      // The page follows her to the day she has come to.
      const date = dateAt(game.clock);
      page = { year: date.year, season: date.season };
      draw();
    });
    shown.listen(close, "click", () => open.set(false));
    // A click on the dark round the card closes it; a click on the card does not.
    shown.listen(veil, "click", (e: MouseEvent) => {
      if (e.target === veil) open.set(false);
    });
  });
};
