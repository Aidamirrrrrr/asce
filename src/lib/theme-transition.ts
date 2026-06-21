import { flushSync } from "react-dom";

export function withThemeTransition(callback: () => void) {
  if (typeof document === "undefined") {
    callback();
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const startViewTransition = document.startViewTransition?.bind(document);

  if (prefersReducedMotion || !startViewTransition) {
    callback();
    return;
  }

  startViewTransition(() => {
    flushSync(callback);
  });
}
