import React from "react";
import { createRoot } from "react-dom/client";
import HopperStudio from "../components/HopperStudio";
import { STUDIO_NAME, STUDIO_TITLE } from "../lib/branding";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error(`${STUDIO_NAME} root element is missing.`);
document.title = STUDIO_TITLE;

const desktopCameraProxy =
  new URLSearchParams(window.location.search).get("desktop") === "1";

createRoot(root).render(
  <React.StrictMode>
    <HopperStudio cameraProxyAvailable={desktopCameraProxy} />
  </React.StrictMode>,
);
