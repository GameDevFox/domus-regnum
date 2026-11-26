// The loading screen is part of the page itself (demo3d.html), so that it is there from the first
// thing the browser draws. This takes it away, once the house has been drawn under it.

/** How long it takes to fade: as long as the page says (demo3d.html, `#loading`). */
const FADE_MS = 400;
/** The lettering is waited for, so that it does not change under the eye; but not for longer than this. */
const LETTERING_WAIT_MS = 1500;

const after = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
/** The frame after next has been drawn: whatever was asked for before now is on the screen. */
const drawn = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

/** The page is ready: the loading screen fades, and is gone. */
export const loaded = (): void => {
  // (For a stylesheet or a script that wants to know.)
  document.body.classList.add("ready");
  const screen = document.getElementById("loading");
  if (!screen) return;
  // From this moment it keeps nothing from the page under it: a script may press things at once.
  screen.style.pointerEvents = "none";
  void Promise.all([drawn(), Promise.race([document.fonts.ready, after(LETTERING_WAIT_MS)])]).then(async () => {
    screen.classList.add("going");
    await after(FADE_MS);
    screen.remove();
  });
};
