/* node tests/backend.test.js — runs apps-script/Code.gs in Node with fake Google services */
const assert = require("assert");
const { makeEnv } = require("./mockgas.js");
const env = makeEnv(), ctx = env.ctx;
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).content);
const setting = (k, v) => { const r = env.sheets.Settings.data.find((x) => x[0] === k); if (r) r[1] = v; else env.sheets.Settings.data.push([k, v, ""]); };
const login = (email) => post({ action: "login", idToken: "fake:" + email });
const run = (o) => Object.assign({ action: "submitScore", mode: "free", diff: "normal", score: 3000, wave: 4, kills: 40, hits: 300, keys: 320, time: 120, maxCombo: 50, input: "kb" }, o);
const board = (token, scope, extra) => post(Object.assign({ action: "leaderboard", token, scope, mode: "free", diff: "normal" }, extra));

ctx.setup();
setting("GoogleClientId", "cid");
setting("SchoolYear", "2026");
env.sheets.Teachers.data.push(["teacher@foonyew.edu.my", ""]);

test("config and class codes", () => {
  const c = post({ action: "config" });
  assert.strictEqual(c.clientId, "cid");
  assert.ok(c.grades.includes("S1AC"));
  assert.strictEqual(ctx.classCode_("J2", 3), "J203");
  assert.strictEqual(ctx.classCode_("S1AC", 1), "S1AC1");
  assert.strictEqual(ctx.gradeOf_("S1AC1"), "S1");
});

let A, B, C, T, P;
test("school student must fill class + seat once; then it is locked", () => {
  A = login("a@foonyew.edu.my");
  assert.ok(A.ok && A.token);
  assert.strictEqual(A.player.needsProfile, true);
  assert.strictEqual(A.player.name, "G a");
  assert.strictEqual(post(run({ token: A.token })).error, "no_profile");
  assert.strictEqual(post({ action: "saveProfile", token: A.token, name: "王小明", grade: "J2", classNo: 99, seat: 5 }).error, "bad_class");
  assert.strictEqual(post({ action: "saveProfile", token: A.token, name: "王小明", grade: "X9", classNo: 3, seat: 5 }).error, "bad_class");
  assert.strictEqual(post({ action: "saveProfile", token: A.token, name: "王小明", grade: "J2", classNo: 3, seat: 0 }).error, "bad_seat");
  const r = post({ action: "saveProfile", token: A.token, name: "王小明", grade: "J2", classNo: 3, seat: 5 });
  assert.strictEqual(r.player.cls, "J203");
  assert.strictEqual(r.player.grade, "J2");
  assert.strictEqual(r.player.needsProfile, false);
  assert.strictEqual(post({ action: "saveProfile", token: A.token, name: "x", grade: "J3", classNo: 1, seat: 1 }).error, "locked");
  assert.strictEqual(post({ action: "me", token: A.token }).player.cls, "J203");
});

test("other accounts: nickname, bad words refused; teacher needs nothing", () => {
  P = login("kid@gmail.com");
  assert.strictEqual(P.player.school, false);
  assert.strictEqual(post({ action: "saveProfile", token: P.token, nick: "fuck" }).error, "bad_nick");
  assert.strictEqual(post({ action: "saveProfile", token: P.token, nick: "TypeKing" }).player.nick, "TypeKing");
  T = login("teacher@foonyew.edu.my");
  assert.strictEqual(T.player.teacher, true);
  assert.strictEqual(T.player.needsProfile, false);
  setting("AllowOtherAccounts", "NO");
  assert.strictEqual(login("x@gmail.com").error, "not_school");
  setting("AllowOtherAccounts", "YES");
  assert.strictEqual(post({ action: "me", token: "junk.junk" }).error, "session_expired");
  assert.strictEqual(login("nope").ok, true); // mock accepts any fake: token; real Google rejects bad ones
  assert.strictEqual(post({ action: "login", idToken: "real-but-wrong" }).error, "bad_token");
});

test("scores: best per mode+difficulty, fakes rejected, touch not ranked", () => {
  let r = post(run({ token: A.token }));
  assert.deepStrictEqual([r.ok, r.best, r.bestScore], [true, true, 3000]);
  r = post(run({ token: A.token, score: 2000 }));
  assert.deepStrictEqual([r.best, r.bestScore], [false, 3000]);
  r = post(run({ token: A.token, score: 4000 }));
  assert.deepStrictEqual([r.best, r.prev], [true, 3000]);
  assert.strictEqual(env.sheets.Scores.data.length, 2, "one row per player+mode+difficulty");
  assert.strictEqual(post(run({ token: A.token, score: 9999999 })).error, "rejected");
  assert.strictEqual(post(run({ token: A.token, hits: 5000, keys: 5000, time: 60 })).error, "rejected");
  assert.strictEqual(post(run({ token: A.token, hits: 400, keys: 300 })).error, "rejected");
  assert.strictEqual(post(run({ token: A.token, mode: "x" })).error, "bad_request");
  r = post(run({ token: A.token, score: 9000, hits: 400, keys: 400, input: "touch" }));
  assert.deepStrictEqual([r.ok, r.ranked], [true, false]);
  post(run({ token: A.token, diff: "hard", score: 1000 }));
  assert.strictEqual(env.sheets.Scores.data.length, 3);
  assert.strictEqual(env.sheets.Players.data.find((x) => x[0] === "a@foonyew.edu.my")[8], 5, "games counted (rejected ones are not)" );
});

test("leaderboards: class / grade / school / public", () => {
  B = login("b@foonyew.edu.my"); post({ action: "saveProfile", token: B.token, name: "李美", grade: "J2", classNo: 7, seat: 1 });
  C = login("c@foonyew.edu.my"); post({ action: "saveProfile", token: C.token, name: "陳強", grade: "S1AC", classNo: 1, seat: 9 });
  post(run({ token: B.token, score: 5000 }));
  post(run({ token: C.token, score: 2500 }));
  post(run({ token: T.token, score: 6000 }));
  post(run({ token: P.token, score: 7000 }));
  let r = board(A.token, "class");
  assert.deepStrictEqual(r.rows.map((x) => x.name), ["王小明"]);
  assert.strictEqual(r.group, "J203");
  r = board(A.token, "grade");
  assert.deepStrictEqual(r.rows.map((x) => [x.rank, x.name, x.cls, x.score]), [[1, "李美", "J207", 5000], [2, "王小明", "J203", 4000]]);
  assert.strictEqual(r.me.rank, 2);
  r = board(A.token, "school");
  assert.deepStrictEqual(r.rows.map((x) => x.name), ["G teacher", "李美", "王小明", "陳強"]);
  assert.strictEqual(r.rows[0].cls, "老師");
  r = board("", "public");
  assert.deepStrictEqual(r.rows.map((x) => [x.name, x.score]), [["TypeKing", 7000]]);
  assert.ok(!JSON.stringify(board(A.token, "school")).includes("@"), "no email addresses leave the server");
  assert.strictEqual(board("", "school").error, "school_only", "real names only for school accounts");
  assert.strictEqual(board(P.token, "grade").error, "school_only");
  // "all": one row per player, their best in any mode and difficulty, and which one it was
  post(run({ token: A.token, mode: "classic", diff: "hard", score: 9000, hits: 900, keys: 950, time: 400, wave: 9, kills: 120 }));
  r = board(A.token, "class", { mode: "all" });
  assert.deepStrictEqual(r.rows.map((x) => [x.name, x.score, x.mode, x.diff]), [["王小明", 9000, "classic", "hard"]]);
  r = board(A.token, "grade", { mode: "all", diff: "easy" });
  assert.deepStrictEqual(r.rows.map((x) => [x.name, x.score, x.mode, x.diff]), [["王小明", 9000, "classic", "hard"], ["李美", 5000, "free", "normal"]]);
  assert.strictEqual(board(A.token, "class").rows[0].score, 4000, "the per-mode board is unchanged");
  assert.strictEqual(board(A.token, "class", { mode: "nope" }).error, "bad_request");
  post(run({ token: A.token, mode: "free", diff: "easy", score: 9500, hits: 900, keys: 950, time: 400, wave: 9, kills: 120 }));
  assert.deepStrictEqual(board(A.token, "class", { mode: "all" }).rows.map((x) => [x.score, x.diff]), [[9500, "easy"]], "a new best shows at once");
  // teachers have no class: they pick any class or grade to look at
  assert.strictEqual(board(T.token, "class").error, "bad_group");
  assert.strictEqual(board(T.token, "class", { group: "J2; DROP" }).error, "bad_group");
  r = board(T.token, "class", { group: "j207" });
  assert.deepStrictEqual([r.group, r.rows.map((x) => x.name), r.me], ["J207", ["李美"], null]);
  r = board(T.token, "grade", { group: "J2" });
  assert.deepStrictEqual(r.rows.map((x) => x.name), ["李美", "王小明"]);
  assert.strictEqual(board(T.token, "grade", { group: "S1" }).rows.length, 1);
  assert.strictEqual(board(A.token, "class", { group: "J207" }).group, "J203", "a student cannot pick another class");
  const cl = post({ action: "classes", token: T.token });
  assert.deepStrictEqual(cl.classes.map((c) => c.cls + ":" + c.n), ["J203:1", "J207:1", "S1AC1:1"]);
  assert.strictEqual(post({ action: "classes", token: A.token }).error, "teacher_only");
  assert.strictEqual(board(P.token, "public").me.rank, 1);
  assert.strictEqual(board(A.token, "school", { diff: "hard" }).rows.length, 1);
  // a new best shows up at once (cache is cleared for the player's own boards)
  post(run({ token: A.token, score: 5500, hits: 400, keys: 410 }));
  assert.strictEqual(board(A.token, "grade").rows[0].name, "王小明");
});

test("new school year: boards start empty, class must be picked again, old rows stay", () => {
  setting("SchoolYear", "2027");
  for (const k of Object.keys(env)) void k;
  const me = post({ action: "me", token: A.token });
  assert.strictEqual(me.player.needsProfile, true);
  assert.strictEqual(me.player.cls, "");
  assert.strictEqual(post(run({ token: A.token })).error, "no_profile");
  post({ action: "saveProfile", token: A.token, name: "王小明", grade: "J3", classNo: 1, seat: 2 });
  assert.strictEqual(board(A.token, "school", { diff: "easy" }).rows.length, 0);
  post(run({ token: A.token, score: 100, hits: 20, keys: 20, wave: 1, kills: 3, maxCombo: 20 }));
  const rows = env.sheets.Scores.data;
  assert.ok(rows.some((x) => x[0] === "2026") && rows.some((x) => x[0] === "2027"));
  assert.strictEqual(board(A.token, "class").group, "J301");
  setting("SchoolYear", "2026");
});

test("busy lock answers busy", () => {
  ctx.__lockBusy = true;
  assert.strictEqual(post(run({ token: A.token })).error, "busy");
  ctx.__lockBusy = false;
});

/* ---------------- shop ---------------- */
const SHOPJS = require("../shop.js");
const row = (email) => env.sheets.Players.data.find((r) => r[0] === email);
const me = (tok) => post({ action: "me", token: tok }).player;
let S1, S2;

test("shop: the backend and shop.js list the same things at the same prices", () => {
  const back = ctx.SHOP, front = SHOPJS.byId;
  assert.deepStrictEqual(Object.keys(back).sort(), Object.keys(front).sort());
  for (const id in back) {
    const f = front[id];
    assert.deepStrictEqual([back[id][0], back[id][1], back[id][2] || "", back[id][3] || ""], [f.type, f.price, f.char || "", f.unlock || ""], id);
  }
  const total = Object.values(back).reduce((n, x) => n + x[1], 0);
  assert.strictEqual(total, 6510, "price of the whole shop");
  const c = post({ action: "config" });
  assert.strictEqual(c.prices.medic, 300);
  assert.ok(env.sheets.Shop.data.length > 30 && !env.sheets.Shop.data.some((r) => r[0] === "student" || r[0] === "student.hero"), "Shop tab lists only what is sold");
});

test("coins: wave x15 + letters/5, x difficulty; 3 full games a day, then 30%", () => {
  S1 = login("s1@foonyew.edu.my");
  assert.strictEqual(post(run({ token: S1.token })).error, "no_profile", "no coins before the class is filled in");
  post({ action: "saveProfile", token: S1.token, name: "林一", grade: "J2", classNo: 3, seat: 9 });
  assert.deepStrictEqual([me(S1.token).coins, me(S1.token).owned, me(S1.token).equip], [0, [], { char: "student", skin: "", scene: "park", weapon: "keyboard" }]);
  let r = post(run({ token: S1.token }));                               // wave 4, 300 letters, normal
  assert.deepStrictEqual(r.coins, { earned: 120, total: 120, full: true, left: 2, unlocked: [] });
  r = post(run({ token: S1.token, diff: "hard" })); assert.strictEqual(r.coins.earned, 156);
  r = post(run({ token: S1.token, diff: "easy" })); assert.deepStrictEqual([r.coins.earned, r.coins.left], [96, 0]);
  r = post(run({ token: S1.token }));               assert.deepStrictEqual([r.coins.earned, r.coins.full, r.coins.total], [36, false, 408]);
  r = post(run({ token: S1.token, time: 20, hits: 30, keys: 30, wave: 1, kills: 3, score: 300, maxCombo: 30 }));
  assert.strictEqual(r.coins.earned, 0, "a game under 30 s earns nothing");
  r = post(run({ token: S1.token, input: "touch" })); assert.deepStrictEqual([r.ranked, r.coins.earned], [false, 36]);
  row("s1@foonyew.edu.my")[12] = "2020-01-01";                           // a new day
  r = post(run({ token: S1.token })); assert.deepStrictEqual([r.coins.earned, r.coins.left], [120, 2]);
  assert.strictEqual(post(run({ token: S1.token, score: 10 ** 9 })).error, "rejected");
  assert.strictEqual(me(S1.token).coins, 564, "a rejected score pays nothing");
  setting("CoinFullGamesPerDay", "1"); setting("CoinLaterPercent", "50");
  assert.strictEqual(post(run({ token: S1.token })).coins.earned, 60);
  setting("CoinFullGamesPerDay", "3"); setting("CoinLaterPercent", "30");
});

test("co-op games: coins and totals, never the leaderboard", () => {
  const before = env.sheets.Scores.data.length;
  row("s1@foonyew.edu.my")[12] = "2020-01-02";
  const r = post(run({ token: S1.token, coop: true, revives: 3, score: 3300 }));
  assert.deepStrictEqual([r.ranked, r.reason, r.coins.earned], [false, "coop", 120]);
  assert.strictEqual(env.sheets.Scores.data.length, before);
  assert.strictEqual(JSON.parse(row("s1@foonyew.edu.my")[14]).r, 3);
});

test("buying: price, coins, need the character first, no double buying, Shop tab prices", () => {
  const buy = (id, tok) => post({ action: "buy", token: tok || S1.token, id });
  const coins = me(S1.token).coins;
  assert.strictEqual(buy("nothing").error, "bad_item");
  assert.strictEqual(buy("student").error, "already_owned");
  assert.strictEqual(buy("student.hero").error, "not_for_sale");
  assert.strictEqual(buy("medic.pink").error, "need_char");
  let r = buy("medic");
  assert.deepStrictEqual([r.ok, r.player.coins, r.player.owned], [true, coins - 300, ["medic"]]);
  assert.strictEqual(buy("medic").error, "already_owned");
  r = buy("medic.pink"); assert.deepStrictEqual([r.player.coins, r.player.owned], [coins - 380, ["medic", "medic.pink"]]);
  r = buy("student.red"); assert.strictEqual(r.player.coins, coins - 460, "skins of the free character need no purchase first");
  row("s1@foonyew.edu.my")[9] = 100;
  r = buy("scene.snow"); assert.deepStrictEqual([r.error, r.price, r.coins], ["not_enough", 250, 100]);
  env.sheets.Shop.data.find((x) => x[0] === "scene.snow")[1] = 90;       // the teacher changes a price in the sheet
  delete env.cache.prices;
  r = buy("scene.snow"); assert.deepStrictEqual([r.ok, r.player.coins], [true, 10]);
  assert.strictEqual(post({ action: "config" }).prices["scene.snow"], 90);
  assert.strictEqual(buy("weapon.laser", "bad").error, "session_expired");
  const G = login("guest9@gmail.com");
  assert.strictEqual(buy("medic", G.token).error, "no_profile");
});

test("using: only what you own; a skin must fit the character", () => {
  const use = (o, tok) => post(Object.assign({ action: "equip", token: tok || S1.token }, o)).player.equip;
  assert.deepStrictEqual(use({ char: "medic", skin: "medic.pink", scene: "snow", weapon: "laser" }), { char: "medic", skin: "medic.pink", scene: "snow", weapon: "keyboard" });
  assert.deepStrictEqual(use({ char: "guard", skin: "guard.knight", scene: "night", weapon: "keyboard" }), { char: "student", skin: "", scene: "park", weapon: "keyboard" });
  assert.deepStrictEqual(use({ char: "student", skin: "medic.pink" }), { char: "student", skin: "", scene: "park", weapon: "keyboard" });
  assert.deepStrictEqual(use({ char: "student", skin: "student.red", scene: "<x>", weapon: 5 }), { char: "student", skin: "student.red", scene: "park", weapon: "keyboard" });
  assert.deepStrictEqual(me(S1.token).equip.skin, "student.red", "kept for the next visit");
});

test("teachers have everything without paying", () => {
  const t = me(T.token);
  assert.strictEqual(t.all, true);
  assert.strictEqual(t.owned.length, Object.keys(ctx.SHOP).length);
  const r = post({ action: "equip", token: T.token, char: "guard", skin: "guard.knight", scene: "night", weapon: "wand" });
  assert.deepStrictEqual(r.player.equip, { char: "guard", skin: "guard.knight", scene: "night", weapon: "wand" });
  const b = post({ action: "buy", token: T.token, id: "medic" });
  assert.deepStrictEqual([b.ok, b.player.coins], [true, me(T.token).coins], "nothing is charged");
});

test("achievement skins unlock from running totals", () => {
  const stats = () => JSON.parse(row("s1@foonyew.edu.my")[14]);
  row("s1@foonyew.edu.my")[14] = JSON.stringify({ k: 4990, r: 98, c: 60 });
  let r = post(run({ token: S1.token, kills: 9, maxCombo: 99 }));
  assert.deepStrictEqual(r.coins.unlocked, []);
  r = post(run({ token: S1.token, kills: 5, maxCombo: 120 }));
  assert.deepStrictEqual(r.coins.unlocked.sort(), ["bomber.hunter", "lucky.combo"]);
  assert.deepStrictEqual([stats().k, stats().c], [5004, 120]);
  r = post(run({ token: S1.token, coop: true, revives: 2, score: 3200 }));
  assert.deepStrictEqual(r.coins.unlocked, ["student.hero"]);
  assert.deepStrictEqual(post(run({ token: S1.token })).coins.unlocked, [], "only announced once");
  const eq = post({ action: "equip", token: S1.token, char: "student", skin: "student.hero" }).player.equip;
  assert.strictEqual(eq.skin, "student.hero");
});

test("coin gifts from the teacher: by class, grade, stream, email or ALL, once each", () => {
  S2 = login("s2@foonyew.edu.my");
  post({ action: "saveProfile", token: S2.token, name: "陳二", grade: "S1AC", classNo: 2, seat: 4 });
  const gifts = env.sheets.CoinGifts.data, c1 = me(S1.token).coins;
  assert.strictEqual(gifts[0][0], "Target");
  gifts.push(["J203", 50, "班際比賽冠軍", "2026-11-13"]);
  gifts.push(["S1AC", 20, "", ""]);
  gifts.push(["ALL", 5, "", ""]);
  gifts.push(["s2@foonyew.edu.my", 7, "幫忙測試", ""]);
  gifts.push(["J2", 0, "zero is ignored", ""]);
  let a = post({ action: "me", token: S1.token });
  assert.deepStrictEqual([a.gift, a.player.coins], [{ coins: 55, notes: ["班際比賽冠軍"] }, c1 + 55]);
  a = post({ action: "me", token: S1.token });
  assert.deepStrictEqual([a.gift, a.player.coins], [undefined, c1 + 55], "not twice");
  const b = login("s2@foonyew.edu.my");
  assert.deepStrictEqual([b.gift.coins, b.player.coins], [32, 32]);
  gifts.push(["J2", 10, "", ""]);
  assert.strictEqual(post({ action: "me", token: S1.token }).gift.coins, 10, "a new row is a new gift");
  ctx.__lockBusy = true; gifts.push(["ALL", 1, "x", ""]);
  assert.strictEqual(post({ action: "me", token: S1.token }).gift, undefined, "busy: it waits for the next visit");
  ctx.__lockBusy = false;
  assert.strictEqual(post({ action: "me", token: S1.token }).gift.coins, 1);
});

test("players from before the shop: old rows still read, header gets the new columns", () => {
  env.sheets.Players.data[0].length = 9;
  env.sheets.Players.data.push(["old@foonyew.edu.my", "舊生", "", "J203", 5, "2026", new Date(), "", 2]);
  const o = login("old@foonyew.edu.my");
  assert.deepStrictEqual([o.player.coins, o.player.owned, o.player.cls], [66, [], "J203"], "starts with nothing but the gifts waiting for J203 / J2 / ALL");
  assert.strictEqual(env.sheets.Players.data[0].length, 16);
  assert.strictEqual(post(run({ token: o.token })).coins.earned, 120);
});

console.log(n + " tests passed");
