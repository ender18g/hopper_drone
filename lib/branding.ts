import branding from "../config/branding.json";

export type EditorMode = "python" | "javascript" | "blocks";

const EDITOR_MODES: EditorMode[] = ["python", "blocks", "javascript"];
const configuredEditors = branding.codingOptions.enabledEditors.filter(
  (mode): mode is EditorMode => EDITOR_MODES.includes(mode as EditorMode),
);

export const STUDIO_NAME = branding.studioName;
export const LAB_NAME = branding.labName;
export const ORGANIZATION_PREFIX = branding.organizationPrefix;
export const ENABLED_EDITOR_MODES: EditorMode[] =
  configuredEditors.length > 0 ? configuredEditors : ["python"];
export const DEFAULT_EDITOR_MODE: EditorMode =
  ENABLED_EDITOR_MODES.includes(branding.codingOptions.defaultEditor as EditorMode)
    ? branding.codingOptions.defaultEditor as EditorMode
    : ENABLED_EDITOR_MODES[0];
export const STUDIO_TITLE = `${STUDIO_NAME} · ${LAB_NAME}`;
export const METADATA_TITLE = [ORGANIZATION_PREFIX, STUDIO_TITLE]
  .filter(Boolean)
  .join(" ");
