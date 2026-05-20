import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// We keep this separate from `vite.config.ts` on purpose: the dev config
// requires PORT / BASE_PATH env vars (provided by the Replit workflow) and
// would refuse to load in a test runner that doesn't set them. This config
// also avoids the PWA / node-polyfills plugins, neither of which are
// needed for unit tests and both of which slow runs down considerably.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**", "src/components/**", "src/store/**"],
      exclude: [
        "src/components/ui/**",
        "src/**/*.d.ts",
        "src/test/**",
      ],
    },
  },
});
