/* Builds the one-page teacher manual.  node docs/manual/make_pdf.js   (run tests/e2e-test.js first: it makes the screenshots) */
const path = require("path"), fs = require("fs");
const NM = process.env.TSV_NODE_MODULES || "C:/Users/chowz/AppData/Local/hermes/foonyew/work/typing-games/typing-game-digitalmonster/tests/node_modules";
const { chromium } = require(path.join(NM, "playwright"));
const SHOTS = path.join(__dirname, "..", "..", "tests", "shots");
const COPY = { "shot-console.png": "test-teacher-monitor.png", "shot-menu.png": "test-student-menu.png", "shot-line.png": "test-line-c.png" };
(async () => {
  for (const k in COPY) fs.copyFileSync(path.join(SHOTS, COPY[k]), path.join(__dirname, k));
  const b = await chromium.launch(), p = await b.newPage();
  await p.goto("file:///" + path.join(__dirname, "manual.html").replace(/\\/g, "/"));
  const out = path.join(__dirname, "typing-survival-teacher-manual.pdf");
  await p.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
  await p.setViewportSize({ width: 794, height: 1123 });
  await p.screenshot({ path: path.join(__dirname, "page1.png"), fullPage: true });
  await b.close();
  console.log(out);
})();
