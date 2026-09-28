// SPDX-License-Identifier: Apache-2.0

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { en } from "./strings/en";
import "./design/fonts/fonts.css";
import "./design/tokens.css";
import "./design/base.css";
import "./design/motion.css";

document.title = en.product;

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
