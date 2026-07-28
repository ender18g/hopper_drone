"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

const LazyInformationLessonReader = lazy(() => import("./InformationLessonReader"));

const lessonHashIsOpen = () =>
  typeof window !== "undefined" && window.location.hash.startsWith("#/information");

export default function InformationLessonLauncher() {
  const [open, setOpen] = useState(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const closeReader = useCallback(() => {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    setOpen(false);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, []);

  useEffect(() => {
    const update = () => setOpen(lessonHashIsOpen());
    update();
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const studio = document.querySelector<HTMLElement>(".studio-shell");
    const previousAriaHidden = studio?.getAttribute("aria-hidden") ?? null;
    const previouslyInert = studio?.hasAttribute("inert") ?? false;
    const previousBodyOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    studio?.setAttribute("aria-hidden", "true");
    studio?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".lesson-loading__close")?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeReader();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(".lesson-reader__dialog");
      if (!dialog) return;
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (controls.length === 0) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls.at(-1);
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (studio) {
        if (previousAriaHidden === null) studio.removeAttribute("aria-hidden");
        else studio.setAttribute("aria-hidden", previousAriaHidden);
        if (!previouslyInert) studio.removeAttribute("inert");
      }
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, [closeReader, open]);

  if (!open) return null;

  return (
    <Suspense
      fallback={(
        <section
          className="lesson-reader lesson-surface"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lesson-loading-title"
        >
          <div className="lesson-reader__dialog">
            <button
              className="lesson-close lesson-loading__close"
              type="button"
              onClick={closeReader}
            >
              Close ×
            </button>
            <div className="lesson-loading" role="status" aria-live="polite">
              <span aria-hidden="true">HF</span>
              <p id="lesson-loading-title">Loading the Hopper field guide…</p>
            </div>
          </div>
        </section>
      )}
    >
      <LazyInformationLessonReader />
    </Suspense>
  );
}
