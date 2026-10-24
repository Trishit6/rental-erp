import { useEffect, useRef, useState } from "react";

/**
 * Mount children only once the wrapper is within 300px of the viewport.
 *
 * Below-the-fold U4 effects use this around a `React.lazy` child so their code
 * is at least fetched only when a user is likely to scroll to it, and *runs*
 * only when it could actually be seen: an effect far below the fold would be
 * ticking an interval for nobody. The wrapper is a plain `div` — effect hosts
 * place it where a block-level section boundary already exists.
 *
 * Below 300px never mounts: hash links and keyboard scrolling still reveal
 * content because the observer fires on any proximity, not just scrolling.
 */
export function MountWhenNear({
  children,
  rootMargin = "300px",
}: {
  children: React.ReactNode;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} data-mount-when-near={near ? "mounted" : "waiting"}>
      {near ? children : null}
    </div>
  );
}
