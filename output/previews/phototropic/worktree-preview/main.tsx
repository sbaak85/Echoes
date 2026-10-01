import { createRoot } from "react-dom/client";
import PhototropicPreview from "@echoes/phototropic-preview/page.tsx";
import "@echoes/globals.css";

// This production-component harness keeps puzzle state only in React memory.
createRoot(document.getElementById("root")!).render(<PhototropicPreview />);
