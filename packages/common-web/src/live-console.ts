import { toLog } from "@kitsune/common";

import { Display } from "./display";

export type LiveConsoleParams = {
  throttle: number,
  // Fired with the assembled snapshot text each time it flushes to the display —
  // lets a host ship the same live view elsewhere (e.g. a remote log file).
  onSnapshot?: (text: string) => void,
};

export const LiveConsole = ({
  throttle: initialThrottle,
  onSnapshot,
}: LiveConsoleParams = {
  throttle: 10,
}) => {
  const lines: string[] = [];
  let throttle: number = initialThrottle;
  let throttleCount: number = throttle;

  const display = Display();

  const clear = () => lines.splice(0, lines.length);

  const update = () => {
    if(--throttleCount < 1) {
      const text = lines.join("\n");
      display.set(text);
      onSnapshot?.(text);
      throttleCount = throttle;
    }

    clear();
  };

  const log = (...values: any[]) => {
    const message = toLog(...values);
    const newLines = message.split("\n");
    newLines.forEach(line => lines.push(line));
  };

  const setThrottle = (throttle: number) => {
    throttle = throttle;
    throttleCount = throttle;
  };

  return {
    display,

    log,

    update,
    clear,
    setThrottle,
  };
};
