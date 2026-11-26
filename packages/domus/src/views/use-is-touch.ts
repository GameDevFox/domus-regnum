import { useEffect, useState } from "react";

import { isCoarsePointer } from "../domus-app/pointer";

// True on coarse-pointer (touch) devices, reactively — so the UI swaps to the touch control scheme
// (and back) if the pointer capability changes (e.g. a 2-in-1 docking to a mouse).
export const useIsTouch = (): boolean => {
  const [touch, setTouch] = useState(isCoarsePointer);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const onChange = () => setTouch(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return touch;
};
