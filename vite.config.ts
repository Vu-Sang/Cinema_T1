import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vite";

// Local Durable Object files have long names; in a deep folder they pass the Windows path limit.
const persistState = process.cwd().length > 100 ? { path: join(tmpdir(), "rap-t1-state") } : true;

export default defineConfig({
  plugins: [react(), cloudflare({ persistState })],
});
