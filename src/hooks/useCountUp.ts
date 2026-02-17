import { useState, useEffect, useRef } from 'react';

export function useCountUp(end: number, duration: number = 1200, start: number = 0) {
  const [value, setValue] = useState(start);
  const startTime = useRef<number | null>(null);
  const rafId = useRef<number>();

  useEffect(() => {
    if (end === 0) return;

    startTime.current = null;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (timestamp: number) => {
      if (startTime.current === null) startTime.current = timestamp;
      const elapsed = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      setValue(Math.floor(start + (end - start) * easedProgress));

      if (progress < 1) {
        rafId.current = requestAnimationFrame(animate);
      }
    };

    rafId.current = requestAnimationFrame(animate);

    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [end, duration, start]);

  return value;
}
