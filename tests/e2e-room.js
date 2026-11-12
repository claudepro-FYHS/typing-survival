/* End-to-end co-op test: 3 browsers, a local PeerJS server, real key presses.
 *   node tests/e2e-room.js
 *   TSV_PUBLIC=1 node tests/e2e-room.js     (through the public PeerJS service, as students will)
 *   TSV_URL=file:///.../dist/typing-survival.html node tests/e2e-room.js   (the single-file build)
 * Uses the Playwright / express / peer packages already installed for the
 * older typing game (set TSV_NODE_MODULES to point somewhere else).        */
const path = require("path"), fs = require("fs"), assert = require("assert");
const NM = process.env.TSV_NODE_MODULES || "C:/Users/chowz/AppData/Local/hermes/foonyew/work/typing-games/typing-game-digitalmonster/tests/node_modules";
const need = (m) => require(path.join(NM, m));
const express = need("express"), { ExpressPeerServer } = need("peer"), { chromium } = need("playwright");
const ROOT = path.join(__dirname, ".."), WEB = 8131, PEER = 9011, SHOTS = path.join(__dirname, "shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, what, ms) {
  const end = Date.now() + (ms || 15000);
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error("timed out: " + what); await sleep(60); }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const app = express();
  app.get("/config.js", (q, r) => r.type("js").send(`window.TS_CONFIG={APPS_SCRIPT_URL:"",PEER_SERVER:${process.env.TSV_PUBLIC ? "null" : `{host:"127.0.0.1",port:${PEER},path:"/peer",secure:false}`}};window.APP_VERSION="test";`));
  app.use(express.static(ROOT));
  const web = app.listen(WEB, "127.0.0.1");
  const papp = express(), pserver = papp.listen(PEER, "127.0.0.1");
  papp.use("/peer", ExpressPeerServer(pserver, { path: "/" }));

  const browser = await chromium.launch();
  const errors = [];
  async function open(name) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(name + ": " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(name + " console: " + m.text()); });
    await page.goto(process.env.TSV_URL || `http://127.0.0.1:${WEB}/index.html`);
    await page.click("#btn-multi");
    await page.fill("#mp-name", name);
    return page;
  }
  const G = (page, expr) => page.evaluate("(() => { const G = __TSV.S.G, E = TSEngine, S = __TSV.S; return " + expr + "; })()");
  const screen = (page) => page.evaluate("__TSV.S.screen");
  let step = 0; const ok = (m) => console.log("ok  " + ++step + ". " + m);

  try {
    /* lobby */
    const host = await open("Host");
    await host.click("#btn-mp-create");
    const code = await until(async () => { const t = await host.textContent("#mp-code"); return t && t.length === 5 ? t : ""; }, "room code");
    assert.ok(await host.isDisabled("#btn-mp-start"), "cannot start alone");
    const g1 = await open("Amy"), g2 = await open("Ben");
    await g1.fill("#mp-code-in", code.toLowerCase()); await g1.click("#btn-mp-join");
    await g2.fill("#mp-code-in", code); await g2.press("#mp-code-in", "Enter");
    for (const p of [host, g1, g2]) await until(() => p.evaluate("document.querySelectorAll('.mp-p:not(.empty)').length === 3"), "3 players listed");
    assert.ok(await g1.isHidden("#btn-mp-start"), "guests have no start button");
    await host.screenshot({ path: path.join(SHOTS, "room-lobby.png") });
    const lost = await open("Lost");
    await lost.fill("#mp-code-in", "ZZZZ9"); await lost.click("#btn-mp-join");
    await until(async () => /找不到房間/.test(await lost.textContent("#mp-msg")), "wrong code message");
    ok("room code " + code + ": host + 2 guests in the lobby, wrong code refused");

    /* start */
    await host.click("#btn-mp-start");
    for (const p of [host, g1, g2]) await until(async () => (await screen(p)) === "game" && (await G(p, "!!G && G.players.length === 3")), "game on every screen");
    assert.strictEqual(await G(g1, "S.me"), "p1"); assert.strictEqual(await G(g2, "S.me"), "p2");
    await lost.fill("#mp-code-in", code); await lost.click("#btn-mp-join");
    await until(async () => /已經開始/.test(await lost.textContent("#mp-msg")), "late joiner refused");
    await lost.close();
    ok("game started for all three; a late joiner is refused");

    /* shared health, own progress */
    await until(() => G(host, "E.enemies(G).filter(e => e.kind === 'normal').length >= 2"), "two enemies", 30000);
    const e = await G(host, "(e => ({ id: e.id, word: e.word, hp: e.hp }))(E.enemies(G).filter(e => e.kind === 'normal').sort((a, b) => b.word.length - a.word.length)[0])");
    const t0 = Date.now();
    await g1.keyboard.press(e.word[0]); await g1.keyboard.press(e.word[1]);
    await until(() => G(g1, `(x => x && E.prog(x, 'p1') === 2)(E.ent(G, ${e.id}))`), "guest sees own progress");
    const lag = Date.now() - t0;
    assert.strictEqual(await G(host, `E.ent(G, ${e.id}).hp`), e.hp - 2);
    assert.strictEqual(await G(g2, `E.prog(E.ent(G, ${e.id}), 'p2')`), 0, "another player's progress is separate");
    await g1.screenshot({ path: path.join(SHOTS, "room-game-guest.png") });
    for (const ch of e.word.slice(0, e.word.length - 2)) await g2.keyboard.press(ch);
    await until(() => G(host, `!E.ent(G, ${e.id})`), "enemy dies from combined damage");
    const sc = await G(host, "G.players.map(p => p.score)");
    assert.ok(sc[1] > 0 && sc[2] > 0 && sc[0] === 0, "both typists scored: " + sc);
    await until(() => G(g2, `!E.ent(G, ${e.id}) && G.players[2].score === ${sc[2]}`), "guest sees the kill and the score");
    ok(`"${e.word}": Amy typed 2 letters, Ben typed ${e.word.length - 2} -> dead. Scores ${sc.join("/")}. Key-to-screen on the guest: ${lag} ms for 2 keys`);

    /* host types too, and a wrong key */
    const e2 = await G(host, "(e => ({ id: e.id, word: e.word }))(E.enemies(G)[0])");
    for (const ch of e2.word) await host.keyboard.press(ch);
    await until(() => G(g1, `!E.ent(G, ${e2.id}) && G.players[0].score > 0`), "host's kill reaches guests");
    ok("host typing reaches the guests");

    /* down and revive */
    await G(host, "(() => { for (const x of E.enemies(G)) G.ents.splice(G.ents.indexOf(x), 1); G.toSpawn = 0; G.resting = true; G.rest = 9999; const P = G.players[0]; P.hp = 1; E.addEnemy(G, 'normal', P.x, P.y - 40, ['zzz']); })()");
    await until(() => G(g1, "G.players[0].down"), "host goes down", 8000);
    const d = await G(g1, "(e => ({ id: e.id, word: e.word }))(G.ents.find(e => e.kind === 'down'))");
    const keysBefore = await G(host, "G.players[0].keys");
    await host.keyboard.press(d.word[0]);
    await sleep(200);
    assert.strictEqual(await G(host, "G.players[0].keys"), keysBefore, "a downed player cannot type");
    for (const ch of "zzz") await g1.keyboard.press(ch);
    await until(() => G(host, "E.enemies(G).length === 0"), "zombie cleared");
    for (const ch of d.word) await g1.keyboard.press(ch);
    await until(() => G(g2, `E.prog(E.ent(G, ${d.id}), 'p1') === ${d.word.length}`), "first rescuer done");
    assert.ok(await G(host, "G.players[0].down"), "one rescuer of two is not enough");
    await sleep(300);
    await host.screenshot({ path: path.join(SHOTS, "room-down-host.png") });
    await g2.screenshot({ path: path.join(SHOTS, "room-down-guest.png") });
    for (const ch of d.word) await g2.keyboard.press(ch);
    await until(() => G(g1, "!G.players[0].down && G.players[0].hp === 50"), "revived");
    ok(`host went down; rescue word "${d.word}" typed by both teammates -> revived with 50 hp`);

    /* a guest leaves mid-game */
    await g2.close();
    await until(() => G(host, "G.players[2].left"), "host notices the guest leaving", 20000);
    await until(() => G(g1, "G.players[2].left"), "other guest sees it");
    ok("Ben closed the tab: marked as left, game goes on");

    /* everyone down -> team result */
    await G(host, "(() => { for (const P of E.standing(G)) { P.hp = 1; P.shieldT = 0; E.addEnemy(G, 'normal', P.x, P.y - 40, ['qqq']); } })()");
    for (const p of [host, g1]) await until(async () => (await screen(p)) === "result", "result screen", 20000);
    assert.strictEqual(await g1.evaluate("document.querySelectorAll('#res-team .tr:not(.th)').length"), 3);
    assert.ok(/不進排行榜/.test(await host.textContent("#res-upload")));
    await g1.screenshot({ path: path.join(SHOTS, "room-result.png") });
    ok("all down: both remaining players get the team result table");

    /* back to the room and play again */
    await host.click("#btn-again");
    await until(() => host.evaluate("document.querySelectorAll('.mp-p:not(.empty)').length === 2"), "lobby with 2");
    await g1.click("#btn-again");
    await until(() => g1.evaluate("document.querySelectorAll('.mp-p:not(.empty)').length === 2"), "guest lobby with 2");
    await host.click("#btn-mp-start");
    for (const p of [host, g1]) await until(async () => (await screen(p)) === "game" && (await G(p, "!!G && G.players.length === 2 && G.t < 5")), "second game");
    ok("back to the room, second game starts with 2 players");

    /* host leaves -> guest is told */
    await host.keyboard.press("Escape"); await host.click("#btn-quit");
    await until(async () => (await screen(g1)) === "room" && /房主關閉了房間/.test(await g1.textContent("#mp-msg")), "guest told the room closed");
    assert.strictEqual(await screen(host), "menu");
    ok("host left: guest is sent back with a message");

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
