import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { GameEntry } from "../../app/game-entry";
import "../../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GameEntry />
  </StrictMode>,
);
