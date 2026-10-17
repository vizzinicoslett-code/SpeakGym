import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "vite";
import type { Plugin } from "vite";

function offlineApp(): Plugin {
  let publicDirectory = "";
  return {
    name: "speakgym-offline-app",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      publicDirectory = config.publicDir;
    },
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const staticFiles = [
          "manifest.webmanifest",
          "icon.svg",
          "icon-192.png",
          "icon-512.png",
        ];
        const generatedFiles = Object.keys(bundle)
          .filter((name) => name !== "sw.js" && !name.endsWith(".map"))
          .sort();
        if (!generatedFiles.includes("index.html"))
          this.error("The offline app requires a generated index.html.");
        const hash = createHash("sha256");
        for (const name of generatedFiles) {
          const file = bundle[name];
          hash
            .update(name)
            .update(file.type === "chunk" ? file.code : file.source);
        }
        for (const name of staticFiles)
          hash
            .update(name)
            .update(readFileSync(resolve(publicDirectory, name)));
        const template = readFileSync(
          resolve(publicDirectory, "sw.js"),
          "utf8",
        );
        hash.update(template);
        const source = template
          .replace(
            "__SPEAKGYM_BUILD_VERSION__",
            hash.digest("hex").slice(0, 20),
          )
          .replace(
            "/* __SPEAKGYM_PRECACHE__ */ []",
            JSON.stringify([...generatedFiles, ...staticFiles]),
          );
        this.emitFile({ type: "asset", fileName: "sw.js", source });
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const requestedBase =
    process.env.VITE_BASE_PATH ?? env.VITE_BASE_PATH ?? "/SpeakGym/";
  const base = `${requestedBase.replace(/\/+$/, "")}/`;
  if (!base.startsWith("/") || base.startsWith("//") || /[?#]/.test(base)) {
    throw new Error(
      "VITE_BASE_PATH must be a local absolute path, such as /SpeakGym/ or /.",
    );
  }
  return {
    base,
    plugins: [react(), offlineApp()],
    test: { environment: "node", include: ["src/**/*.test.ts"] },
  };
});
