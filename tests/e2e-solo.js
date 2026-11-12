/* Solo smoke test in a real browser:  node tests/e2e-solo.js */
const path = require("path"), assert = require("assert");
const NM = process.env.TSV_NODE_MODULES || "C:/Users/chowz/AppData/Local/hermes/foonyew/work/typing-games/typing-game-digitalmonster/tests/node_modules";
const { chromium } = require(path.join(NM, "playwright"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(process.env.TSV_URL || "file:///" + path.join(__dirname, "..", "dist", "typing-survival.html").replace(/\\/g, "/"));
    assert.ok(await page.isHidden("#acct"), "no account bar offline");
    await page.keyboard.press("Enter");
    const G = (expr) => page.evaluate("(() => { const G = __TSV.S.G, E = TSEngine, P = G.players[0]; return " + expr + "; })()");
    for (let i = 0; i < 400 && !(await G("G.ents.length >= 2")); i++) await sleep(50);
    const [a, b] = await G("G.ents.slice(0, 2).map(e => ({ id: e.id, word: e.word }))");
    await page.keyboard.press(a.word[0]); await page.keyboard.press(a.word[1]);
    await page.keyboard.press(b.word[0]);                      // free mode: switch
    await page.keyboard.press(a.word[2]);                      // and back
    assert.deepStrictEqual(await G(`[E.prog(E.ent(G, ${a.id}), 'p0'), E.prog(E.ent(G, ${b.id}), 'p0'), P.errors, P.target]`), [3, 1, 0, a.id]);
    await page.keyboard.press("Escape");
    assert.strictEqual(await page.evaluate("__TSV.S.screen"), "pause");
    const t = await G("G.t"); await sleep(300);
    assert.strictEqual(await G("G.t"), t, "solo pause stops the clock");
    await page.click("#btn-resume");
    await page.screenshot({ path: path.join(__dirname, "shots", "solo-game.png") });
    await G("(() => { P.hp = 1; E.addEnemy(G, 'normal', P.x, P.y - 40, ['qqq']); })()");
    for (let i = 0; i < 200 && (await page.evaluate("__TSV.S.screen")) !== "result"; i++) await sleep(50);
    assert.strictEqual(await page.evaluate("__TSV.S.screen"), "result");
    assert.ok(await page.isVisible("#res-grid") && await page.isHidden("#res-team"));
    assert.strictEqual(await page.textContent("#btn-again"), "再玩一次");
    await page.click("#btn-again");
    assert.strictEqual(await page.evaluate("__TSV.S.screen"), "game");
    assert.deepStrictEqual(errors, []);
    console.log("SOLO OK");
  } catch (e) { console.log("FAILED: " + e.message, errors); process.exitCode = 1; }
  await browser.close();
})();
