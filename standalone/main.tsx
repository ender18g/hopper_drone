import React from "react";
import { createRoot } from "react-dom/client";
import HopperStudio from "../components/HopperStudio";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Hopper Studio root element is missing.");

createRoot(root).render(
  <React.StrictMode>
    <HopperStudio />
  </React.StrictMode>,
);
