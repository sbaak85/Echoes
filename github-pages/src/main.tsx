import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { MovementLab } from "../../app/movement-lab";
import "../../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MovementLab />
  </StrictMode>,
);
