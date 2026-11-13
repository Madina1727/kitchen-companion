// Gives every app file a version stamp in index.html (import map + CSS links) so browsers never mix old and new files.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const v = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const files = ["js/" , "js/views/"].flatMap((d) => readdirSync("www/" + d).filter((f) => f.endsWith(".js")).map((f) => "/" + d + f));
const map = { imports: Object.fromEntries(files.map((f) => [f, `${f}?v=${v}`])) };
let html = readFileSync("www/index.html", "utf8");
html = html.replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, "");
html = html.replace(/(href="css\/(?:app|design)\.css)(\?v=\d+)?"/g, `$1?v=${v}"`);
html = html.replace(/<script type="module" src="js\/app\.js(\?v=\d+)?"><\/script>/, `<script type="importmap">${JSON.stringify(map)}</script>\n  <script type="module" src="js/app.js?v=${v}"></script>`);
writeFileSync("www/index.html", html);
console.log("stamped", v, files.length, "modules");
