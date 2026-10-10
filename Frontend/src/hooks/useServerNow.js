import { useEffect, useState } from "react";
import { onServerClockChange, serverNow } from "../utils/serverClock";

/**
 * The server's time as React state, refreshed every `intervalMs` and at once
 * whenever the clock is corrected -- so a card flips from "Continue Test" to
 * "Deadline passed" on the second it should, without a refetch.
 */
export function useServerNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const tick = () => setNow(serverNow());
    tick();
    const id = setInterval(tick, intervalMs);
    const off = onServerClockChange(tick);
    return () => {
      clearInterval(id);
      off();
    };
  }, [intervalMs]);
  return now;
}
