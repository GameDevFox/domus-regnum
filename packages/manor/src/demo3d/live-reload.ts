// Whether this tab takes Vite's live reload. While work is going on in the code, every change
// reloads the page, which throws away whatever was being tried in it; turned off here, this tab
// is left as it is until it is reloaded by hand. The choice is this tab's own, and lasts while
// the tab does (a reload by hand does not undo it).
//
// Vite has no setting for this. It tells the page a reload or an update is coming and then
// does it; a listener that throws at that moment stops it. Outside development there is no
// live reload to stop, and this does nothing.

const KEY = "manor3d.live";
const OFF = "off";

const read = (): boolean => {
  try {
    return sessionStorage.getItem(KEY) !== OFF;
  } catch {
    return true;
  }
};

let live = read();

export const liveReload = {
  /** Whether a build made with a development server is what the page is running on: only then is there anything to switch. */
  there: import.meta.hot !== undefined,
  get: (): boolean => live,
  set: (on: boolean): void => {
    live = on;
    try {
      if (on) sessionStorage.removeItem(KEY);
      else sessionStorage.setItem(KEY, OFF);
    } catch {
      // Not kept, then: it lasts until the page is reloaded.
    }
  },
};

const refuse = (): void => {
  if (!live) throw new Error("Live reload is off for this tab (dev menu): the change is not taken until the page is reloaded by hand.");
};
import.meta.hot?.on("vite:beforeFullReload", refuse);
import.meta.hot?.on("vite:beforeUpdate", refuse);
