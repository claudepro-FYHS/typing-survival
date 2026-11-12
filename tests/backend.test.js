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

console.log(n + " tests passed");
