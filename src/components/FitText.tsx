"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * One line of text sized to fill its container's width: as large as possible
 * (up to `max` px) while the whole text still fits. Re-fits when the box
 * resizes or the web font finishes loading.
 */
export default function FitText({
  text,
  max = 16,
  min = 6,
  scale = 1,
  className = "",
}: {
  text: string;
  max?: number;
  min?: number;
  scale?: number; // shrink the fitted size by this factor (e.g. 0.9 = 10% smaller)
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const span = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = box.current;
    const s = span.current;
    if (!el || !s) return;
    const fit = () => {
      let lo = min, hi = max;
      s.style.fontSize = `${hi}px`;
      if (s.scrollWidth <= el.clientWidth) {
        s.style.fontSize = `${hi * scale}px`;
        return;
      }
      // Binary search for the largest size that fits.
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        s.style.fontSize = `${mid}px`;
        if (s.scrollWidth <= el.clientWidth) lo = mid;
        else hi = mid;
      }
      s.style.fontSize = `${lo * scale}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [text, max, min, scale]);

  return (
    <div ref={box} className={`w-full overflow-hidden ${className}`}>
      <span ref={span} className="inline-block whitespace-nowrap leading-tight" style={{ fontSize: max * scale }}>
        {text}
      </span>
    </div>
  );
}
