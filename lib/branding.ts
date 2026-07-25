import branding from "../config/branding.json";

export const STUDIO_NAME = branding.studioName;
export const LAB_NAME = branding.labName;
export const ORGANIZATION_PREFIX = branding.organizationPrefix;
export const STUDIO_TITLE = `${STUDIO_NAME} · ${LAB_NAME}`;
export const METADATA_TITLE = [ORGANIZATION_PREFIX, STUDIO_TITLE]
  .filter(Boolean)
  .join(" ");
