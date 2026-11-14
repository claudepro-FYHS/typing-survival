/* node tests/engine.test.js */
const E = require("../js/engine.js");
const assert = require("assert");
global.window = {};
require("../words.js");
const WORDS = window.TS_WORDS.general.split(" ");
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const mk = (mode, extra) => E.createGame(Object.assign({ mode, diff: "normal", seed: 7, words: WORDS, topic: [] }, extra));
const team = (k) => Array.from({ length: k }, (_, i) => ({ pid: "p" + i, name: "P" + i }));
const type = (G, s, pid) => [...s].map((c) => E.key(G, c, pid));
const pg = (e, pid) => E.prog(e, pid || "p0");
const hold = (G) => { G.toSpawn = 0; G.resting = true; G.rest = 9999; };   // no waves during a test

test("classic: first letter locks the target, other letters are misses", () => {
  const G = mk("classic"), P = G.players[0];
  const a = E.addEnemy(G, "normal", 100, 100, ["apple"]);
  const b = E.addEnemy(G, "normal", 900, 500, ["boy"]);
  assert.deepStrictEqual(type(G, "ap"), [true, true]);
  assert.strictEqual(P.target, a.id);
  assert.strictEqual(E.key(G, "b"), false);
  assert.strictEqual(pg(b), 0);
  assert.strictEqual(P.errors, 1);
  assert.strictEqual(P.combo, 0);
  type(G, "ple");
  assert.strictEqual(E.ent(G, a.id), null);
  assert.strictEqual(P.kills, 1);
  assert.strictEqual(P.target, 0);
  type(G, "boy");
  assert.strictEqual(G.kills, 2);
});

test("free: switch mid-word, progress is kept, resume with the next letter", () => {
  const G = mk("free"), P = G.players[0];
  const a = E.addEnemy(G, "normal", 100, 100, ["apple"]);
  const b = E.addEnemy(G, "normal", 900, 500, ["boy"]);
  type(G, "ap");
  assert.strictEqual(P.combo, 2);
  assert.strictEqual(E.key(G, "b"), true);
  assert.strictEqual(P.target, b.id);
  assert.strictEqual(pg(a), 2);
  assert.strictEqual(P.errors, 0);
  assert.strictEqual(P.combo, 1, "switching resets the combo, then counts the new hit");
  assert.strictEqual(P.switches, 1);
  assert.strictEqual(E.key(G, "p"), true, "back to apple with its next letter");
  assert.strictEqual(P.target, a.id);
  assert.strictEqual(pg(a), 3);
  assert.strictEqual(E.key(G, "z"), false, "no enemy wants z");
  assert.strictEqual(P.errors, 1);
  type(G, "le");
  assert.strictEqual(P.kills, 1);
  assert.strictEqual(pg(b), 1);
});

test("free: current target wins when two enemies want the same letter, else nearest", () => {
  const G = mk("free");
  E.addEnemy(G, "normal", 50, 50, ["pear"]);
  const near = E.addEnemy(G, "normal", 600, 360, ["pig"]);
  E.key(G, "p");
  assert.strictEqual(G.players[0].target, near.id);
  const G2 = mk("free");
  const a = E.addEnemy(G2, "normal", 50, 50, ["apple"]);
  const p = E.addEnemy(G2, "normal", 600, 360, ["pig"]);
  type(G2, "ap");
  E.key(G2, "p");
  assert.strictEqual(pg(a), 3, "locked apple takes the p");
  assert.strictEqual(pg(p), 0);
});

test("tank needs two words; score and combo multiplier", () => {
  const G = mk("classic"), P = G.players[0];
  const t = E.addEnemy(G, "tank", 100, 100, ["elephant", "cat"]);
  assert.strictEqual(t.hp, 11);
  type(G, "elephant");
  assert.strictEqual(t.word, "cat");
  assert.strictEqual(pg(t), 0);
  assert.strictEqual(G.kills, 0);
  type(G, "cat");
  assert.strictEqual(G.kills, 1);
  assert.strictEqual(P.score, 90 + 22 + 55);   // 9 hits x10, 2 hits x11, 11 damage x5
});

test("crate pickup and items", () => {
  const G = mk("classic"), P = G.players[0];
  E.addCrate(G, "bomb", 400, 400);
  type(G, "bomb");
  assert.strictEqual(P.items.bomb, 1);
  assert.strictEqual(G.ents.length, 0);
  const nearE = E.addEnemy(G, "normal", 700, 360, ["dog"]);
  const farE = E.addEnemy(G, "normal", 10, 10, ["sun"]);
  const tank = E.addEnemy(G, "tank", 640, 300, ["elephant", "cat"]);
  assert.strictEqual(E.useItem(G, "bomb"), true);
  assert.strictEqual(E.ent(G, nearE.id), null);
  assert.ok(E.ent(G, farE.id));
  assert.strictEqual(tank.word, "cat");
  assert.strictEqual(tank.hp, 3);
  assert.strictEqual(E.useItem(G, "bomb"), false);
  P.items.medkit = 1; P.hp = 50; E.useItem(G, "medkit");
  assert.strictEqual(P.hp, 85);
});

test("solo: biting hurts, shield blocks, freeze stops, game ends at 0 hp", () => {
  const G = mk("classic"), P = G.players[0];
  hold(G);
  E.addEnemy(G, "normal", 640, 400, ["dog"]);
  for (let i = 0; i < 60; i++) E.step(G, 0.05);
  assert.ok(P.hp < 100, "bitten");
  const hp = P.hp;
  P.items.shield = 1; E.useItem(G, "shield");
  for (let i = 0; i < 60; i++) E.step(G, 0.05);
  assert.strictEqual(P.hp, hp, "shield blocks");
  P.shieldT = 0; P.items.freeze = 1; E.useItem(G, "freeze");
  for (let i = 0; i < 60; i++) E.step(G, 0.05);
  assert.strictEqual(P.hp, hp, "frozen enemies do not bite");
  for (let i = 0; i < 20000 && !G.over; i++) E.step(G, 0.05);
  assert.ok(G.over);
  assert.strictEqual(P.hp, 0);
  assert.strictEqual(E.key(G, "d"), false);
});

test("every enemy that reaches the player bites, from any direction and frame rate", () => {
  for (const fps of [30, 60, 144]) {
    const G = mk("free"), P = G.players[0];
    hold(G); P.maxHp = P.hp = 1e9;
    let s = fps; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const list = [];
    for (let i = 0; i < 150; i++) { const a = rnd() * 6.283, d = 150 + rnd() * 400; list.push(E.addEnemy(G, ["normal", "runner", "tank"][i % 3], 640 + Math.cos(a) * d, 360 + Math.sin(a) * d, ["dog"])); }
    for (let i = 0; i < fps * 45; i++) E.step(G, (1 / fps) * (0.9 + 0.2 * rnd()));
    const bit = new Set(G.ev.filter((e) => e.e === "bite").map((e) => e.id));
    assert.strictEqual(list.filter((e) => !e.biting || !bit.has(e.id)).length, 0, "enemies that never bite at " + fps + " fps");
  }
});

test("co-op: shared health, own progress, score by letters typed", () => {
  const G = mk("free", { players: team(2) }), [A, B] = G.players;
  assert.ok(A.x !== B.x || A.y !== B.y, "players stand apart");
  const e = E.addEnemy(G, "normal", 300, 300, ["apple"]);
  type(G, "app", "p0");
  type(G, "a", "p1");
  assert.strictEqual(e.hp, 1);
  assert.strictEqual(pg(e, "p0"), 3);
  assert.strictEqual(pg(e, "p1"), 1);
  assert.strictEqual(E.key(G, "l", "p1"), false, "p1's own next letter is p, not l");
  assert.strictEqual(E.key(G, "p", "p1"), true);
  assert.strictEqual(E.ent(G, e.id), null, "5 damage in total kills a 5-letter enemy");
  assert.strictEqual(A.target, 0, "p0's target is cleared when a teammate finishes it");
  assert.strictEqual(A.score, 30 + 15);
  assert.strictEqual(B.score, 20 + 10);
  assert.strictEqual(B.kills, 1);
  // tank: one player finishing a word moves everyone to the next word
  const t = E.addEnemy(G, "tank", 300, 300, ["elephant", "cat"]);
  type(G, "el", "p1"); type(G, "elephant", "p0");
  assert.strictEqual(t.word, "cat");
  assert.strictEqual(t.hp, 1);
  assert.strictEqual(pg(t, "p1"), 0, "progress starts again on the new word");
  E.key(G, "c", "p1");
  assert.strictEqual(E.ent(G, t.id), null);
});

test("co-op: a tank dies exactly when its health runs out", () => {
  const G = mk("free", { players: team(2) });
  const t = E.addEnemy(G, "tank", 300, 300, ["elephant", "cat"]);
  type(G, "elep", "p1"); type(G, "elephant", "p0");
  assert.strictEqual(E.ent(G, t.id), null, "8 + 4 = 12 damage on 11 health");
});

test("co-op: more players, more enemies", () => {
  const count = (k) => { const G = mk("classic", { players: team(k) }); for (let i = 0; i < 200; i++) E.step(G, 0.05); return G.toSpawn + E.enemies(G).length; };
  assert.strictEqual(count(1), 8);
  assert.ok(count(4) > count(2) && count(2) > count(1));
});

test("co-op: down, every standing teammate must type the word, then revive; all down ends", () => {
  const G = mk("free", { players: team(3) }), [A, B, C] = G.players;
  hold(G);
  const z = E.addEnemy(G, "normal", A.x, A.y - 40, ["dog"]);
  A.hp = 4;
  for (let i = 0; i < 40 && !A.down; i++) E.step(G, 0.05);
  assert.ok(A.down && !G.over);
  const d = G.ents.find((e) => e.kind === "down");
  assert.strictEqual(d.pid, "p0");
  assert.strictEqual(E.key(G, d.word[0], "p0"), false, "a downed player cannot type");
  type(G, "dog", "p1");                       // clear the zombie so it stops biting
  assert.strictEqual(E.ent(G, z.id), null);
  type(G, d.word, "p1");
  assert.ok(A.down, "one of two teammates is not enough");
  assert.strictEqual(B.target, 0);
  type(G, d.word, "p2");
  assert.ok(!A.down, "revived");
  assert.strictEqual(A.hp, 50);
  assert.strictEqual(B.revives, 1);
  assert.ok(!G.ents.some((e) => e.kind === "down"));
  // a teammate who leaves no longer has to type
  A.hp = 1; E.addEnemy(G, "normal", A.x, A.y - 40, ["fox"]);
  for (let i = 0; i < 200 && !A.down; i++) E.step(G, 0.05);   // 2 s of protection after a revive
  assert.ok(A.down);
  const d2 = G.ents.find((e) => e.kind === "down");
  type(G, d2.word, "p1");
  assert.ok(A.down);
  E.leave(G, "p2");
  assert.ok(!A.down, "revived once the only remaining teammate has typed it");
  // everyone down = over
  E.leave(G, "p0");
  assert.ok(!G.over);
  B.hp = 1; G.ents.length = 0; E.addEnemy(G, "normal", B.x, B.y - 40, ["cat"]);
  for (let i = 0; i < 80 && !G.over; i++) E.step(G, 0.05);
  assert.ok(G.over, "last standing player down ends the game");
  assert.ok(C.left);
});

test("characters: what they start with, and nothing else changes", () => {
  const as = (char, extra) => mk("classic", Object.assign({ players: [{ pid: "p0", name: "", look: { char } }] }, extra));
  let G = as("student"); assert.deepStrictEqual([G.players[0].maxHp, G.players[0].items], [100, { bomb: 0, freeze: 0, medkit: 0, shield: 0 }]);
  G = as("medic"); let P = G.players[0];
  assert.strictEqual(P.items.medkit, 1); P.hp = 10; E.useItem(G, "medkit"); assert.strictEqual(P.hp, 60);
  G = as("bomber"); P = G.players[0];
  const far = E.addEnemy(G, "normal", P.x + 350, P.y, ["dog"]);
  assert.strictEqual(P.items.bomb, 1); E.useItem(G, "bomb"); assert.strictEqual(E.ent(G, far.id), null, "bigger bomb reaches 350 px");
  G = as("student"); G.players[0].items.bomb = 1; const far2 = E.addEnemy(G, "normal", 640 + 350, 360, ["dog"]); E.useItem(G, "bomb"); assert.ok(E.ent(G, far2.id), "the normal bomb does not");
  G = as("froster"); E.useItem(G, "freeze"); assert.strictEqual(G.freezeT, 7);
  G = as("guard"); P = G.players[0]; assert.deepStrictEqual([P.hp, P.maxHp, P.items.shield], [120, 120, 1]);
  const crates = (char) => { const g = as(char, { seed: 11 }); let n = 0; for (let i = 0; i < 4000; i++) { E.addEnemy(g, "normal", 300, 300, ["dog"]); type(g, "dog"); n += g.ents.length; g.ents.length = 0; } return n; };
  const a = crates("student"), b = crates("lucky");
  assert.ok(a > 400 && a < 560 && b > 640 && b < 800, `crate drops per 4000 kills: student ${a}, lucky ${b}`);
  G = as("guard", { noAbilities: true }); assert.deepStrictEqual([G.players[0].maxHp, G.players[0].items.shield, G.players[0].look.char], [100, 0, "guard"]);
  G = mk("free", { scene: "snow", players: [{ pid: "p0", name: "A", look: { char: "medic", skin: "medic.pink", weapon: "laser" } }, { pid: "p1", name: "B" }] });
  const s = JSON.parse(JSON.stringify(E.snapshot(G)));
  assert.deepStrictEqual([s.scene, s.players[0].look, s.players[1].look], ["snow", { char: "medic", skin: "medic.pink", weapon: "laser" }, { char: "student", skin: "", weapon: "keyboard" }]);
});

/* ---------------- typing test ---------------- */
const LINES = require("../lines.js");
const mkTest = (kind, deck, seconds) => E.createGame({ test: { kind, deck, seconds: seconds || 300 }, seed: 1, words: [], topic: [], players: [{ pid: "p0", name: "", look: { char: "guard" } }] });

test("test content: plain keyboard characters, short enough, enough of it", () => {
  for (const k of ["sentence", "excel", "c"]) {
    assert.ok(LINES[k].length >= 40, k + " has " + LINES[k].length);
    for (const l of LINES[k]) assert.ok(/^[\x21-\x7e]+( [\x21-\x7e]+)*$/.test(l) && l.length <= 46, k + ": " + JSON.stringify(l));
    assert.strictEqual(new Set(LINES[k]).size, LINES[k].length, k + " has a repeated line");
  }
  assert.deepStrictEqual([LINES.subjectOf("S1"), LINES.subjectOf("S2"), LINES.subjectOf("J2")], ["excel", "c", ""]);
});

test("word test: 4 waiting enemies, nobody attacks, finished words count (+1 space), clock ends it", () => {
  const G = mkTest("word", ["apple", "ant", "boy", "cat", "dog", "egg", "fish"], 60), P = G.players[0];
  assert.deepStrictEqual([P.maxHp, P.items.shield, G.players.length], [100, 0, 1], "character abilities are off");
  for (let i = 0; i < 600; i++) E.step(G, 0.05);                        // 30 s of doing nothing
  assert.deepStrictEqual([G.ents.length, P.hp, G.over], [4, 100, false]);
  assert.deepStrictEqual(G.ents.map((e) => e.word).sort(), ["apple", "boy", "cat", "dog"], "ant is held back: two words must not start with the same letter");
  assert.ok(G.ents.every((e) => !e.biting && Math.hypot(e.x - P.x, e.y - P.y) > 200), "they wait at a distance");
  type(G, "ap");
  assert.strictEqual(E.key(G, "b"), false, "locked on apple: b is a mistake");
  type(G, "ple");
  assert.deepStrictEqual([P.tDone, P.tKeys, P.tWords], [6, 7, 1], "5 letters + the space = 6 correct of 7 presses");
  E.step(G, 0.05);
  assert.strictEqual(G.ents.length, 4, "a new enemy replaces the one knocked down");
  assert.ok(G.ents.some((e) => e.word === "ant"), "now that a is free, ant comes next");
  type(G, "bo");                                                          // unfinished word at the end does not count
  assert.strictEqual(E.key(G, "z"), false);
  const s = E.testStats(G, 1);
  assert.deepStrictEqual([s.correct, s.keys, Math.round(s.wpm * 10) / 10, Math.round(s.acc)], [6, 10, 1.2, 60]);
  for (let i = 0; i < 700 && !G.over; i++) E.step(G, 0.05);
  assert.ok(G.over && G.t === 60, "ends when the time is up");
  assert.strictEqual(E.key(G, "y"), false);
});

test("line test: exact characters in order, Shift characters count 2, pieces count at each space", () => {
  const G = mkTest("line", ['printf("%d\\n", x);', "int a, b;", "return 0;", "x = 1;"], 300), P = G.players[0];
  E.step(G, 0.05);
  assert.strictEqual(G.ents.length, 3);
  assert.strictEqual(E.ent(G, P.target).word, 'printf("%d\\n", x);', "the first line is the active one");
  assert.strictEqual(E.key(G, "i"), false, "cannot start another line");
  assert.strictEqual(E.key(G, "P"), false, "capital P is not p");
  type(G, 'printf("%d\\n",');
  assert.deepStrictEqual([P.tDone, P.tPend, P.tWords], [0, 18, 0], "14 characters, 4 of them with Shift, nothing counted before the space");
  type(G, " ");
  assert.deepStrictEqual([P.tDone, P.tPend, P.tWords], [19, 0, 1]);
  type(G, "x);");
  assert.deepStrictEqual([P.tDone, P.tWords, P.tKeys], [23, 2, 25], "the whole line is 18 characters = 23 presses; 2 wrong presses on top");
  E.step(G, 0.05);
  assert.strictEqual(E.ent(G, P.target).word, "int a, b;");
  assert.deepStrictEqual([E.presses("("), E.presses("A"), E.presses("a"), E.presses("5"), E.presses(";"), E.presses('"'), E.presses("'"), E.presses("=")], [2, 2, 1, 1, 1, 2, 1, 1]);
  assert.ok(P.keyStats["("].h === 1 && P.keyStats.p.m === 2 && P.keyStats.p.h === 1, "per-key hits and misses are kept (both wrong presses are charged to p, the key that was wanted)");
});

test("marks and levels: same table as the older typing games", () => {
  const sc = (net, full, acc) => E.testScore(net, acc == null ? 100 : acc, full, 85);
  assert.deepStrictEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 60].map((n) => sc(n, 40)), [20, 40, 50, 60, 70, 80, 90, 100, 100, 100]);
  assert.deepStrictEqual([5, 10, 15, 20, 25, 30, 35, 40, 45].map((n) => sc(n, 45)), [20, 40, 49, 57, 66, 74, 83, 91, 100]);
  assert.deepStrictEqual([sc(30, 40, 84.9), sc(30, 40, 85), sc(0, 40), sc(30, 30), sc(20, 30)], [40, 80, 0, 100, 70]);
  assert.deepStrictEqual([0, 9.9, 10, 14.9, 15, 20, 25, 30, 37.9, 38, 45, 55, 69.9, 70, 150].map(E.rankOf), [1, 1, 2, 2, 3, 4, 5, 6, 6, 7, 8, 9, 9, 10, 10]);
});

test("a typing bot through a whole 5-minute test of each kind", () => {
  for (const [kind, deck] of [["word", WORDS.filter((w) => w.length <= 8)], ["line", LINES.sentence], ["line", LINES.c], ["line", LINES.excel]]) {
    const G = mkTest(kind, deck, 300), P = G.players[0];
    let acc = 0;
    for (let i = 0; i < 60 * 310 && !G.over; i++) {
      E.step(G, 1 / 60); acc += 1 / 60;
      if (acc >= 0.2) { acc = 0; const t = E.ent(G, P.target) || G.ents[0]; if (t) E.key(G, t.word[E.prog(t, "p0")]); }
      if (kind === "word" && i % 30 === 0) { const f = G.ents.map((e) => e.word[0]); assert.strictEqual(new Set(f).size, f.length, "first letters clash: " + G.ents.map((e) => e.word)); }
      G.ev.length = 0;
    }
    const s = E.testStats(G, 5);
    assert.ok(G.over && P.errors === 0 && Math.round(s.acc) === 100 && s.wpm > 40 && s.wpm < 75, `${kind}: wpm ${s.wpm.toFixed(1)}, acc ${s.acc.toFixed(1)}`);
    JSON.stringify(E.snapshot(G));
  }
});

test("snapshot is plain JSON a guest can draw from", () => {
  const G = mk("free", { players: team(2) });
  for (let i = 0; i < 200; i++) E.step(G, 0.05);
  E.key(G, G.ents[0].word[0], "p1");
  const s = JSON.parse(JSON.stringify(E.snapshot(G)));
  assert.strictEqual(s.players.length, 2);
  assert.strictEqual(s.ents.length, G.ents.length);
  assert.strictEqual(E.prog(s.ents[0], "p1"), 1);
  assert.strictEqual(E.ent(s, s.players[1].target).id, G.ents[0].id);
  assert.ok(!("general" in s) && !("rnd" in s));
  assert.ok(E.stats(s, "p1").hits === 1 && E.enemies(s).length > 0);
});

test("bots play: solo 3 difficulties x 2 modes, and a 6-player room", () => {
  const run = (opts, secs) => {
    const G = mk(opts.mode, opts);
    let clash = 0, checks = 0, acc = 0;
    for (let i = 0; i < 60 * secs && !G.over; i++) {
      E.step(G, 1 / 60);
      acc += 1 / 60;
      if (acc >= 0.12) {
        acc = 0;
        for (const P of G.players) {
          if (P.down) continue;
          const t = E.ent(G, P.target) || G.ents.filter((e) => E.prog(e, P.pid) < e.word.length)
            .sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y))[0];
          if (t) E.key(G, t.word[E.prog(t, P.pid)], P.pid);
        }
      }
      if (i % 60 === 0) {
        const firsts = G.ents.map((e) => e.word[0]);
        checks++; if (new Set(firsts).size !== firsts.length) clash++;
        for (const e of G.ents) assert.ok(/^[a-z]+$/.test(e.word) && (e.kind === "down" || e.hp > 0), "bad entity " + JSON.stringify(e));
        JSON.stringify(E.snapshot(G));
      }
      G.ev.length = 0;
    }
    return { G, clash, checks };
  };
  for (const diff of ["easy", "normal", "hard"]) for (const mode of ["classic", "free"]) {
    const { G, clash, checks } = run({ mode, diff, seed: 99, topic: window.TS_WORDS.topics.S2.words.split(" ") }, 240);
    const P = G.players[0];
    assert.ok(G.wave >= 4, `${diff}/${mode} reached wave ${G.wave}`);
    assert.strictEqual(P.errors, 0);
    assert.ok(clash / checks < 0.1, `first-letter clashes ${clash}/${checks}`);
    console.log(`    ${diff}/${mode}: wave ${G.wave}, kills ${G.kills}, score ${P.score}, wpm ${E.stats(G).wpm.toFixed(0)}, hp ${P.hp}`);
  }
  const { G } = run({ mode: "free", diff: "normal", seed: 5, players: team(6) }, 180);
  assert.ok(G.wave >= 3, "6 players reached wave " + G.wave);
  console.log(`    6 players: wave ${G.wave}, kills ${G.kills}, scores ${G.players.map((p) => p.score).join("/")}, downs ${G.players.map((p) => p.downs).join("/")}`);
});

console.log(n + " tests passed");
