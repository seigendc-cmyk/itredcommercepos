import { useEffect, useRef, useState } from 'react';

const FEEDBACK_DURATION_MS = 650;

/** Immediate, app-wide acknowledgement for every enabled CTA click. */
export function GlobalActionFeedback() {
  const [sequence, setSequence] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const acknowledgeAction = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]')
        : null;
      if (!target || target.matches(':disabled, [aria-disabled="true"]')) return;
      if (timer.current) clearTimeout(timer.current);
      setSequence(previous => previous + 1);
      timer.current = setTimeout(() => setSequence(0), FEEDBACK_DURATION_MS);
    };
    document.addEventListener('click', acknowledgeAction, true);
    return () => {
      document.removeEventListener('click', acknowledgeAction, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!sequence) return null;
  return <div className="fixed inset-x-0 top-0 z-[10000] h-1 bg-orange-100 pointer-events-none" aria-hidden="true"><div key={sequence} className="global-action-progress h-full bg-[#FF6600] shadow-[0_0_8px_rgba(255,102,0,0.65)]" /></div>;
}
