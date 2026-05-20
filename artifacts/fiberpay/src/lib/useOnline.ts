import { useEffect, useState } from "react";

// Simple online/offline hook backed by `navigator.onLine` + the
// `online` / `offline` window events. `navigator.onLine` is not 100%
// reliable across browsers (some return true even when traffic is
// blocked), but it's a good first-line signal that costs nothing.
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}
