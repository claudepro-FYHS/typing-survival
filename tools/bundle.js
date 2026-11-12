/* Makes one self-contained HTML file (all scripts inlined) for sending around.
 *   node tools/bundle.js  ->  dist/打字求生.html                              */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html.replace(/<script src="([^"?]+)(\?[^"]*)?"><\/script>/g, (m, src) =>
  "<script>\n" + fs.readFileSync(path.join(root, src), "utf8").replace(/<\/script/g, "<\\/script") + "\n</script>");
// a file opened from disk cannot use Google sign-in, so the single-file build is offline + co-op only
html = html.replace(/APPS_SCRIPT_URL: "[^"]*"/, 'APPS_SCRIPT_URL: ""');
if (/<script src=/.test(html)) throw new Error("a script was not inlined");
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const out = path.join(root, "dist", "typing-survival.html");
fs.writeFileSync(out, html);
console.log(out, Math.round(html.length / 1024) + " KB");
