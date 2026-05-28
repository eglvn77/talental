import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

// Vite + crxjs builds the manifest, content scripts, popup, and
// service worker into a chrome-loadable `dist/` directory.
// Run `npm run dev` for HMR-equipped development, or `npm run build`
// for a production bundle suitable for the Chrome Web Store / manual
// load-unpacked.
export default defineConfig({
  plugins: [crx({ manifest })],
  // crxjs handles entry points via the manifest; nothing else needed.
});
