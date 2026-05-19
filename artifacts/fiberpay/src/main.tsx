import { Buffer } from "buffer";
(globalThis as any).Buffer = Buffer;
(globalThis as any).process = (globalThis as any).process ?? { env: {} };
(globalThis as any).global = globalThis;

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);