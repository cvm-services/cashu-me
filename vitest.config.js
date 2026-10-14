import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { quasar, transformAssetUrls } from "@quasar/vite-plugin";
import jsconfigPaths from "vite-jsconfig-paths";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  test: {
    environment: "happy-dom",
    setupFiles: "test/vitest/setup-file.js",
    // The dialog suites build a full Quasar app in `beforeAll`, which takes
    // ~9.4s in isolation and tips past vitest's 10s default when the whole
    // suite competes for CPU. The failure mode is a misleading "Hook timed
    // out", not a broken assertion, so the ceiling is raised rather than
    // leaving a suite that fails only when it is run alongside others.
    hookTimeout: 30000,
    include: [
      // Matches vitest tests in any subfolder of 'src' or into 'test/vitest/__tests__'
      // Matches all files with extension 'js', 'jsx', 'ts' and 'tsx'
      "src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
      "test/vitest/__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
    ],
  },
  plugins: [
    vue({
      template: { transformAssetUrls },
    }),
    quasar({
      sassVariables: "src/quasar-variables.scss",
    }),
    jsconfigPaths(),
  ],
});
