/* eslint-env node */

/*
 * This file runs in a Node context (it's NOT transpiled by Babel), so use only
 * the ES6 features that are supported by your Node version. https://node.green/
 */

// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-js

const { configure } = require("quasar/wrappers");
const { execSync } = require("child_process");

function resolveGitCommit() {
  try {
    return execSync("git describe --always --dirty", {
      cwd: __dirname,
      stdio: "pipe",
    })
      .toString()
      .trim();
  } catch (err) {
    console.warn("Unable to resolve git commit via `git describe`");
    return "unknown";
  }
}

module.exports = configure(function (/* ctx */) {
  return {
    eslint: {
      // fix: true,
      // include: [],
      // exclude: [],
      // rawOptions: {},
      warnings: true,
      errors: true,
    },

    // https://v2.quasar.dev/quasar-cli/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://v2.quasar.dev/quasar-cli/boot-files
    boot: ["theme", "base", "global-components", "i18n"],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#css
    css: ["app.scss", "base.scss", "settings.scss"],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // 'ionicons-v4',
      // 'mdi-v5',
      // 'fontawesome-v6',
      // 'eva-icons',
      // 'themify',
      // 'line-awesome',
      // 'roboto-font-latin-ext', // this or either 'roboto-font', NEVER both!

      "roboto-font", // optional, you are not bound to it
      "material-icons", // optional, you are not bound to it
    ],

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#build
    build: {
      target: {
        browser: ["esnext"],
        node: "node16",
      },

      // Static PWA hosts (nsite / Blossom gateways) resolve a path to the
      // *literal* object for that path and have no server rewrite. "history"
      // mode would therefore need index.html mirrored at every route path so a
      // deep link (e.g. /services) reaches the app instead of a 404. Hash mode
      // makes every route resolve to the one index.html that always exists.
      // Set VUE_ROUTER_MODE=history for deployments behind a rewriting server.
      vueRouterMode:
        process.env.VUE_ROUTER_MODE === "history" ? "history" : "hash",
      // vueRouterBase,
      // vueDevtools,
      // vueOptionsAPI: false,

      // rebuildCache: true, // rebuilds Vite/linter/etc cache on startup

      // Deploy-agnostic base path, injected at build time so ONE codebase (and
      // ideally one artifact) can be served from a domain root (VPS Caddy
      // vhost, GitHub Pages custom domain) or from a project sub-path
      // (https://<user>.github.io/cashu.me/).
      //   PUBLIC_PATH=/           -> domain root   (pwa.orangesync.tech, pwa-vps.*)
      //   PUBLIC_PATH=/cashu.me/  -> github.io project path fallback
      publicPath: process.env.PUBLIC_PATH || "/",
      // vueRouterBase,
      // vueDevtools,
      // vueOptionsAPI: false,

      // rebuildCache: true, // rebuilds Vite/linter/etc cache on startup

      // analyze: true,
      // Build-time injected endpoint config for the Services surface.
      // One codebase, two hosts: only the base path (above) and these values
      // may differ between the GitHub Pages build and the VPS build.
      // See src/js/services-endpoints.ts and .github/workflows/pwa-pages.yml.
      env: {
        CVM_CATALOG_URL:
          process.env.CVM_CATALOG_URL ||
          "https://cvm.orangesync.tech/catalog.json",
        CVM_RELAYS:
          process.env.CVM_RELAYS ||
          "wss://relay1.orangesync.tech,wss://relay2.orangesync.tech",
        CVM_NAMESPACE: process.env.CVM_NAMESPACE || "cvm-services",
        SERVICES_DEPLOY_TARGET: process.env.SERVICES_DEPLOY_TARGET || "local",
      },
      // rawDefine: {}
      // ignorePublicFolder: true,
      // minify: false,
      // polyfillModulePreload: true,
      // distDir

      extendViteConf(viteConf) {
        viteConf.define = viteConf.define || {};
        viteConf.define.GIT_COMMIT = JSON.stringify(resolveGitCommit());
        // cashu-ts v4 ships ESM with BigInt — Vite's dep optimizer can mangle it
        viteConf.optimizeDeps = viteConf.optimizeDeps || {};
        viteConf.optimizeDeps.exclude = [
          ...(viteConf.optimizeDeps.exclude || []),
          "@agicash/qr-scanner",
          "@cashu/cashu-ts",
        ];
      },
      // viteVuePluginOptions: {},

      // vitePlugins: [
      //   [ 'package-name', { ..options.. } ]
      // ]
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#devServer
    devServer: {
      https: process.env.E2E !== "true",
      open: process.env.E2E !== "true", // keep automated runs headless
      port: 8080,
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#framework
    framework: {
      config: {},

      iconSet: "material-icons", // Quasar icon set
      // lang: 'en-US', // Quasar language pack

      // For special cases outside of where the auto-import strategy can have an impact
      // (like functional components as one of the examples),
      // you can manually specify Quasar components/directives to be available everywhere:
      //
      // components: [],
      // directives: [],

      // Quasar plugins
      plugins: ["LocalStorage", "Notify"],
    },

    animations: "all", // --- includes all animations
    // https://v2.quasar.dev/options/animations
    // animations: [],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#property-sourcefiles
    // sourceFiles: {
    //   rootComponent: 'src/App.vue',
    //   router: 'src/router/index',
    //   store: 'src/store/index',
    //   registerServiceWorker: 'src-pwa/register-service-worker',
    //   serviceWorker: 'src-pwa/custom-service-worker',
    //   pwaManifestFile: 'src-pwa/manifest.json',
    //   electronMain: 'src-electron/electron-main',
    //   electronPreload: 'src-electron/electron-preload'
    // },

    // https://v2.quasar.dev/quasar-cli/developing-ssr/configuring-ssr
    ssr: {
      // ssrPwaHtmlFilename: 'offline.html', // do NOT use index.html as name!
      // will mess up SSR

      // extendSSRWebserverConf (esbuildConf) {},
      // extendPackageJson (json) {},

      pwa: false,

      // manualStoreHydration: true,
      // manualPostHydrationTrigger: true,

      prodPort: 3000, // The default port that the production server should use
      // (gets superseded if process.env.PORT is specified at runtime)

      middlewares: [
        "render", // keep this as last one
      ],
    },

    // https://v2.quasar.dev/quasar-cli/developing-pwa/configuring-pwa
    pwa: {
      workboxMode: "generateSW", // or 'injectManifest'
      injectPwaMetaTags: true,
      swFilename: "sw.js",
      manifestFilename: "manifest.json",
      useCredentialsForManifestTag: false,
      workboxOptions: {
        skipWaiting: true,
        clientsClaim: true,
      },
      // useFilenameHashes: true,
      // extendGenerateSWOptions (cfg) {}
      // extendInjectManifestOptions (cfg) {},
      // extendManifestJson (json) {}
      // extendPWACustomSWConf (esbuildConf) {}
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli/developing-cordova-apps/configuring-cordova
    cordova: {
      // noIosLegacyBuildFlag: true, // uncomment only if you know what you are doing
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli/developing-capacitor-apps/configuring-capacitor
    capacitor: {
      hideSplashscreen: false,
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli/developing-electron-apps/configuring-electron
    electron: {
      // extendElectronMainConf (esbuildConf)
      // extendElectronPreloadConf (esbuildConf)

      inspectPort: 5858,

      bundler: "packager", // 'packager' or 'builder'

      packager: {
        // https://github.com/electron-userland/electron-packager/blob/master/docs/api.md#options
        // OS X / Mac App Store
        // appBundleId: '',
        // appCategoryType: '',
        // osxSign: '',
        // protocol: 'myapp://path',
        // Windows only
        // win32metadata: { ... }
        asar: true,
        prune: true,
        ignore: [
          /(^|[\\/])node_modules([\\/]|$)/,
          /(^|[\\/])screenshots([\\/]|$)/,
          /(^|[\\/])package-lock\.json$/,
          /(^|[\\/])yarn\.lock$/,
          /(^|[\\/])pnpm-lock\.yaml$/,
          /(^|[\\/])vitest\.config\.js$/,
          /(^|[\\/])test([\\/]|$)/,
        ],
      },

      builder: {
        // https://www.electron.build/configuration/configuration

        appId: "me.cashu",
      },
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-browser-extensions/configuring-bex
    bex: {
      contentScripts: ["my-content-script"],

      // extendBexScriptsConf (esbuildConf) {}
      // extendBexManifestJson (json) {}
    },
  };
});
