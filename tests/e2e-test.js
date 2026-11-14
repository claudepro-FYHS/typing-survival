/* Typing test end to end: real pages + the real backend code (Code.gs in Node, with a clock we can move).
 *   node tests/e2e-test.js                                                   */
const path = require("path"), fs = require("fs"), assert = require("assert");
const NM = process.env.TSV_NODE_MODULES || "C:/Users/chowz/AppData/Local/hermes/foonyew/work/typing-games/typing-game-digitalmonster/tests/node_modules";
const need = (m) => require(path.join(NM, m));
const express = need("express"), { chromium } = need("playwright");
const { makeEnv } = require("./mockgas.js");
const ROOT = path.join(__dirname, ".."), WEB = 8133, SHOTS = path.join(__dirname, "shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms) {
  const end = Date.now() + (ms || 15000);
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error("timed out: " + what); await sleep(60); }
}
let offset = 0;                                             // the server's clock runs ahead by this much
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(Date.now() + offset); }
  static now() { return Date.now() + offset; }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const env = makeEnv({ Date: FakeDate }), ctx = env.ctx;
  ctx.setup();
  env.sheets.Settings.data.find((r) => r[0] === "GoogleClientId")[1] = "cid";
  env.sheets.Teachers.data.push(["wendy@foonyew.edu.my", ""]);
  const app = express();
  app.use(express.text({ type: "*/*" }));
  app.post("/api", (q, r) => r.type("json").send(ctx.doPost({ postData: { contents: q.body } }).content));
  app.get("/config.js", (q, r) => r.type("js").send(`window.TS_CONFIG={APPS_SCRIPT_URL:"",PEER_SERVER:null};window.APP_VERSION="test";`));
  app.use(express.static(ROOT));
  const web = app.listen(WEB, "127.0.0.1");
  const browser = await chromium.launch(), errors = [];
  async function open(email) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true }), page = await c.newPage();
    page.on("pageerror", (e) => errors.push(email + ": " + e.message));
    await page.addInitScript((email) => {
      window.__TSV_FAKE_EMAIL = email;
      window.__TSV_FAKE_API = (a, b) => fetch("/api", { method: "POST", body: JSON.stringify(b) }).then((r) => r.json());
    }, email);
    await page.goto(`http://127.0.0.1:${WEB}/index.html`);
    return page;
  }
  async function student(email, name, grade, no, seat) {
    const p = await open(email);
    await p.click("#btn-fake-login"); await p.waitForSelector("#pf-name");
    await p.fill("#pf-name", name); await p.selectOption("#pf-grade", grade); await p.fill("#pf-no", String(no)); await p.fill("#pf-seat", String(seat));
    await p.click("#btn-profile-save");
    await until(() => p.evaluate("__TSV.S.screen === 'menu'"), "menu after profile");
    return p;
  }
  const scr = (p) => p.evaluate("__TSV.S.screen");
  const G = (p, expr) => p.evaluate("(() => { const G = __TSV.S.G, E = TSEngine, P = G && G.players[0]; return " + expr + "; })()");
  // the server's clock and the page's game clock both jump to the end of the test
  async function runOut(p, secs) { offset += secs * 1000; await G(p, "(G.t = G.test.seconds - 0.3, 1)"); }
  let step = 0; const ok = (m) => console.log("ok  " + ++step + ". " + m);

  try {
    /* 1. teacher opens a test */
    const tea = await open("wendy@foonyew.edu.my");
    await tea.click("#btn-fake-login");
    await until(async () => /老師後台/.test(await tea.textContent("#btn-test")), "teacher's menu button");
    await tea.click("#btn-test"); await tea.click("#ts-teacher");
    await tea.waitForSelector("#tc-classes");
    await tea.fill("#tc-classes", "J9 班"); await tea.click("#btn-tc-new");
    await until(async () => /班級格式不對/.test(await tea.textContent("#tc-msg")), "bad class message");
    await tea.fill("#tc-classes", "j203, J204"); await tea.fill("#tc-min", "1"); await tea.fill("#tc-code", "ab-123");
    await tea.click("#btn-tc-new");
    await until(async () => (await tea.locator(".code.big").count()) && (await tea.textContent(".code.big")) === "AB-123", "monitor opens with the code");
    assert.ok(/還沒有學生加入/.test(await tea.textContent("#tc-body")));
    ok("teacher: bad class is explained; test AB-123 for J203+J204 opens straight into the live list");

    /* 2. student: code, word test */
    const kid = await student("kid@foonyew.edu.my", "林小明", "J2", 3, 12);
    await kid.reload();
    await until(async () => /有測驗開放中/.test(await kid.textContent("#btn-test")), "menu says a test is open");
    await kid.click("#btn-test");
    await until(async () => /單字測驗 · 1 分鐘 · 已用 0\/2 次/.test(await kid.textContent("#ts-info")), "test info");
    assert.ok(!(await kid.content()).includes("AB-123"), "the code is nowhere in the student's page");
    await kid.screenshot({ path: path.join(SHOTS, "test-student-menu.png") });
    await kid.fill("#ts-code", "zz-999"); await kid.click("#btn-ts-go");
    await until(async () => /代號不對/.test(await kid.textContent("#ts-msg")), "wrong code message");
    await kid.fill("#ts-code", "ab123"); await kid.click("#btn-ts-go");
    await until(async () => (await scr(kid)) === "game" && (await G(kid, "!!G && !!G.test")), "test running");
    await until(() => G(kid, "G.ents.length === 4"), "4 words");
    assert.deepStrictEqual(await G(kid, "[G.test.kind, G.test.seconds, P.maxHp]"), ["word", 60, 100]);
    const w = await G(kid, "G.ents[0].word");
    await kid.keyboard.type(w + " ");                                          // the space is ignored, not a mistake
    await kid.keyboard.press("Escape"); await kid.keyboard.press("1");
    assert.deepStrictEqual(await G(kid, "[P.tDone, P.tKeys, P.errors, " + "__TSV.S.screen" + "]"), [w.length + 1, w.length + 1, 0, "game"]);
    await sleep(400);
    await kid.screenshot({ path: path.join(SHOTS, "test-word.png") });
    await until(async () => /考試中/.test(await tea.textContent("#tc-body")), "teacher sees the student", 12000);
    assert.ok(/J203/.test(await tea.textContent(".tc-table")) && /林小明/.test(await tea.textContent(".tc-table")));
    ok("student: menu flags the test, wrong code costs nothing, word test runs (no pause, no items); teacher sees 考試中");

    /* 3. finish -> marks */
    await G(kid, "(P.tDone = 150, P.tGood = 150, P.tKeys = 150, P.tWords = 30, 1)");     // 30 WPM for one minute
    await runOut(kid, 60);
    await until(async () => (await scr(kid)) === "result" && /測驗完成/.test(await kid.textContent("#res-title")), "graded result", 20000);
    assert.ok(/^80\s*分$/.test((await kid.textContent("#res-score")).trim()), await kid.textContent("#res-score"));
    assert.ok(/還可以再考/.test(await kid.textContent("#res-upload")));
    assert.strictEqual(await kid.isVisible("#btn-again"), false);
    await kid.screenshot({ path: path.join(SHOTS, "test-result.png") });
    const res = env.sheets.TestResults.data.find((r) => r[4] === "kid@foonyew.edu.my");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(res.slice(0, 11))), ["AB-123", "J203", 12, "林小明", "kid@foonyew.edu.my", 1, 80, 30, 30, 100, "word"]);
    ok("net 30 WPM = 80 marks on the result screen and in the TestResults tab");

    /* 4. second attempt: leaves the window */
    await kid.click("#btn-menu");
    await until(async () => /已用 1\/2 次 · 目前最高 80 分/.test(await kid.textContent("#ts-info")), "used 1/2");
    await kid.fill("#ts-code", "AB-123"); await kid.keyboard.press("Enter");
    await until(async () => (await scr(kid)) === "game" && (await G(kid, "!!G && G.ents.length === 4")), "second attempt");
    await G(kid, "(P.tDone = 50, P.tGood = 50, P.tKeys = 52, P.tWords = 10, 1)");
    await kid.evaluate("window.dispatchEvent(new Event('blur'))");
    await until(async () => /切換了視窗/.test(await kid.textContent("#res-title")), "left-page result");
    assert.ok(/^40\s*分$/.test((await kid.textContent("#res-score")).trim()), "50 presses over the whole minute = 10 WPM x 96% = 9.6 net -> 38? " + (await kid.textContent("#res-score")));
    ok("leaving the window ends the attempt at once and scores it over the whole time");
  } catch (err) {
    console.log("FAILED after step " + step + ": " + err.message);
    if (errors.length) console.log("page errors:", errors);
    process.exitCode = 1;
  } finally {
    if (errors.length && !process.exitCode) { console.log("page errors:", errors); process.exitCode = 1; }
    await browser.close(); web.close();
    setTimeout(() => process.exit(), 300);
  }
})();
