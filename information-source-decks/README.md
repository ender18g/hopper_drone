# Archived Hopper slide-deck sources

These editable PowerPoint decks are retained as historical instructor
materials:

- `01-hopper-sensor-suite.pptx`
- `02-quadrotor-aerodynamics.pptx`
- `05-thresholding-with-hopper.pptx`
- `06-object-detection-and-coco.pptx`
- `07-teachable-machine-models.pptx`
- `08-apriltags-with-hopper.pptx`

The website no longer publishes or links informational PDFs. The canonical
student lessons are now the responsive, offline-capable HTML documents defined
in `information-lessons/lesson-content.mjs`. Run:

```sh
npm run lessons
```

That command generates the standalone files in `public/information/` and the
shared module used by Hopper Studio's in-app learning-library reader. Equations
are pre-rendered to MathML with KaTeX, and JavaScript/Python examples are
highlighted at build time with Prism.

The legacy PDF generators write only to the workspace `output/pdf/` archive.
They must not be treated as the source of truth for the website lessons.
