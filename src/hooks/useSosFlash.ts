import { useEffect, useRef, useState } from "react";

// [on_ms, off_ms] for each element of  · · · — — — · · ·
const SOS: [number, number][] = [
  [100, 100], [100, 100], [100, 300],   // S
  [300, 100], [300, 100], [300, 300],   // O
  [100, 100], [100, 100], [100, 700],   // S
];

/**
 * Returns an opacity value (1 = fully visible, 0.1 = nearly invisible) that
 * pulses in the SOS Morse pattern while `active` is true.
 *
 * Implemented with setTimeout so it works on all Expo targets including web
 * and Electron (useNativeDriver animations do not run on web).
 */
export function useSosFlash(active: boolean): number {
  const [bright, setBright] = useState(true);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    setBright(true);

    if (!active) return;

    let step    = 0;
    let onPhase = true;

    function tick() {
      if (cancelRef.current) return;
      const [onMs, offMs] = SOS[step];
      const delay = onPhase ? onMs : offMs;

      setTimeout(() => {
        if (cancelRef.current) return;
        if (onPhase) {
          setBright(false);
          onPhase = false;
        } else {
          setBright(true);
          onPhase = true;
          step = (step + 1) % SOS.length;
        }
        tick();
      }, delay);
    }

    tick();
    return () => { cancelRef.current = true; };
  }, [active]);

  return bright ? 1 : 0.1;
}
