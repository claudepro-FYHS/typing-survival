/* node tests/test-mode.test.js — the graded typing test, self check, weak keys and teacher console in Code.gs */
const assert = require("assert");
const { makeEnv } = require("./mockgas.js");
const E = require("../js/engine.js");
let offset = 0;
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(Date.now() + offset); }
  static now() { return Date.now() + offset; }
}
const wait = (secs) => { offset += secs * 1000; };
const env = makeEnv({ Date: FakeDate }), ctx = env.ctx;
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).content);
const login = (email) => post({ action: "login", idToken: "fake:" + email });
const sheet = (name) => env.sheets[name].data;
const plain = (x) => JSON.parse(JSON.stringify(x));       // rows made inside the sandbox are another realm's arrays
const fresh = () => { delete env.cache.testcfg; };

ctx.setup();
sheet("Settings").find((r) => r[0] === "GoogleClientId")[1] = "cid";
sheet("Settings").find((r) => r[0] === "SchoolYear")[1] = "2026";
sheet("Teachers").push(["wendy@foonyew.edu.my", ""], ["liew@foonyew.edu.my", ""]);
function student(email, name, grade, no, seat) {
  const a = login(email);
  const r = post({ action: "saveProfile", token: a.token, name, grade, classNo: no, seat });
  assert.ok(r.ok, JSON.stringify(r));
  return a.token;
}
const A = student("a@foonyew.edu.my", "王小明", "J2", 3, 12), B = student("b@foonyew.edu.my", "李美", "J2", 7, 5);
const S1 = student("s1@foonyew.edu.my", "高一生", "S1S", 2, 1), S2 = student("s2@foonyew.edu.my", "高二生", "S2S", 3, 8), J3 = student("j3@foonyew.edu.my", "初三生", "J3", 4, 2);
const W = login("wendy@foonyew.edu.my").token, L = login("liew@foonyew.edu.my").token, ADMIN = login("edwinchowzihao@foonyew.edu.my").token;
const G = login("someone@gmail.com").token;
// counts for an attempt typed at `net` WPM with `acc` % accuracy over `minutes`
const typed = (wpm, acc, minutes) => { const correct = Math.round(wpm * 5 * minutes); const keys = Math.round(correct / (acc / 100)); return { correct, good: correct, keys, words: Math.round(correct / 5) }; };
const start = (tok, code) => post({ action: "testStart", token: tok, code });
const finish = (tok, id, o) => post(Object.assign({ action: "testFinish", token: tok, attemptId: id }, o));
let CODE;

test("first use: tabs and settings appear; nobody can test until a teacher opens one", () => {
  const info = post({ action: "testInfo", token: A });
  assert.deepStrictEqual([info.ok, info.active, info.allowed, info.teacher], [true, false, false, false]);
  for (const t of ["Tests", "TestAttempts", "TestResults", "TestExtra", "KeyStats"]) assert.ok(env.sheets[t], t + " tab");
  assert.ok(sheet("Settings").some((r) => r[0] === "TestFullWPMSubject") && sheet("Settings").some((r) => r[0] === "Admins"));
  assert.strictEqual(start(A, "ANY").error, "no_test");
  assert.strictEqual(post({ action: "config" }).testActive, false);
  assert.deepStrictEqual([post({ action: "testInfo", token: W }).teacher, post({ action: "testInfo", token: ADMIN }).teacher], [true, true]);
});

test("teacher opens a test: classes, kind, code; students and outsiders cannot", () => {
  assert.strictEqual(post({ action: "tTests", token: A }).error, "not_teacher");
  assert.strictEqual(post({ action: "tCreate", token: G, classes: "J2" }).error, "not_teacher");
  const t = post({ action: "tTests", token: W });
  assert.deepStrictEqual([t.ok, t.admin, t.tests.length, t.defaults], [true, false, 0, { minutes: 5, attempts: 2 }]);
  assert.ok(/^[A-Z2-9]{2}-[A-Z2-9]{3}$/.test(t.suggest));
  assert.strictEqual(post({ action: "tCreate", token: W, classes: "" }).error, "need_classes");
  assert.strictEqual(post({ action: "tCreate", token: W, classes: "J2; DROP" }).error, "bad_classes");
  assert.strictEqual(post({ action: "tCreate", token: W, classes: "J2", code: "12" }).error, "bad_code");
  const c = post({ action: "tCreate", token: W, classes: "j203, J207", code: "j2-k7", kind: "word" });
  assert.deepStrictEqual([c.ok, c.test.code, c.test.classes, c.test.kind, c.test.minutes, c.test.attempts, c.test.status], [true, "J2-K7", "J203, J207", "word", 5, 2, "open"]);
  CODE = c.test.code;
  assert.strictEqual(post({ action: "tCreate", token: L, classes: "J3", code: "J2 K7" }).error, "code_used");
  assert.strictEqual(post({ action: "config" }).testActive, true);
});

test("the code is never sent to students; a wrong code costs no attempt; 5 wrong in a row = wait", () => {
  const info = post({ action: "testInfo", token: A });
  assert.deepStrictEqual([info.active, info.allowed, info.minutes, info.attempts, info.used, info.kind, info.content, info.full], [true, true, 5, 2, 0, "word", "word", 40]);
  assert.ok(!JSON.stringify(info).includes("K7") && !JSON.stringify(post({ action: "config" })).includes("K7"));
  assert.strictEqual(post({ action: "testInfo", token: J3 }).allowed, false, "not for J3");
  assert.strictEqual(start(J3, CODE).error, "not_your_class");
  assert.strictEqual(start(G, CODE).error, "no_profile");
  for (let i = 0; i < 4; i++) assert.strictEqual(start(B, "nope" + i).error, "wrong_code");
  assert.strictEqual(sheet("TestAttempts").length, 1, "no attempt used");
  assert.ok(start(B, "j2k7").ok, "case, spaces and dashes do not matter");
  for (let i = 0; i < 5; i++) start(S1, "x");
  assert.strictEqual(start(S1, CODE).error, "too_many_codes");
});

test("an attempt: cannot finish early; marks = the older games' table; best of 2; no third try", () => {
  let a = start(A, CODE);
  assert.deepStrictEqual([a.ok, a.attemptNo, a.attempts, a.minutes, a.content, a.full, a.passAcc, a.grade, a.code], [true, 1, 2, 5, "word", 40, 85, "J2", "J2-K7"]);
  assert.strictEqual(finish(A, a.attemptId, typed(30, 95, 5)).error, "too_early");
  assert.strictEqual(finish(B, a.attemptId, typed(30, 95, 5)).error, "no_attempt", "someone else's attempt");
  wait(300);
  let r = finish(A, a.attemptId, typed(30, 100, 5));
  assert.deepStrictEqual([r.wpm, r.accuracy, r.net, r.score, r.status, r.attemptNo, r.best], [30, 100, 30, 80, "finished", 1, 80]);
  assert.strictEqual(finish(A, a.attemptId, typed(99, 100, 5)).already, true, "sending twice changes nothing");
  a = start(A, CODE); wait(300);
  r = finish(A, a.attemptId, typed(40, 80, 5));                       // accuracy under 85%: halved
  assert.deepStrictEqual([r.net, r.score, r.best], [32, 42, 80]);
  assert.strictEqual(start(A, CODE).error, "no_attempts");
  const res = sheet("TestResults").find((x) => x[4] === "a@foonyew.edu.my");
  assert.deepStrictEqual(plain(res.slice(0, 11)), ["J2-K7", "J203", 12, "王小明", "a@foonyew.edu.my", 2, 80, 30, 30, 100, "word"]);
  const info = post({ action: "testInfo", token: A });
  assert.deepStrictEqual([info.used, info.best, info.history.map((h) => h.score)], [2, 80, [80, 42]]);
  for (const [net, want] of [[5, 20], [10, 40], [15, 50], [20, 60], [25, 70], [35, 90], [40, 100], [60, 100]]) assert.strictEqual(ctx.testScore_(net, 100, 40, 85), want);
  for (const [net, want] of [[15, 49], [20, 57], [25, 66], [30, 74], [35, 83], [40, 91], [45, 100]]) assert.strictEqual(ctx.testScore_(net, 100, 45, 85), want);
  for (let x = 0; x <= 80; x += 0.7) assert.strictEqual(ctx.testScore_(x, 90, 40, 85), E.testScore(x, 90, 40, 85), "page and server agree at " + x);
  for (let x = 0; x <= 80; x += 0.9) assert.strictEqual(ctx.testRank_(x), E.rankOf(x));
});

test("leaving the page: the whole time counts; too fast: rejected; a closed page stays 'started'", () => {
  const b = sheet("TestAttempts").find((x) => x[3] === "b@foonyew.edu.my");
  wait(60);                                                             // B started earlier and typed for a minute, then switched tab
  let r = finish(B, b[2], Object.assign({ left: true }, typed(40, 100, 1)));
  assert.deepStrictEqual([r.status, r.wpm, r.score], ["left page", 8, 32], "40 WPM for 1 minute, counted over 5");
  const a2 = start(B, CODE); wait(300);
  r = finish(B, a2.attemptId, typed(250, 100, 5));
  assert.deepStrictEqual([r.status, r.score], ["rejected (too fast)", 0]);
  assert.strictEqual(sheet("TestAttempts").filter((x) => x[9] === "started").length, 0);
});

test("teacher console: live list, end an attempt, extra attempt, close; only your own tests", () => {
  assert.strictEqual(post({ action: "tMonitor", token: L, code: CODE }).error, "not_your_test");
  assert.strictEqual(post({ action: "tExtra", token: W, code: CODE, email: "b@foonyew.edu.my", delta: 1 }).allowed, 3);
  const a = start(B, CODE); wait(120);
  assert.deepStrictEqual(post({ action: "testPing", token: B, attemptId: a.attemptId, correct: 300, good: 310, keys: 320, words: 60 }), { ok: true, kicked: false });
  let m = post({ action: "tMonitor", token: W, code: CODE });
  assert.deepStrictEqual(m.students.map((s) => [s.cls, s.seat, s.name, s.allowed, s.attempts.length, s.best && s.best.score]), [["J203", "12", "王小明", 2, 2, 80], ["J207", "5", "李美", 3, 3, 32]]);
  const live = m.students[1].attempts[2];
  assert.deepStrictEqual([live.status, live.secsLeft, live.liveWpm, live.liveAcc, live.words, live.lost], ["started", 180, 30, 96.9, 60, false]);
  const e = post({ action: "tEnd", token: W, code: CODE, attemptId: a.attemptId });
  assert.deepStrictEqual([e.ok, e.net], [true, 29.1], "scored over the 2 minutes used");
  assert.strictEqual(post({ action: "testPing", token: B, attemptId: a.attemptId, keys: 1 }).kicked, true, "the student's page is told to stop");
  assert.strictEqual(post({ action: "tEnd", token: W, code: CODE, attemptId: a.attemptId }).error, "not_running");
  assert.strictEqual(finish(B, a.attemptId, typed(90, 100, 5)).status, "ended by teacher", "a late finish cannot overwrite it");
  assert.ok(post({ action: "tMonitor", token: ADMIN, code: CODE }).ok, "the admin sees every teacher's test");
  assert.deepStrictEqual(post({ action: "tTests", token: ADMIN }).tests.map((t) => t.code), ["J2-K7"]);
  assert.deepStrictEqual(post({ action: "tTests", token: L }).tests, []);
  const u = post({ action: "tUpdate", token: W, code: CODE, status: "closed" }); fresh();
  assert.strictEqual(u.test.status, "closed");
  assert.deepStrictEqual([post({ action: "testInfo", token: A }).active, start(A, CODE).error], [false, "no_test"]);
  assert.strictEqual(post({ action: "tUpdate", token: L, code: CODE, status: "open" }).error, "not_your_test");
});

test("sentence and subject tests: what each grade types, and their own full-marks speed", () => {
  assert.deepStrictEqual(["J203", "S1S2", "S2S3", "J304"].map((c) => ctx.testContent_("subject", c)), ["sentence", "excel", "c", "sentence"]);
  const cfg = ctx.testConfig_();
  assert.deepStrictEqual([["word", "J203"], ["word", "S2S3"], ["sentence", "J203"], ["sentence", "J304"], ["sentence", "S2S3"], ["excel", "S1S2"], ["c", "S2S3"]].map(([k, c]) => ctx.testFullWpm_(k, c, cfg)), [40, 45, 35, 40, 40, 30, 30]);
  const c = post({ action: "tCreate", token: L, classes: "S1, S2, J3", kind: "subject", minutes: 3, attempts: 1 }); fresh();
  const code = c.test.code;
  delete env.cache["codetries:s1@foonyew.edu.my"];
  let a = start(S1, code);
  assert.deepStrictEqual([a.content, a.full, a.minutes, a.attempts, a.grade], ["excel", 30, 3, 1, "S1"]);
  wait(180);
  let r = finish(S1, a.attemptId, typed(20, 100, 3));
  assert.deepStrictEqual([r.net, r.score, r.rank], [20, 70, null], "net 20 of 30 = 70 marks; no level from a subject test");
  a = start(S2, code); assert.strictEqual(a.content, "c"); wait(180);
  assert.strictEqual(finish(S2, a.attemptId, typed(30, 90, 3)).score, 91);
  a = start(J3, code); assert.deepStrictEqual([a.content, a.full], ["sentence", 40]); wait(180);
  assert.strictEqual(finish(J3, a.attemptId, typed(25, 100, 3)).score, 70);
  sheet("Settings").find((x) => x[0] === "TestFullWPMSubject")[1] = "S1:25, S2:28"; fresh();
  assert.deepStrictEqual([ctx.testFullWpm_("excel", "S1S2", ctx.testConfig_()), ctx.testFullWpm_("c", "S2S3", ctx.testConfig_())], [25, 28], "the teacher can change them in the sheet");
  sheet("Settings").find((x) => x[0] === "TestFullWPM")[1] = "J2:20"; fresh();
  assert.strictEqual(ctx.testFullWpm_("word", "J203", ctx.testConfig_()), 40, "the word test never goes below 40");
  post({ action: "tUpdate", token: L, code, status: "closed" }); fresh();
});

test("weak keys: every test adds to one row per student; the teacher sees the class total", () => {
  const c = post({ action: "tCreate", token: W, classes: "J2", kind: "sentence", minutes: 1, attempts: 3 }); fresh();
  const stats = { a: { h: 50, m: 1, ms: 9000, n: 45 }, p: { h: 20, m: 9, ms: 12000, n: 20 }, "(": { h: 4, m: 6, ms: 5000, n: 4 }, "ab": { h: 1 }, "é": { h: 1 } };
  let a = start(A, c.test.code); wait(60);
  finish(A, a.attemptId, Object.assign({ stats }, typed(20, 95, 1)));
  a = start(A, c.test.code); wait(60);
  finish(A, a.attemptId, Object.assign({ stats: { p: { h: 10, m: 1, ms: 3000, n: 10 } } }, typed(22, 95, 1)));
  const rows = sheet("KeyStats").filter((x) => x[0] === "a@foonyew.edu.my");
  assert.strictEqual(rows.length, 1, "one row per student");
  assert.deepStrictEqual(JSON.parse(rows[0][5]), { a: [50, 1, 9000, 45], p: [30, 10, 15000, 30], "(": [4, 6, 5000, 4] });
  assert.deepStrictEqual(post({ action: "myKeys", token: A }).keys.p, [30, 10, 15000, 30]);
  a = start(B, c.test.code); wait(60);
  finish(B, a.attemptId, Object.assign({ stats: { p: { h: 5, m: 5, ms: 1000, n: 5 }, z: { h: 3, m: 0, ms: 600, n: 3 } } }, typed(15, 90, 1)));
  const k = post({ action: "tKeys", token: W, cls: "J2" });
  assert.deepStrictEqual([k.students, k.keys.p, k.keys.z], [2, [35, 15, 16000, 35], [3, 0, 600, 3]]);
  assert.strictEqual(post({ action: "tKeys", token: W, cls: "J203" }).students, 1);
  post({ action: "addKeys", token: B, stats: { z: { h: 7, m: 1, ms: 900, n: 7 } } });      // weak-key practice
  assert.deepStrictEqual(plain(post({ action: "myKeys", token: B }).keys.z), [10, 1, 1500, 10]);
  assert.strictEqual(post({ action: "tKeys", token: A, cls: "J2" }).error, "not_teacher");
  post({ action: "tUpdate", token: W, code: c.test.code, status: "closed" }); fresh();
});

test("self check: no code; timed by the server; the 5-minute word check gives a level and a leaderboard row", () => {
  let s = post({ action: "selfStart", token: A, kind: "word" });
  assert.deepStrictEqual([s.ok, s.minutes, s.content, s.full], [true, 5, "word", 40]);
  assert.strictEqual(post(Object.assign({ action: "selfFinish", token: A, st: s.st }, typed(40, 100, 5))).error, "too_early");
  assert.strictEqual(post(Object.assign({ action: "selfFinish", token: B, st: s.st }, typed(40, 100, 5))).error, "bad_request", "someone else's check");
  assert.strictEqual(post(Object.assign({ action: "selfFinish", token: A, st: s.st + "x" }, typed(40, 100, 5))).error, "bad_request");
  wait(300);
  let r = post(Object.assign({ action: "selfFinish", token: A, st: s.st }, typed(32, 100, 5)));
  assert.deepStrictEqual([r.net, r.score, r.rank, r.ranked, r.best, r.unlocked], [32, 84, 6, true, true, []]);
  s = post({ action: "selfStart", token: A, kind: "word" }); wait(300);
  r = post(Object.assign({ action: "selfFinish", token: A, st: s.st }, typed(41, 98, 5)));
  assert.deepStrictEqual([r.net, r.rank, r.best, r.unlocked], [40.2, 7, true, ["medic.master"]], "level 7 unlocks the skin");
  s = post({ action: "selfStart", token: A, kind: "word" }); wait(300);
  r = post(Object.assign({ action: "selfFinish", token: A, st: s.st }, typed(20, 100, 5)));
  assert.deepStrictEqual([r.best, r.bestNet, r.unlocked], [false, 40.2, []]);
  assert.strictEqual(sheet("Scores").filter((x) => x[2] === "test").length, 1);
  s = post({ action: "selfStart", token: B, kind: "word" }); wait(300);
  post(Object.assign({ action: "selfFinish", token: B, st: s.st }, typed(25, 100, 5)));
  const lb = post({ action: "leaderboard", token: B, scope: "grade", mode: "test" });
  assert.deepStrictEqual(lb.rows.map((x) => [x.rank, x.name, x.cls, x.score, x.wave, x.mode]), [[1, "王小明", "J203", 40.2, 7, "test"], [2, "李美", "J207", 25, 5, "test"]]);
  post({ action: "submitScore", token: B, mode: "free", diff: "normal", score: 3000, wave: 4, kills: 40, hits: 300, keys: 320, time: 120, maxCombo: 50, input: "kb" });
  assert.deepStrictEqual(post({ action: "leaderboard", token: B, scope: "grade", mode: "all" }).rows.map((x) => [x.name, x.score]), [["李美", 3000]], "the 'all' board has survival scores only");
  s = post({ action: "selfStart", token: S2, kind: "subject" });
  assert.deepStrictEqual([s.content, s.full], ["c", 28]); wait(300);
  r = post(Object.assign({ action: "selfFinish", token: S2, st: s.st }, typed(28, 100, 5)));
  assert.deepStrictEqual([r.score, r.rank, r.ranked], [100, null, false], "only the word check is ranked");
  s = post({ action: "selfStart", token: A, kind: "word" }); wait(700);
  assert.strictEqual(post(Object.assign({ action: "selfFinish", token: A, st: s.st }, typed(90, 100, 5))).error, "too_late");
});

console.log(n + " tests passed");
