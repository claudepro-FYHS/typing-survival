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
    await until(async () => /林小明/.test(await tea.textContent(".tc-table")), "teacher sees the student", 12000);
    assert.ok(/J203/.test(await tea.textContent(".tc-table")) && /考試中 \d:\d\d/.test(await tea.textContent(".tc-table")));
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
    assert.ok(/^38\s*分$/.test((await kid.textContent("#res-score")).trim()), await kid.textContent("#res-score"));   // 50 presses over the whole minute = 10 WPM x 96% = net 9.6
    ok("leaving the window ends the attempt at once and scores it over the whole time");

    /* 5. teacher: both attempts, one more attempt, close, download */
    await until(async () => /切換視窗/.test(await tea.textContent(".tc-table")), "teacher sees the left-page attempt", 12000);
    const row = tea.locator(".tc-row", { hasText: "林小明" });
    assert.ok(/考完/.test(await row.textContent()) && (await row.locator(".best").textContent()) === "80");
    await row.locator("button[data-extra]").click();
    await until(async () => /還可再考/.test(await row.textContent()), "extra attempt shows");
    await tea.screenshot({ path: path.join(SHOTS, "test-teacher-monitor.png") });
    await tea.click("#btn-tc-csv");
    const csv = await tea.evaluate("TSTest.T.lastCsv");
    assert.ok(csv.charCodeAt(0) === 0xfeff && /"J203","12","林小明","kid@foonyew.edu.my","2","80","30","30","100","80","38（切換視窗）"/.test(csv), csv);
    await tea.click("#btn-tc-toggle");
    await until(async () => /已關閉/.test(await tea.textContent(".tc-meta")), "closed");
    await kid.click("#btn-menu");
    await until(async () => /目前沒有開放給你班級的測驗/.test(await kid.textContent("#ts-info")), "student sees no test");
    ok("teacher: scores per attempt, 加考 1 次, Excel download, closing the test");

    /* 6. S2: a subject test = lines of C */
    await tea.click("#btn-tc-list"); await tea.waitForSelector("#tc-classes");
    assert.ok(/AB-123/.test(await tea.textContent(".tc-list")) && /已關閉/.test(await tea.textContent(".tc-list")));
    await tea.screenshot({ path: path.join(SHOTS, "test-teacher-list.png") });
    await tea.fill("#tc-classes", "S2"); await tea.selectOption("#tc-kind", "subject"); await tea.fill("#tc-min", "1"); await tea.fill("#tc-code", "C-777");
    await tea.click("#btn-tc-new");
    await until(async () => (await tea.locator(".code.big").count()) && (await tea.textContent(".code.big")) === "C-777", "second test");
    const s2 = await student("s2@foonyew.edu.my", "陳大文", "S2S", 3, 8);
    await s2.click("#btn-test");
    await until(async () => /C 程式測驗 · 1 分鐘/.test(await s2.textContent("#ts-info")), "C test info");
    assert.ok(/C 程式/.test(await s2.textContent("#ts-self")), "the self check offers C lines to S2");
    await s2.fill("#ts-code", "c777"); await s2.click("#btn-ts-go");
    await until(async () => (await scr(s2)) === "game" && (await G(s2, "!!G && G.ents.length === 3 && !!P.target")), "line test running");
    const line = await G(s2, "E.ent(G, P.target).word");
    await s2.keyboard.type(line.slice(0, Math.ceil(line.length / 2)));
    await sleep(1500);
    await s2.screenshot({ path: path.join(SHOTS, "test-line-c.png") });
    await s2.keyboard.type(line.slice(Math.ceil(line.length / 2)));
    const want = line.split("").reduce((n, ch) => n + (/[A-Z~!@#$%^&*()_+{}|:"<>?]/.test(ch) ? 2 : 1), 0);
    assert.deepStrictEqual(await G(s2, "[G.test.kind, P.tDone, P.tKeys, P.errors]"), ["line", want, want, 0], "typed exactly, Shift characters count 2: " + line);
    await G(s2, "(P.tDone = 150, P.tGood = 150, P.tKeys = 150, 1)");            // 30 presses-WPM for one minute = full marks for a subject test
    await runOut(s2, 60);
    await until(async () => (await scr(s2)) === "result" && /測驗完成/.test(await s2.textContent("#res-title")), "C result", 20000);
    assert.ok(/^100\s*分$/.test((await s2.textContent("#res-score")).trim()) && /淨 30/.test(await s2.textContent("#res-grid")));
    ok("S2 subject test: whole C lines typed exactly; net 30 = 100 marks");

    /* 7. self check -> level, leaderboard, weak keys, practice */
    await kid.click("#ts-self button[data-k=word]");
    await until(async () => (await scr(kid)) === "game" && (await G(kid, "!!G && G.ents.length === 4")), "self check running");
    assert.strictEqual(await G(kid, "G.test.seconds"), 300);
    for (let i = 0; i < 6; i++) { const t = await G(kid, "(E.ent(G, P.target) || G.ents[0]).word"); await kid.keyboard.type(t); await until(() => G(kid, "G.ents.length === 4 && !P.target"), "next word"); }
    await kid.keyboard.type("qqqq");                                             // wrong keys (no word starts with q among the four, or it does and they still count)
    await G(kid, "(P.tDone = 1010, P.tGood = 1010, P.tKeys = 1030, 1)");        // 40.4 WPM x 98% = net 39.6 -> level 7
    await runOut(kid, 300);
    await until(async () => (await scr(kid)) === "result" && /檢定完成/.test(await kid.textContent("#res-title")), "self result", 20000);
    assert.ok(/39\.6/.test(await kid.textContent("#res-score")) && /7 級/.test(await kid.textContent("#res-grid")));
    assert.ok(/最佳紀錄/.test(await kid.textContent("#res-upload")) && /解鎖成就造型「打字大師」/.test(await kid.textContent("#res-coins")));
    await kid.screenshot({ path: path.join(SHOTS, "test-self-result.png") });
    await kid.click("#btn-menu"); await kid.click("#btn-ts-back"); await kid.click("#btn-board");
    await kid.click('#lb-mode button[data-v="test"]');
    await until(async () => /林小明/.test(await kid.textContent("#lb-body")), "test leaderboard");
    assert.ok(/39\.6/.test(await kid.textContent("#lb-body")) && /7 級/.test(await kid.textContent("#lb-body")));
    await kid.screenshot({ path: path.join(SHOTS, "test-leaderboard.png") });
    await kid.click("#btn-board-back");
    ok("self check: level 7 unlocks the skin, and the 檢定 leaderboard lists it");

    env.sheets.KeyStats.data.find((r) => r[0] === "kid@foonyew.edu.my")[5] = JSON.stringify({ a: [200, 4, 40000, 190], e: [220, 6, 41000, 200], p: [40, 14, 30000, 40], q: [10, 9, 14000, 10], t: [150, 5, 30000, 140], s: [120, 4, 25000, 110], o: [130, 3, 26000, 120], n: [110, 3, 22000, 100], "(": [8, 6, 9000, 8], ";": [30, 2, 9000, 28] });
    await kid.click("#btn-test"); await kid.click("#ts-keys");
    await until(async () => /你最常打錯/.test(await kid.textContent("#keys-body")), "weak keys");
    assert.ok(/弱點練習（2 分鐘）：q \( p/.test(await kid.textContent("#btn-keys-practice")), await kid.textContent("#btn-keys-practice"));
    await kid.screenshot({ path: path.join(SHOTS, "test-weak-keys.png") });
    await kid.click("#btn-keys-practice");
    await until(async () => (await scr(kid)) === "game" && (await G(kid, "!!G && G.ents.length === 4")), "practice running");
    assert.ok(await G(kid, "G.test.seconds === 120 && G.ents.every((e) => /[qp]/.test(e.word))"), "practice words contain the weak letters");
    const pw = await G(kid, "G.ents[0].word"); await kid.keyboard.type(pw);
    await runOut(kid, 0);
    await until(async () => (await scr(kid)) === "result" && /練習完成/.test(await kid.textContent("#res-title")), "practice result", 20000);
    await kid.click("#btn-menu");
    await until(async () => (await scr(kid)) === "keys", "back to weak keys");
    await tea.click('#tc-tabs button[data-t="keys"]'); await tea.fill("#tk-cls", "j2"); await tea.click("#btn-tk");
    await until(async () => /1 位學生的資料/.test(await tea.textContent("#tk-out")) && /全班最常打錯/.test(await tea.textContent("#tk-out")), "class weak keys");
    await tea.screenshot({ path: path.join(SHOTS, "test-teacher-keys.png") });
    ok("weak keys: keyboard map, 2-minute practice on the worst keys, and the class view for the teacher");

    /* 8. not signed in: a self check still works, nothing is saved */
    const guest = await open("nobody@example.com");
    await guest.click("#btn-test");
    assert.strictEqual(await guest.isVisible("#ts-graded"), false);
    await guest.click("#ts-self button[data-k=sentence]");
    await until(async () => (await scr(guest)) === "game" && (await G(guest, "!!G && G.ents.length === 3 && !!P.target")), "guest sentence check");
    await guest.keyboard.type(await G(guest, "E.ent(G, P.target).word"));
    await sleep(900);
    await guest.keyboard.type((await G(guest, "E.ent(G, P.target).word")).slice(0, 9));
    await guest.screenshot({ path: path.join(SHOTS, "test-line-sentence.png") });
    await runOut(guest, 0);
    await until(async () => (await scr(guest)) === "result" && /沒有登入/.test(await guest.textContent("#res-upload")), "guest result", 20000);
    await guest.click("#btn-menu"); await guest.click("#btn-ts-back"); await guest.click("#btn-start");
    await until(async () => (await scr(guest)) === "game" && (await G(guest, "!!G && !G.test")), "survival still starts after a test");
    assert.strictEqual(await guest.isVisible("#hpbox"), true, "the survival HUD is back");
    ok("guest: sentence check works without an account; survival is unaffected afterwards");
    console.log("ALL " + step + " STEPS PASSED");
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
