import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lessons, lessonAssets } from "../information-lessons/lesson-content.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const SOURCE_DIR = path.join(ROOT, "information-lessons");
const PUBLIC_DIR = path.join(ROOT, "public", "information");
const PUBLIC_ASSET_DIR = path.join(PUBLIC_DIR, "assets");
const PUBLIC_IMAGE_DIR = path.join(PUBLIC_ASSET_DIR, "images");
const GENERATED_MODULE = path.join(ROOT, "lib", "information-lessons.generated.ts");
const GENERATED_METADATA_MODULE = path.join(
  ROOT,
  "lib",
  "information-lessons.metadata.generated.ts",
);

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const sourceMarkup = (source) => {
  const label = source.url
    ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}</a>`
    : escapeHtml(source.title);
  return `<li>${label}${source.note ? ` — ${escapeHtml(source.note)}` : ""}</li>`;
};

const heroMarkup = (lesson) => `
  <header class="lesson-hero">
    <p class="lesson-kicker">${escapeHtml(lesson.kicker)}</p>
    <h1 id="lesson-title">${escapeHtml(lesson.title)}</h1>
    <p class="lesson-hero__summary">${escapeHtml(lesson.summary)}</p>
    <div class="lesson-meta" aria-label="Lesson details">
      <span class="lesson-chip">Lesson ${lesson.number} of ${lessons.length}</span>
      <span class="lesson-chip">${escapeHtml(lesson.duration)}</span>
      <span class="lesson-chip">${escapeHtml(lesson.level)}</span>
    </div>
  </header>`;

const objectivesMarkup = (lesson) => `
  <section class="lesson-objectives" aria-labelledby="objectives-title">
    <h2 id="objectives-title">Learning objectives</h2>
    <ol>${lesson.objectives.map((objective) => `<li>${escapeHtml(objective)}</li>`).join("")}</ol>
  </section>`;

const sectionsMarkup = (lesson) =>
  lesson.sections
    .map(
      (section, index) => `
        <section class="lesson-section" id="${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title">
          <span class="lesson-section__number">0${index + 1} / 0${lesson.sections.length}</span>
          <h2 id="${escapeHtml(section.id)}-title">${escapeHtml(section.title)}</h2>
          ${section.html}
        </section>`,
    )
    .join("");

const sourcesMarkup = (lesson) => `
  <footer class="lesson-sources" id="sources">
    <h2>Sources and verification</h2>
    <ol>${lesson.sources.map(sourceMarkup).join("")}</ol>
    <p class="lesson-sources__verified">Content and command behavior verified ${escapeHtml(lesson.verified)}</p>
  </footer>`;

const articleMarkup = (lesson) =>
  `${heroMarkup(lesson)}${objectivesMarkup(lesson)}${sectionsMarkup(lesson)}${sourcesMarkup(lesson)}`;

const tocMarkup = (lesson) => `
  <nav class="lesson-toc" aria-label="On this page">
    <span class="lesson-toc__label">On this page</span>
    <ol>
      ${lesson.sections
        .map(
          (section, index) => `
            <li>
              <a href="#${escapeHtml(section.id)}">
                <span>${String(index + 1).padStart(2, "0")}</span>
                ${escapeHtml(section.title)}
              </a>
            </li>`,
        )
        .join("")}
      <li><a href="#sources"><span>${String(lesson.sections.length + 1).padStart(2, "0")}</span>Sources</a></li>
    </ol>
  </nav>`;

const mobileTocMarkup = (lesson) => `
  <details class="lesson-mobile-toc">
    <summary>On this page</summary>
    <nav aria-label="Mobile lesson navigation">
      <ol>
        <li><a href="#lesson-title">Overview</a></li>
        ${lesson.sections
          .map((section) => `<li><a href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a></li>`)
          .join("")}
        <li><a href="#sources">Sources</a></li>
      </ol>
    </nav>
  </details>`;

const lessonHref = (lesson, mode) =>
  mode === "static" ? `${lesson.slug}.html` : `#/information/${lesson.slug}`;

const paginationMarkup = (lesson, mode) => {
  const index = lessons.findIndex((candidate) => candidate.slug === lesson.slug);
  const previous = index > 0 ? lessons[index - 1] : null;
  const next = index < lessons.length - 1 ? lessons[index + 1] : null;
  return `
    <nav class="lesson-pagination" aria-label="Lesson navigation">
      ${
        previous
          ? `<a href="${lessonHref(previous, mode)}" data-lesson-slug="${previous.slug}">
              <small>← Previous lesson</small><b>${escapeHtml(previous.title)}</b>
            </a>`
          : `<a href="${mode === "static" ? "index.html" : "#/information"}" data-lesson-hub>
              <small>← Learning library</small><b>Browse all lessons</b>
            </a>`
      }
      ${
        next
          ? `<a href="${lessonHref(next, mode)}" data-lesson-slug="${next.slug}">
              <small>Next lesson →</small><b>${escapeHtml(next.title)}</b>
            </a>`
          : `<a href="${mode === "static" ? "index.html" : "#/information"}" data-lesson-hub>
              <small>Course complete</small><b>Return to the library →</b>
            </a>`
      }
    </nav>`;
};

const hubMarkup = (mode) => `
  <main class="lesson-hub" id="lesson-content">
    <section class="lesson-hub__hero">
      <div>
        <p class="lesson-kicker">Nine field-tested lessons</p>
        <h1 id="lesson-title">Hopper field guide</h1>
        <p>Learn how pixels become decisions and how four rotors turn those decisions into motion. These lessons pair readable explanations with exact equations, tested code, and evidence-first diagrams.</p>
        <div class="lesson-meta" aria-label="Library details">
          <span class="lesson-chip">College level</span>
          <span class="lesson-chip">No engineering prerequisite</span>
          <span class="lesson-chip">Works offline</span>
        </div>
      </div>
      <figure class="lesson-hub__visual">
        <img src="assets/images/x-quadrotor-generated.jpg" width="1536" height="1024" alt="Generated isometric technical illustration of an X-configuration quadrotor">
      </figure>
    </section>
    <section class="lesson-hub__section" aria-labelledby="library-title">
      <h2 id="library-title">Choose a topic</h2>
      <p>Start anywhere. Flight foundations explain the aircraft; visual-intelligence lessons explain what the camera can infer; code references document the commands exactly as Hopper Studio runs them.</p>
      <div class="lesson-hub__grid">
        ${lessons
          .map(
            (lesson) => `
              <a class="lesson-hub-card" href="${lessonHref(lesson, mode)}" data-lesson-slug="${lesson.slug}">
                <span class="lesson-hub-card__number">${lesson.number} / ${String(lessons.length).padStart(2, "0")}</span>
                <h3>${escapeHtml(lesson.title)}</h3>
                <p>${escapeHtml(lesson.summary)}</p>
                <span class="lesson-hub-card__meta">${escapeHtml(lesson.duration)} · ${escapeHtml(lesson.level)}</span>
              </a>`,
          )
          .join("")}
      </div>
    </section>
  </main>`;

const topbarMarkup = ({ currentLesson = null, mode = "static" } = {}) => `
  <header class="lesson-topbar">
    <a class="lesson-topbar__brand" href="${mode === "static" ? "index.html" : "#/information"}" data-lesson-hub>
      <span class="lesson-topbar__brand-mark" aria-hidden="true">HF</span>
      <span><b>Hopper field guide</b><small>Interactive learning library</small></span>
    </a>
    <span class="lesson-topbar__count">${currentLesson ? `LESSON ${currentLesson.number} / ${String(lessons.length).padStart(2, "0")}` : `${lessons.length} LESSONS`}</span>
    <div class="lesson-topbar__actions">
      ${currentLesson ? `<button class="lesson-topbar__button" type="button" data-print-lesson aria-label="Print this lesson"><span>Print</span> ↗</button>` : ""}
      ${mode === "reader" ? `<button class="lesson-close" type="button" data-close-lessons aria-label="Close learning library">Close ×</button>` : ""}
    </div>
  </header>`;

const staticDocument = ({ title, description, content, currentLesson = null }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#062b4d">
  <title>${escapeHtml(title)} · Hopper Field Guide</title>
  <link rel="icon" href="../favicon.png">
  <link rel="stylesheet" href="assets/lesson.css">
  <script src="assets/lesson.js" defer></script>
</head>
<body class="lesson-document">
  <div class="lesson-surface">
    <a class="lesson-skip" href="#lesson-content">Skip to lesson content</a>
    <div class="lesson-progress" aria-hidden="true"></div>
    ${topbarMarkup({ currentLesson, mode: "static" })}
    ${content}
  </div>
</body>
</html>
`;

const buildLessonContent = (lesson, mode) => `
  <div class="lesson-layout" id="lesson-content">
    ${tocMarkup(lesson)}
    <main class="lesson-main">
      ${mobileTocMarkup(lesson)}
      ${articleMarkup(lesson)}
      ${paginationMarkup(lesson, mode)}
    </main>
  </div>`;

const imageMimeType = (filename) => {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  throw new Error(`Unsupported embedded lesson image: ${filename}`);
};

await mkdir(PUBLIC_ASSET_DIR, { recursive: true });
await mkdir(PUBLIC_IMAGE_DIR, { recursive: true });

const css = await readFile(path.join(SOURCE_DIR, "lesson.css"), "utf8");
const clientScript = await readFile(path.join(SOURCE_DIR, "lesson.js"), "utf8");
await writeFile(path.join(PUBLIC_ASSET_DIR, "lesson.css"), css);
await writeFile(path.join(PUBLIC_ASSET_DIR, "lesson.js"), clientScript);

for (const lessonItem of lessons) {
  const document = staticDocument({
    title: lessonItem.title,
    description: lessonItem.summary,
    currentLesson: lessonItem,
    content: buildLessonContent(lessonItem, "static"),
  });
  await writeFile(path.join(PUBLIC_DIR, `${lessonItem.slug}.html`), document);
}

await writeFile(
  path.join(PUBLIC_DIR, "index.html"),
  staticDocument({
    title: "Learning library",
    description: "Nine accurate, visual lessons about Hopper quadrotor flight, computer vision, and coding.",
    content: hubMarkup("static"),
  }),
);

await writeFile(
  path.join(PUBLIC_DIR, "manifest.json"),
  `${JSON.stringify(
    {
      generatedFrom: "information-lessons/lesson-content.mjs",
      verified: lessons[0]?.verified ?? "",
      lessons: lessons.map(({ number, slug, title, summary, duration, level }) => ({
        number,
        slug,
        title,
        summary,
        duration,
        level,
        path: `${slug}.html`,
      })),
    },
    null,
    2,
  )}\n`,
);

const embeddedImages = {};
for (const filename of lessonAssets) {
  const imagePath = path.join(PUBLIC_IMAGE_DIR, filename);
  const bytes = await readFile(imagePath);
  embeddedImages[`assets/images/${filename}`] = `data:${imageMimeType(filename)};base64,${bytes.toString("base64")}`;
}

const generatedLessons = lessons.map((lessonItem, index) => ({
  number: lessonItem.number,
  slug: lessonItem.slug,
  kicker: lessonItem.kicker,
  title: lessonItem.title,
  summary: lessonItem.summary,
  duration: lessonItem.duration,
  level: lessonItem.level,
  sections: lessonItem.sections.map(({ id, title }) => ({ id, title })),
  articleHtml: articleMarkup(lessonItem),
  previousSlug: index > 0 ? lessons[index - 1].slug : null,
  nextSlug: index < lessons.length - 1 ? lessons[index + 1].slug : null,
}));

const generatedMetadata = lessons.map(
  ({ number, slug, title, summary, duration, level }) => ({
    number,
    slug,
    title,
    summary,
    duration,
    level,
  }),
);

await writeFile(
  GENERATED_METADATA_MODULE,
  `/* This file is generated by scripts/generate-information-lessons.mjs. */
export const INFORMATION_LESSONS = ${JSON.stringify(generatedMetadata, null, 2)} as const;
`,
);

const generatedModule = `/* This file is generated by scripts/generate-information-lessons.mjs. */
export type InformationLesson = {
  number: string;
  slug: string;
  kicker: string;
  title: string;
  summary: string;
  duration: string;
  level: string;
  sections: ReadonlyArray<{ id: string; title: string }>;
  articleHtml: string;
  previousSlug: string | null;
  nextSlug: string | null;
};

export const INFORMATION_LESSONS = ${JSON.stringify(generatedLessons, null, 2)} as const satisfies ReadonlyArray<InformationLesson>;

export const INFORMATION_LESSON_HUB_HTML = ${JSON.stringify(hubMarkup("reader"))};

const INFORMATION_LESSON_ASSETS: Readonly<Record<string, string>> = ${JSON.stringify(embeddedImages)};

export const embedInformationLessonAssets = (html: string) => {
  let embedded = html;
  for (const [path, dataUri] of Object.entries(INFORMATION_LESSON_ASSETS)) {
    embedded = embedded.replaceAll(path, dataUri);
  }
  return embedded;
};
`;

await writeFile(GENERATED_MODULE, generatedModule);

console.log(`Generated ${lessons.length} HTML lessons, the library hub, and the in-app lesson module.`);
