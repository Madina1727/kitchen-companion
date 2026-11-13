import { build } from "esbuild";
import { cpSync } from "node:fs";
const nm = "node_modules/";
const v = "www/vendor/";
cpSync(nm + "pdfjs-dist/build/pdf.min.mjs", v + "pdf.min.mjs");
cpSync(nm + "pdfjs-dist/build/pdf.worker.min.mjs", v + "pdf.worker.min.mjs");
cpSync(nm + "mammoth/mammoth.browser.min.js", v + "mammoth.browser.min.js");
cpSync(nm + "lucide/dist/umd/lucide.min.js", v + "lucide.min.js");
cpSync(nm + "pdf-lib/dist/pdf-lib.esm.min.js", v + "pdf-lib.esm.min.mjs");
for (const f of ["inter-latin-wght-normal", "inter-latin-ext-wght-normal", "inter-cyrillic-wght-normal", "inter-cyrillic-ext-wght-normal"])
  cpSync(`${nm}@fontsource-variable/inter/files/${f}.woff2`, `www/fonts/${f}.woff2`);
for (const f of ["lora-latin-wght-normal", "lora-latin-ext-wght-normal", "lora-cyrillic-wght-normal", "lora-cyrillic-ext-wght-normal"])
  cpSync(`${nm}@fontsource-variable/lora/files/${f}.woff2`, `www/fonts/${f}.woff2`);
await build({
  stdin: { contents: 'export { default } from "@anthropic-ai/sdk";', resolveDir: process.cwd() },
  bundle: true, format: "esm", platform: "browser", minify: true, outfile: v + "anthropic.mjs",
});
await build({
  stdin: { contents: 'export { createClient } from "@supabase/supabase-js";', resolveDir: process.cwd() },
  bundle: true, format: "esm", platform: "browser", minify: true, outfile: v + "supabase.mjs",
});
console.log("vendored");
