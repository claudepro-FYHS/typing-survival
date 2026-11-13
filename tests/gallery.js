/* Picture sheet of every character, skin, weapon and scene:  node tests/gallery.js  -> tests/shots/gallery-*.png */
const path = require("path");
const NM = process.env.TSV_NODE_MODULES || "C:/Users/chowz/AppData/Local/hermes/foonyew/work/typing-games/typing-game-digitalmonster/tests/node_modules";
const { chromium } = require(path.join(NM, "playwright"));
(async () => {
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file:///" + path.join(__dirname, "..", "index.html").replace(/\\/g, "/"));
  await page.evaluate(() => {
    const S = window.TS_SHOP, R = window.TSRender;
    const cv = document.createElement("canvas"); cv.width = 1280; cv.height = 720; cv.id = "gal";
    cv.style.cssText = "position:fixed;left:0;top:0;z-index:99;background:#5c9f6a";
    document.body.appendChild(cv);
    const c = cv.getContext("2d"); c.fillStyle = "#5c9f6a"; c.fillRect(0, 0, 1280, 720);
    const items = S.chars.map((x) => ({ n: x.name, sel: { char: x.id } })).concat(S.skins.map((x) => ({ n: x.name, sel: { char: x.char, skin: x.id } })))
      .concat(S.weapons.map((x) => ({ n: x.name, sel: { char: "student", weapon: x.id } })));
    items.forEach((it, i) => {
      const x = 70 + (i % 12) * 100, y = 90 + Math.floor(i / 12) * 150;
      c.save(); c.translate(x, y); c.scale(1.6, 1.6); R.avatar(c, 0, 0, S.lookOf(it.sel), 1.3, { aim: -0.2, still: true }); c.restore();
      c.font = '700 14px "Microsoft JhengHei", sans-serif'; c.textAlign = "center"; c.fillStyle = "#10201a"; c.fillText(it.n, x, y + 62);
    });
  });
  await page.locator("#gal").screenshot({ path: path.join(__dirname, "shots", "gallery-looks.png") });
  for (const scene of ["school", "night", "snow"]) {
    await page.evaluate((scene) => {
      const E = window.TSEngine, S = window.TS_SHOP, R = window.TSRender;
      const players = [{ pid: "p0", name: "A", look: { char: "guard", skin: "guard.knight", weapon: "laser" } }, { pid: "p1", name: "小美", look: { char: "lucky", skin: "lucky.bunny", weapon: "water" } }, { pid: "p2", name: "阿明", look: { char: "froster", skin: "froster.aurora", weapon: "wand" } }];
      const G = E.createGame({ mode: "free", diff: "normal", seed: 4, scene, words: window.TS_WORDS.general.split(" "), topic: [], players });
      for (let i = 0; i < 60 * 16; i++) E.step(G, 1 / 60);
      const evs = [];
      for (const P of G.players) { const e = G.ents[P.i]; G.ev.length = 0; E.key(G, e.word[0], P.pid); evs.push(...G.ev); }
      const cv = document.getElementById("gal"), c = cv.getContext("2d");
      R.reset(); R.draw(c, G, 5.0, evs, "p0"); R.draw(c, G, 5.05, [], "p0");
    }, scene);
    await page.locator("#gal").screenshot({ path: path.join(__dirname, "shots", "gallery-" + scene + ".png") });
  }
  console.log(errors.length ? "ERRORS " + errors.join(" | ") : "GALLERY OK");
  await browser.close();
})();
