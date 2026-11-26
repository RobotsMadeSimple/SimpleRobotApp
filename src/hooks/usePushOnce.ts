import { router, useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useRef } from "react";

/**
 * A `router.push` that ignores repeat presses, so double-tapping a card or button
 * before the next page has loaded can't push that page onto the stack twice.
 *
 * After a push, further pushes from this screen are ignored until it regains focus
 * (the user came back), or — if the push never took the screen out of focus (e.g. it
 * was rejected) — after `fallbackMs`. A push is also ignored while the screen isn't
 * focused, which covers a second tap that only gets handled once the next page is up.
 */
export function usePushOnce(fallbackMs = 700): (...args: Parameters<typeof router.push>) => void {
  const navigation = useNavigation();
  const busy  = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(useCallback(() => {
    busy.current = false;
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, []));

  return useCallback((...args: Parameters<typeof router.push>) => {
    if (busy.current || !navigation.isFocused()) return;
    busy.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (navigation.isFocused()) busy.current = false;
    }, fallbackMs);
    router.push(...args);
  }, [navigation, fallbackMs]);
}
