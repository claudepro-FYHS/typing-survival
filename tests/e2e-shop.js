/* Shop end to end: real pages + the real backend code (Code.gs run in Node with fake Google services).
 *   node tests/e2e-shop.js                                                   */
const path = require("path"), fs = require("fs"), assert = require("assert");
const NM = process.env.TSV_NODE_MODULES || "C:/Users/chowz/AppData/Local/hermes/foonyew/work/typing-games/typing-game-digitalmonster/tests/node_modules";
const need = (m) => require(path.join(NM, m));
const express = need("express"), { ExpressPeerServer } = need("peer"), { chromium } = need("playwright");
const { makeEnv } = require("./mockgas.js");
const ROOT = path.join(__dirname, ".."), WEB = 8132, PEER = 9012, SHOTS = path.join(__dirname, "shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms) {
  const end = Date.now() + (ms || 15000);
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error("timed out: " + what); await sleep(60); }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const env = makeEnv(), ctx = env.ctx;
  ctx.setup();
  env.sheets.Settings.data.find((r) => r[0] === "GoogleClientId")[1] = "cid";
  env.sheets.Teachers.data.push(["teacher@foonyew.edu.my", ""]);
  const app = express();
  app.use(express.text({ type: "*/*" }));
  app.post("/api", (q, r) => r.type("json").send(ctx.doPost({ postData: { contents: q.body } }).content));
  app.get("/config.js", (q, r) => r.type("js").send(`window.TS_CONFIG={APPS_SCRIPT_URL:"",PEER_SERVER:{host:"127.0.0.1",port:${PEER},path:"/peer",secure:false}};window.APP_VERSION="test";`));
  app.use(express.static(ROOT));
  const web = app.listen(WEB, "127.0.0.1");
  const papp = express(), pserver = papp.listen(PEER, "127.0.0.1");
  papp.use("/peer", ExpressPeerServer(pserver, { path: "/" }));

  const browser = await chromium.launch(), errors = [];
  async function open(email) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await c.newPage();
    page.on("pageerror", (e) => errors.push(email + ": " + e.message));
    await page.addInitScript((email) => {
      window.__TSV_FAKE_EMAIL = email;
      window.__TSV_FAKE_API = (a, b) => fetch("/api", { method: "POST", body: JSON.stringify(b) }).then((r) => r.json());
    }, email);
    await page.goto(`http://127.0.0.1:${WEB}/index.html`);
    return page;
  }
  const coinsOnMenu = (page) => page.evaluate("(document.querySelector('#acct .coins') || {}).textContent || ''");
  const card = (page, name) => page.locator(".sc-card", { has: page.locator("b", { hasText: name }) });
  const G = (page, expr) => page.evaluate("(() => { const G = __TSV.S.G, E = TSEngine, S = __TSV.S, P = G && G.players[0]; return " + expr + "; })()");
  let step = 0; const ok = (m) => console.log("ok  " + ++step + ". " + m);

  try {
    /* a student signs in, fills in the class, gets a gift */
    const kid = await open("kid@foonyew.edu.my");
    await kid.click("#btn-fake-login");
    await kid.waitForSelector("#pf-name");                    // a new school account goes straight to the class form
    await kid.fill("#pf-name", "林小明"); await kid.selectOption("#pf-grade", "J2"); await kid.fill("#pf-no", "3"); await kid.fill("#pf-seat", "12");
    await kid.click("#btn-profile-save");
    await until(async () => (await coinsOnMenu(kid)) === "0", "menu shows 0 coins");
    await kid.click("#btn-shop");
    assert.ok(await card(kid, "醫護兵").locator("button").isDisabled(), "cannot buy with 0 coins");
    assert.ok(/還差 300/.test(await card(kid, "醫護兵").locator("button").textContent()));
    assert.strictEqual(await card(kid, "學生").locator("button").textContent(), "使用中");
    env.sheets.CoinGifts.data.push(["J203", 500, "打字比賽第一名", ""]);
    await kid.reload();
    await until(async () => (await coinsOnMenu(kid)) === "500", "gift arrives after reload");
    assert.ok(/老師送你 500 金幣.*打字比賽第一名/.test(await kid.textContent("#gift-tip")));
    await kid.screenshot({ path: path.join(SHOTS, "shop-menu-gift.png") });
    ok("student: class filled in, 0 coins, teacher's 500-coin gift shows on the next visit");

    /* buy and use */
    await kid.click("#btn-shop");
    await card(kid, "醫護兵").locator("button").click();
    assert.ok(/確定用 300 金幣買/.test(await card(kid, "醫護兵").locator("button").textContent()), "asks first");
    await card(kid, "醫護兵").locator("button").click();
    await until(async () => (await card(kid, "醫護兵").locator("button").textContent()) === "使用", "bought");
    assert.ok(/200/.test(await kid.textContent("#shop-coins")));
    await card(kid, "醫護兵").locator("button").click();
    await until(async () => (await card(kid, "醫護兵").locator("button").textContent()) === "使用中", "using the medic");
    await kid.click('#shop-tabs button[data-tab="skin"]');
    assert.ok(/先擁有「爆破手」/.test(await card(kid, "沙漠迷彩").locator("button").textContent()));
    assert.ok(/累計救起隊友 100 次/.test(await card(kid, "救援英雄").locator("button").textContent()));
    await card(kid, "粉紅制服").locator("button").click(); await card(kid, "粉紅制服").locator("button").click();
    await until(async () => (await card(kid, "粉紅制服").locator("button").textContent()) === "使用", "skin bought");
    await card(kid, "粉紅制服").locator("button").click();
    await until(async () => (await card(kid, "粉紅制服").locator("button").textContent()) === "使用中", "skin on");
    await kid.screenshot({ path: path.join(SHOTS, "shop-skins.png") });
    await kid.click('#shop-tabs button[data-tab="scene"]');
    assert.ok(/還差 130/.test(await card(kid, "雪地").locator("button").textContent()));
    await kid.screenshot({ path: path.join(SHOTS, "shop-scenes.png") });
    const row = env.sheets.Players.data.find((r) => r[0] === "kid@foonyew.edu.my");
    assert.deepStrictEqual([row[9], row[10], JSON.parse(row[11])], [120, "medic, medic.pink", { char: "medic", skin: "medic.pink", scene: "park", weapon: "keyboard" }]);
    ok("bought the medic (300) and a skin (80) with a confirm step; sheet has 120 coins left and what is in use");

    /* the game uses it; coins after a game */
    await kid.click("#btn-shop-back");
    assert.strictEqual(await coinsOnMenu(kid), "120");
    await kid.click("#btn-start");
    assert.deepStrictEqual(await G(kid, "[P.look, P.items.medkit, G.scene]"), [{ char: "medic", skin: "medic.pink", weapon: "keyboard" }, 1, "park"]);
    await G(kid, "(() => { G.t = 120; G.wave = 4; P.hits = 300; P.keys = 320; P.kills = 40; P.score = 3000; P.maxCombo = 50; P.hp = 1; E.addEnemy(G, 'normal', P.x, P.y - 40, ['qqq']); })()");
    await until(async () => (await kid.evaluate("__TSV.S.screen")) === "result", "result");
    await until(async () => /\+120 金幣/.test(await kid.textContent("#res-coins")), "coins on the result screen");
    assert.ok(/今天還有 2 場全額/.test(await kid.textContent("#res-coins")));
    await kid.screenshot({ path: path.join(SHOTS, "shop-result-coins.png") });
    await kid.click("#btn-menu");
    assert.strictEqual(await coinsOnMenu(kid), "240");
    ok("solo game: medic starts with a medkit and the pink skin; +120 coins shown and added");

    /* teacher: everything, free */
    const tea = await open("teacher@foonyew.edu.my");
    await tea.click("#btn-fake-login");
    await tea.waitForSelector("#acct .who");
    await tea.click("#btn-shop");
    assert.ok(/老師帳號：全部可用/.test(await tea.textContent("#shop-coins")));
    assert.strictEqual(await tea.locator("#shop-grid .sb.buy, #shop-grid .sb.lock").count(), 0, "nothing to buy or locked for a teacher");
    await tea.click('#shop-tabs button[data-tab="skin"]');
    assert.strictEqual(await tea.locator("#shop-grid .sb.buy, #shop-grid .sb.lock").count(), 0);
    await card(tea, "聖騎士").locator("button").click();
    await until(async () => (await card(tea, "聖騎士").locator("button").textContent()) === "使用中", "teacher skin");
    await tea.click('#shop-tabs button[data-tab="scene"]'); await card(tea, "夜晚街道").locator("button").click();
    await until(async () => (await card(tea, "夜晚街道").locator("button").textContent()) === "使用中", "teacher scene");
    await tea.click('#shop-tabs button[data-tab="weapon"]'); await card(tea, "魔法杖").locator("button").click();
    await until(async () => (await card(tea, "魔法杖").locator("button").textContent()) === "使用中", "teacher weapon");
    await tea.screenshot({ path: path.join(SHOTS, "shop-weapons-teacher.png") });
    ok("teacher: every item usable, nothing charged");

    /* co-op: everyone sees everyone's look; the host's scene */
    await tea.click("#btn-shop-back"); await tea.click("#btn-multi"); await tea.click("#btn-mp-create");
    const code = await until(async () => { const t = await tea.textContent("#mp-code"); return t && t.length === 5 ? t : ""; }, "room code");
    await kid.click("#btn-multi"); await kid.fill("#mp-code-in", code); await kid.click("#btn-mp-join");
    await until(() => tea.evaluate("document.querySelectorAll('.mp-p:not(.empty)').length === 2"), "2 in lobby");
    assert.ok(/醫護兵/.test(await tea.textContent("#mp-players")) && /盾衛/.test(await kid.textContent("#mp-players")), "lobby names the characters");
    await tea.click("#btn-mp-start");
    await until(async () => (await kid.evaluate("__TSV.S.screen")) === "game" && (await G(kid, "!!G && G.players.length === 2")), "guest in game");
    assert.deepStrictEqual(await G(kid, "[G.scene, G.players[0].look, G.players[1].look, G.players[0].maxHp, G.players[1].items.medkit]"),
      ["night", { char: "guard", skin: "guard.knight", weapon: "wand" }, { char: "medic", skin: "medic.pink", weapon: "keyboard" }, 120, 1]);
    await until(() => G(tea, "E.enemies(G).length >= 3"), "enemies", 30000);
    const w = await G(tea, "E.enemies(G)[0].word");
    await tea.keyboard.press(w[0]); await kid.keyboard.press(w[0]);
    await sleep(60);
    await kid.screenshot({ path: path.join(SHOTS, "shop-coop-night.png") });
    await G(tea, "(() => { G.t = 100; G.wave = 3; for (const p of G.players) { p.hits = 200; p.keys = 210; p.kills = 20; p.score = 2000; p.maxCombo = 30; p.hp = 1; p.shieldT = 0; E.addEnemy(G, 'normal', p.x, p.y - 40, ['qqq']); } })()");
    await until(async () => (await kid.evaluate("__TSV.S.screen")) === "result", "co-op result", 20000);
    await until(async () => /\+85 金幣/.test(await kid.textContent("#res-coins")), "co-op coins");   // (3x15 + 200/5) x 1
    assert.strictEqual(env.sheets.Scores.data.filter((r) => r[1] === "kid@foonyew.edu.my").length, 1, "only the solo game is on the leaderboard");
    ok("co-op: host's night scene, both looks and abilities on both screens, +85 coins for the guest, no leaderboard row");

    assert.deepStrictEqual(errors, [], "page errors");
    console.log("ALL " + step + " STEPS PASSED");
  } catch (err) {
    console.log("FAILED after step " + step + ": " + err.message);
    if (errors.length) console.log("page errors:", errors);
    process.exitCode = 1;
  } finally {
    await browser.close(); web.close(); pserver.close();
    setTimeout(() => process.exit(), 300);
  }
})();
