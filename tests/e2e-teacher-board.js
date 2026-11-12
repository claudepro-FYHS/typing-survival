/* Teacher's leaderboard picker in a real browser (backend faked):  node tests/e2e-teacher-board.js */
const path = require("path"), assert = require("assert");
const NM = process.env.TSV_NODE_MODULES || "C:/Users/chowz/AppData/Local/hermes/foonyew/work/typing-games/typing-game-digitalmonster/tests/node_modules";
const { chromium } = require(path.join(NM, "playwright"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__calls = [];
    const player = { school: true, teacher: true, name: "曹老師", nick: "", cls: "STAFF", seat: 0, grade: "", needsProfile: false };
    window.__TSV_FAKE_API = async (action, b) => {
      window.__calls.push(Object.assign({}, b));
      if (action === "config") return { ok: true, clientId: "cid", domain: "foonyew.edu.my", year: "2026", grades: ["J1", "J2"], maxClass: 20, maxSeat: 60, allowOthers: true };
      if (action === "login") return { ok: true, token: "tok", email: "t@foonyew.edu.my", player };
      if (action === "me") return { ok: false, error: "session_expired" };
      if (action === "classes") return { ok: true, year: "2026", classes: [{ cls: "J203", n: 31 }, { cls: "J207", n: 28 }] };
      if (action === "leaderboard") return { ok: true, scope: b.scope, group: b.group || b.scope, year: "2026", total: 1, me: null,
        rows: [{ rank: 1, name: "學生 " + (b.group || b.scope), cls: b.group && b.group.length > 2 ? b.group : "J203", score: 4200, wave: 5, wpm: 38, acc: 96, me: false }] };
      return { ok: false, error: "unknown_action" };
    };
  });
  try {
    await page.goto("file:///" + path.join(__dirname, "..", "index.html").replace(/\\/g, "/"));
    await page.click("#btn-fake-login");
    await page.waitForSelector("#acct .who");
    assert.ok(/老師/.test(await page.textContent("#acct .who")));
    await page.click("#btn-board");
    assert.deepStrictEqual(await page.$$eval("#lb-scope button", (b) => b.map((x) => x.textContent)), ["班級", "年段", "全校", "公開榜"]);
    await page.click('#lb-scope button[data-v="class"]');
    await page.waitForSelector("#lb-group");
    assert.deepStrictEqual(await page.$$eval("#lb-group option", (o) => o.map((x) => x.textContent)), ["J203（31 人）", "J207（28 人）"]);
    await page.waitForFunction(() => /學生 J203/.test(document.querySelector("#lb-body").textContent));
    await page.selectOption("#lb-group", "J207");
    await page.waitForFunction(() => /學生 J207/.test(document.querySelector("#lb-body").textContent));
    assert.ok(/J207/.test(await page.textContent("#lb-foot")));
    await page.screenshot({ path: path.join(__dirname, "shots", "teacher-board.png") });
    await page.click('#lb-scope button[data-v="grade"]');
    await page.waitForFunction(() => document.querySelectorAll("#lb-group option").length === 6);
    await page.selectOption("#lb-group", "S1");
    await page.waitForFunction(() => /學生 S1/.test(document.querySelector("#lb-body").textContent));
    await page.click('#lb-scope button[data-v="school"]');
    await sleep(200);
    assert.ok(await page.isHidden("#lb-pick"), "no picker on the school board");
    const last = await page.evaluate("window.__calls.filter(c => c.action === 'leaderboard').map(c => c.scope + ':' + (c.group || ''))");
    assert.deepStrictEqual(last, ["school:", "class:J203", "class:J207", "grade:J1", "grade:S1", "school:"]);
    assert.deepStrictEqual(errors, []);
    console.log("TEACHER BOARD OK");
  } catch (e) { console.log("FAILED: " + e.message, errors); process.exitCode = 1; }
  await browser.close();
})();
