/* node tests/engine.test.js */
const E = require("../js/engine.js");
const assert = require("assert");
global.window = {};
require("../words.js");
const WORDS = window.TS_WORDS.general.split(" ");
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const mk = (mode, extra) => E.createGame(Object.assign({ mode, diff: "normal", seed: 7, words: WORDS, topic: [] }, extra));
const type = (G, s) => [...s].map((c) => E.key(G, c));

test("classic: first letter locks the target, other letters are misses", () => {
  const G = mk("classic");
  const a = E.addEnemy(G, "normal", 100, 100, ["apple"]);
  const b = E.addEnemy(G, "normal", 900, 500, ["boy"]);
  assert.deepStrictEqual(type(G, "ap"), [true, true]);
  assert.strictEqual(G.target, a.id);
  assert.strictEqual(E.key(G, "b"), false);
  assert.strictEqual(b.prog, 0);
  assert.strictEqual(G.errors, 1);
  assert.strictEqual(G.combo, 0);
  type(G, "ple");
  assert.strictEqual(E.ent(G, a.id), null);
  assert.strictEqual(G.kills, 1);
  assert.strictEqual(G.target, 0);
  type(G, "boy");
  assert.strictEqual(G.kills, 2);
});

test("free: switch mid-word, progress is kept, resume with the next letter", () => {
  const G = mk("free");
  const a = E.addEnemy(G, "normal", 100, 100, ["apple"]);
  const b = E.addEnemy(G, "normal", 900, 500, ["boy"]);
  type(G, "ap");
  assert.strictEqual(G.combo, 2);
  assert.strictEqual(E.key(G, "b"), true);
  assert.strictEqual(G.target, b.id);
  assert.strictEqual(a.prog, 2);
  assert.strictEqual(G.errors, 0);
  assert.strictEqual(G.combo, 1, "switching resets the combo, then counts the new hit");
  assert.strictEqual(G.switches, 1);
  assert.strictEqual(E.key(G, "p"), true, "back to apple with its next letter");
  assert.strictEqual(G.target, a.id);
  assert.strictEqual(a.prog, 3);
  assert.strictEqual(E.key(G, "z"), false, "no enemy wants z");
  assert.strictEqual(G.errors, 1);
  type(G, "le");
  assert.strictEqual(G.kills, 1);
  assert.strictEqual(b.prog, 1);
});

test("free: current target wins when two enemies want the same letter, else nearest", () => {
  const G = mk("free");
  const far = E.addEnemy(G, "normal", 50, 50, ["pear"]);
  const near = E.addEnemy(G, "normal", 600, 360, ["pig"]);
  E.key(G, "p");
  assert.strictEqual(G.target, near.id);
  const G2 = mk("free");
  const a = E.addEnemy(G2, "normal", 50, 50, ["apple"]);
  const p = E.addEnemy(G2, "normal", 600, 360, ["pig"]);
  type(G2, "ap");
  assert.strictEqual(a.prog, 2);
  E.key(G2, "p");
  assert.strictEqual(a.prog, 3, "locked apple takes the p");
  assert.strictEqual(p.prog, 0);
  assert.ok(far);
});

test("tank needs two words; score and combo multiplier", () => {
  const G = mk("classic");
  const t = E.addEnemy(G, "tank", 100, 100, ["elephant", "cat"]);
  assert.strictEqual(t.hp, 11);
  type(G, "elephant");
  assert.strictEqual(t.word, "cat");
  assert.strictEqual(t.prog, 0);
  assert.strictEqual(G.kills, 0);
  type(G, "cat");
  assert.strictEqual(G.kills, 1);
  // 9 hits x10 + hits 10 and 11 x11 + kill bonus 11*5
  assert.strictEqual(G.score, 90 + 22 + 55);
});

test("crate pickup and items", () => {
  const G = mk("classic");
  E.addCrate(G, "bomb", 400, 400);
  type(G, "bomb");
  assert.strictEqual(G.items.bomb, 1);
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
  G.items.medkit = 1; G.hp = 50; E.useItem(G, "medkit");
  assert.strictEqual(G.hp, 85);
});

test("biting hurts, shield blocks, freeze stops, game ends at 0 hp", () => {
  const G = mk("classic");
  G.toSpawn = 0; G.resting = true; G.rest = 9999;
  E.addEnemy(G, "normal", 640, 400, ["dog"]);
  for (let i = 0; i < 60; i++) E.step(G, 0.05);
  assert.ok(G.hp < 100, "bitten");
  const hp = G.hp;
  G.items.shield = 1; E.useItem(G, "shield");
  for (let i = 0; i < 60; i++) E.step(G, 0.05);
  assert.strictEqual(G.hp, hp, "shield blocks");
  G.shieldT = 0; G.items.freeze = 1; E.useItem(G, "freeze");
  for (let i = 0; i < 60; i++) E.step(G, 0.05);
  assert.strictEqual(G.hp, hp, "frozen enemies do not bite");
  for (let i = 0; i < 20000 && !G.over; i++) E.step(G, 0.05);
  assert.ok(G.over);
  assert.strictEqual(G.hp, 0);
  assert.strictEqual(E.key(G, "d"), false);
});

test("bot plays 3 difficulties x 2 modes: waves advance, words stay valid", () => {
  for (const diff of ["easy", "normal", "hard"]) for (const mode of ["classic", "free"]) {
    const G = mk(mode, { diff, seed: 99, topic: window.TS_WORDS.topics.S2.words.split(" ") });
    let clash = 0, checks = 0, acc = 0;
    for (let i = 0; i < 60 * 240 && !G.over; i++) {
      E.step(G, 1 / 60);
      acc += 1 / 60;
      if (acc >= 0.12) { // ~100 WPM bot
        acc = 0;
        const t = E.ent(G, G.target) || G.ents.slice().sort((a, b) => Math.hypot(a.x - G.px, a.y - G.py) - Math.hypot(b.x - G.px, b.y - G.py))[0];
        if (t) E.key(G, t.word[t.prog]);
      }
      if (i % 60 === 0) {
        const firsts = G.ents.map((e) => e.word[0]);
        checks++; if (new Set(firsts).size !== firsts.length) clash++;
        for (const e of G.ents) assert.ok(/^[a-z]+$/.test(e.word) && e.prog < e.word.length && e.hp > 0, "bad entity " + JSON.stringify(e));
      }
      G.ev.length = 0;
    }
    const s = E.stats(G);
    assert.ok(G.wave >= 4, `${diff}/${mode} reached wave ${G.wave}`);
    assert.strictEqual(G.errors, 0);
    assert.ok(clash / checks < 0.1, `first-letter clashes ${clash}/${checks}`);
    console.log(`    ${diff}/${mode}: wave ${G.wave}, kills ${G.kills}, score ${G.score}, wpm ${s.wpm.toFixed(0)}, hp ${G.hp}, clashes ${clash}/${checks}`);
  }
});

console.log(n + " tests passed");
