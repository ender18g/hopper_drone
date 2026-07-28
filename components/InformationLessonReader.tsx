"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  INFORMATION_LESSONS,
  INFORMATION_LESSON_HUB_HTML,
  embedInformationLessonAssets,
  type InformationLesson,
} from "../lib/information-lessons.generated";

type LessonRoute =
  | { kind: "hub" }
  | { kind: "lesson"; lesson: InformationLesson }
  | null;

const INFORMATION_HASH = "#/information";

const routeFromHash = (): LessonRoute => {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (hash === INFORMATION_HASH || hash === `${INFORMATION_HASH}/`) {
    return { kind: "hub" };
  }
  if (!hash.startsWith(`${INFORMATION_HASH}/`)) return null;
  let slug = "";
  try {
    slug = decodeURIComponent(hash.slice(`${INFORMATION_HASH}/`.length)).split(/[?#]/, 1)[0];
  } catch {
    return { kind: "hub" };
  }
  const lesson = INFORMATION_LESSONS.find((candidate) => candidate.slug === slug);
  return lesson ? { kind: "lesson", lesson } : { kind: "hub" };
};

const setInformationHash = (suffix = "") => {
  const nextHash = suffix ? `${INFORMATION_HASH}/${suffix}` : INFORMATION_HASH;
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${nextHash}`,
  );
  window.dispatchEvent(new HashChangeEvent("hashchange"));
};

const findLesson = (slug: string | null) =>
  slug ? INFORMATION_LESSONS.find((candidate) => candidate.slug === slug) ?? null : null;

export default function InformationLessonReader() {
  const [route, setRoute] = useState<LessonRoute>(() => routeFromHash());
  const [liveMessage, setLiveMessage] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateRoute = () => setRoute(routeFromHash());
    updateRoute();
    window.addEventListener("hashchange", updateRoute);
    window.addEventListener("popstate", updateRoute);
    return () => {
      window.removeEventListener("hashchange", updateRoute);
      window.removeEventListener("popstate", updateRoute);
    };
  }, []);

  useEffect(() => {
    if (!route) return;
    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      dialog.scrollTop = 0;
      const title = dialog.querySelector<HTMLElement>("#lesson-title");
      if (title) {
        title.tabIndex = -1;
        title.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [route]);

  const closeReader = useCallback(() => {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, []);

  const hubHtml = useMemo(
    () => embedInformationLessonAssets(INFORMATION_LESSON_HUB_HTML),
    [],
  );
  const articleHtml = useMemo(
    () =>
      route?.kind === "lesson"
        ? embedInformationLessonAssets(route.lesson.articleHtml)
        : "",
    [route],
  );

  const handleScroll = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const available = dialog.scrollHeight - dialog.clientHeight;
    const progress = available > 0 ? Math.min(100, Math.max(0, (dialog.scrollTop / available) * 100)) : 0;
    dialog.style.setProperty("--lesson-progress", `${progress}%`);

    if (route?.kind !== "lesson") return;
    const sections = ["lesson-title", ...route.lesson.sections.map((section) => section.id), "sources"];
    let current = "lesson-title";
    for (const id of sections) {
      const element = dialog.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
      if (element && element.getBoundingClientRect().top <= 140) current = id;
    }
    dialog.querySelectorAll<HTMLAnchorElement>(".lesson-toc a").forEach((link) => {
      if (link.getAttribute("href") === `#${current}`) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }, [route]);

  const handleClick = useCallback(
    async (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as Element;
      const lessonLink = target.closest<HTMLElement>("[data-lesson-slug]");
      if (lessonLink?.dataset.lessonSlug) {
        event.preventDefault();
        setInformationHash(lessonLink.dataset.lessonSlug);
        return;
      }
      if (target.closest("[data-lesson-hub]")) {
        event.preventDefault();
        setInformationHash();
        return;
      }
      if (target.closest(".lesson-skip")) {
        event.preventDefault();
        const content = dialogRef.current?.querySelector<HTMLElement>("#lesson-content");
        content?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (content) {
          content.tabIndex = -1;
          content.focus({ preventScroll: true });
        }
        return;
      }
      const tocLink = target.closest<HTMLAnchorElement>(
        ".lesson-toc a, .lesson-mobile-toc a",
      );
      if (tocLink) {
        event.preventDefault();
        const id = tocLink.getAttribute("href")?.slice(1);
        const element = id ? dialogRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : null;
        element?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const copyButton = target.closest<HTMLButtonElement>("[data-copy-code]");
      if (copyButton) {
        const code = copyButton.closest(".lesson-code")?.querySelector("code")?.textContent ?? "";
        if (!code) return;
        try {
          await navigator.clipboard.writeText(code);
        } catch {
          const textArea = document.createElement("textarea");
          textArea.value = code;
          textArea.style.position = "fixed";
          textArea.style.opacity = "0";
          document.body.append(textArea);
          textArea.select();
          const copied = document.execCommand("copy");
          textArea.remove();
          if (!copied) {
            setLiveMessage("Copy is unavailable. Select the code text to copy it.");
            return;
          }
        }
        copyButton.textContent = "Copied";
        setLiveMessage("Code copied to the clipboard.");
        window.setTimeout(() => {
          copyButton.textContent = "Copy";
        }, 1400);
      }
    },
    [],
  );

  if (!route) return null;

  const currentLesson = route.kind === "lesson" ? route.lesson : null;
  const previousLesson = findLesson(currentLesson?.previousSlug ?? null);
  const nextLesson = findLesson(currentLesson?.nextSlug ?? null);

  return (
    <section
      className="lesson-reader lesson-surface"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lesson-title"
    >
      <div
        className="lesson-reader__dialog"
        ref={dialogRef}
        onClick={(event) => void handleClick(event)}
        onScroll={handleScroll}
      >
        <a className="lesson-skip" href="#lesson-content">Skip to lesson content</a>
        <div className="lesson-progress" aria-hidden="true" />
        <header className="lesson-topbar">
          <a className="lesson-topbar__brand" href={INFORMATION_HASH} data-lesson-hub>
            <span className="lesson-topbar__brand-mark" aria-hidden="true">HF</span>
            <span><b>Hopper field guide</b><small>Interactive learning library</small></span>
          </a>
          <span className="lesson-topbar__count">
            {currentLesson
              ? `LESSON ${currentLesson.number} / ${String(INFORMATION_LESSONS.length).padStart(2, "0")}`
              : `${INFORMATION_LESSONS.length} LESSONS`}
          </span>
          <div className="lesson-topbar__actions">
            {currentLesson && (
              <button
                className="lesson-topbar__button"
                type="button"
                onClick={() => window.print()}
                aria-label="Print this lesson"
              >
                <span>Print</span> ↗
              </button>
            )}
            <button className="lesson-close" type="button" onClick={closeReader}>
              Close ×
            </button>
          </div>
        </header>

        {route.kind === "hub" ? (
          <div dangerouslySetInnerHTML={{ __html: hubHtml }} />
        ) : (
          <div className="lesson-layout" id="lesson-content">
            <nav className="lesson-toc" aria-label="On this page">
              <span className="lesson-toc__label">On this page</span>
              <ol>
                <li><a href="#lesson-title"><span>00</span>Overview</a></li>
                {route.lesson.sections.map((section, index) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {section.title}
                    </a>
                  </li>
                ))}
                <li>
                  <a href="#sources">
                    <span>{String(route.lesson.sections.length + 1).padStart(2, "0")}</span>
                    Sources
                  </a>
                </li>
              </ol>
            </nav>
            <main className="lesson-main">
              <details className="lesson-mobile-toc">
                <summary>On this page</summary>
                <nav aria-label="Mobile lesson navigation">
                  <ol>
                    <li><a href="#lesson-title">Overview</a></li>
                    {route.lesson.sections.map((section) => (
                      <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>
                    ))}
                    <li><a href="#sources">Sources</a></li>
                  </ol>
                </nav>
              </details>
              <article dangerouslySetInnerHTML={{ __html: articleHtml }} />
              <nav className="lesson-pagination" aria-label="Lesson navigation">
                {previousLesson ? (
                  <a href={`${INFORMATION_HASH}/${previousLesson.slug}`} data-lesson-slug={previousLesson.slug}>
                    <small>← Previous lesson</small>
                    <b>{previousLesson.title}</b>
                  </a>
                ) : (
                  <a href={INFORMATION_HASH} data-lesson-hub>
                    <small>← Learning library</small>
                    <b>Browse all lessons</b>
                  </a>
                )}
                {nextLesson ? (
                  <a href={`${INFORMATION_HASH}/${nextLesson.slug}`} data-lesson-slug={nextLesson.slug}>
                    <small>Next lesson →</small>
                    <b>{nextLesson.title}</b>
                  </a>
                ) : (
                  <a href={INFORMATION_HASH} data-lesson-hub>
                    <small>Course complete</small>
                    <b>Return to the library →</b>
                  </a>
                )}
              </nav>
            </main>
          </div>
        )}
        <p className="lesson-live" aria-live="polite">{liveMessage}</p>
      </div>
    </section>
  );
}
