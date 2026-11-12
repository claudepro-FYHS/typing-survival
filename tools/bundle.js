/* Makes one self-contained HTML file (all scripts inlined) for sending around.
 *   node tools/bundle.js  ->  dist/打字求生.html                              */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html.replace(/<script src="([^"?]+)(\?[^"]*)?"><\/script>/g, (m, src) =>
  "<script>\n" + fs.readFileSync(path.join(root, src), "utf8").replace(/<\/script/g, "<\\/script") + "\n</script>");
if (/<script src=/.test(html)) throw new Error("a script was not inlined");
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const out = path.join(root, "dist", "打字求生.html");
fs.writeFileSync(out, html);
console.log(out, Math.round(html.length / 1024) + " KB");
