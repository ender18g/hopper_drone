"use client";

import { lazy, Suspense, useEffect, useState } from "react";

const LazyInformationLessonReader = lazy(() => import("./InformationLessonReader"));

const lessonHashIsOpen = () =>
  typeof window !== "undefined" && window.location.hash.startsWith("#/information");

export default function InformationLessonLauncher() {
  const [open, setOpen] = useState(false);

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

  if (!open) return null;

  return (
    <Suspense
      fallback={(
        <section className="lesson-reader lesson-surface" role="status" aria-live="polite">
          <div className="lesson-reader__dialog">
            <div className="lesson-loading">
              <span aria-hidden="true">HF</span>
              <p>Loading the Hopper field guide…</p>
            </div>
          </div>
        </section>
      )}
    >
      <LazyInformationLessonReader />
    </Suspense>
  );
}
