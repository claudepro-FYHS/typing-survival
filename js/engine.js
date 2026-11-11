/* =====================================================================
 *  Typing Survival — game rules (no DOM; runs in the browser and in Node)
 *  One authority owns a game object G: step(G, dt) advances time,
 *  key(G, ch) handles a typed letter, useItem(G, name) uses an item.
 *  Things that happened are pushed to G.ev for the renderer to consume.
 * ===================================================================== */
(function (root) {
  "use strict";

  const DIFF = {
    easy:   { speed: 0.7,  spawn: 1.35, bite: 0.6, len: [3, 5] },
    normal: { speed: 1.0,  spawn: 1.0,  bite: 1.0, len: [4, 6] },
    hard:   { speed: 1.25, spawn: 0.8,  bite: 1.4, len: [5, 8] },
  };
  const KIND = {
    normal: { speed: 36, r: 18, bite: 5 },
    runner: { speed: 70, r: 14, bite: 3 },
    tank:   { speed: 20, r: 29, bite: 10 },
    crate:  { speed: 0,  r: 16, bite: 0 },
  };
  const ITEMS = ["bomb", "freeze", "medkit", "shield"];
  const ITEM_MAX = 3, BOMB_RADIUS = 300, FREEZE_SEC = 5, SHIELD_SEC = 6, MEDKIT_HP = 35;
  const CRATE_CHANCE = 0.12, CRATE_TTL = 12;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function bucket(words) {
    const b = {};
    for (const w of words || []) if (/^[a-z]+$/.test(w)) (b[w.length] = b[w.length] || []).push(w);
    return b;
  }

  function createGame(o) {
    const G = {
      W: o.W || 1280, H: o.H || 720,
      mode: o.mode === "free" ? "free" : "classic",
      diff: DIFF[o.diff] ? o.diff : "normal",
      rnd: mulberry32(o.seed == null ? (Date.now() & 0xffffffff) : o.seed),
      general: bucket(o.words), topic: bucket(o.topic),
      t: 0, hp: 100, maxHp: 100, score: 0, combo: 0, maxCombo: 0, kills: 0,
      keys: 0, hits: 0, errors: 0, switches: 0,
      wave: 0, toSpawn: 0, spawnT: 0, resting: false, rest: 0,
      ents: [], nextId: 1, target: 0,
      items: { bomb: 0, freeze: 0, medkit: 0, shield: 0 },
      freezeT: 0, shieldT: 0, over: false, ev: [], keyStats: {},
    };
    G.D = DIFF[G.diff];
    G.px = G.W / 2; G.py = G.H / 2;
    return G;
  }

  const mult = (G) => 1 + Math.min(Math.floor(G.combo / 10), 20) * 0.1;
  const ent = (G, id) => G.ents.find((e) => e.id === id) || null;
  const dist = (G, e) => Math.hypot(e.x - G.px, e.y - G.py);
  const enemies = (G) => G.ents.filter((e) => e.kind !== "crate");
  function remove(G, e) {
    G.ents.splice(G.ents.indexOf(e), 1);
    if (G.target === e.id) G.target = 0;
  }

  /* ---------- words ---------- */
  function pickWord(G, lo, hi) {
    const used = new Set(G.ents.map((e) => e.word[0]));
    const onScreen = new Set(G.ents.map((e) => e.word));
    let fallback = null;
    for (let i = 0; i < 60; i++) {
      const src = G.rnd() < 0.4 ? G.topic : G.general;
      const len = lo + Math.floor(G.rnd() * (hi - lo + 1));
      const list = src[len] || G.general[len];
      if (!list || !list.length) continue;
      const w = list[Math.floor(G.rnd() * list.length)];
      if (onScreen.has(w)) continue;
      if (!used.has(w[0])) return w;
      fallback = fallback || w;
    }
    return fallback || "type";
  }

  /* ---------- spawning ---------- */
  function addEnemy(G, kind, x, y, words) {
    const e = {
      id: G.nextId++, kind, x, y, r: KIND[kind].r, word: words[0], words: words.slice(1), prog: 0,
      hp: words.reduce((n, w) => n + w.length, 0), biting: false, biteT: 0,
    };
    e.maxHp = e.hp;
    G.ents.push(e);
    return e;
  }
  function addCrate(G, item, x, y) {
    const e = { id: G.nextId++, kind: "crate", item, x, y, r: KIND.crate.r, word: item, words: [], prog: 0, hp: item.length, ttl: CRATE_TTL };
    G.ents.push(e);
    G.ev.push({ e: "crate", id: e.id, x, y, item });
    return e;
  }
  function spawn(G) {
    const w = G.wave, roll = G.rnd();
    const tankP = w >= 3 ? Math.min(0.05 + 0.01 * w, 0.15) : 0;
    const runP = Math.min(0.1 + 0.02 * w, 0.3);
    const kind = roll < tankP ? "tank" : roll < tankP + runP ? "runner" : "normal";
    const m = 34, side = Math.floor(G.rnd() * 4), u = G.rnd();
    const x = side === 0 ? -m : side === 1 ? G.W + m : u * G.W;
    const y = side === 2 ? -m : side === 3 ? G.H + m : u * G.H;
    const bonus = Math.min(Math.floor((w - 1) / 4), 2);
    const [lo, hi] = G.D.len;
    let words;
    if (kind === "runner") words = [pickWord(G, 3, G.diff === "easy" ? 3 : 4)];
    else if (kind === "tank") { words = [pickWord(G, 8, 12)]; G.ents.push({ word: words[0] }); words.push(pickWord(G, lo, hi)); G.ents.pop(); }
    else words = [pickWord(G, lo, hi + bonus)];
    return addEnemy(G, kind, x, y, words);
  }

  /* ---------- time ---------- */
  function step(G, dt) {
    if (G.over) return;
    G.t += dt;
    if (G.freezeT > 0) G.freezeT = Math.max(0, G.freezeT - dt);
    if (G.shieldT > 0) G.shieldT = Math.max(0, G.shieldT - dt);

    const alive = enemies(G).length;
    if (G.toSpawn === 0 && alive === 0) {
      if (!G.resting) {
        G.resting = true; G.rest = G.wave === 0 ? 1.5 : 3;
        if (G.wave > 0) { const bonus = 100 * G.wave; G.score += bonus; G.ev.push({ e: "waveClear", wave: G.wave, bonus }); }
      }
      G.rest -= dt;
      if (G.rest <= 0) {
        G.resting = false; G.wave++; G.toSpawn = 5 + 3 * G.wave; G.spawnT = 0;
        G.ev.push({ e: "wave", wave: G.wave });
      }
    } else if (G.toSpawn > 0) {
      G.spawnT -= dt;
      if (G.spawnT <= 0 && alive < Math.min(6 + G.wave, 14)) {
        spawn(G); G.toSpawn--;
        G.spawnT = Math.max(0.55, 2.2 - 0.12 * G.wave) * G.D.spawn * (0.7 + 0.6 * G.rnd());
      }
    }

    const speedUp = G.D.speed * (1 + 0.03 * (G.wave - 1));
    for (const e of G.ents.slice()) {
      if (e.kind === "crate") { e.ttl -= dt; if (e.ttl <= 0) remove(G, e); continue; }
      if (G.freezeT > 0) continue;
      const d = dist(G, e), stop = 30 + e.r;
      if (d > stop) {
        const v = Math.min(KIND[e.kind].speed * speedUp * dt, d - stop);
        e.x += ((G.px - e.x) / d) * v; e.y += ((G.py - e.y) / d) * v;
        e.biting = false;
      } else {
        if (!e.biting) { e.biting = true; e.biteT = 0.5; }
        e.biteT -= dt;
        if (e.biteT <= 0) {
          e.biteT = 1;
          const blocked = G.shieldT > 0;
          const dmg = blocked ? 0 : Math.max(1, Math.round(KIND[e.kind].bite * G.D.bite));
          G.hp -= dmg;
          G.ev.push({ e: "bite", id: e.id, dmg, blocked });
          if (G.hp <= 0) { G.hp = 0; G.over = true; G.ev.push({ e: "over" }); return; }
        }
      }
    }
  }

  /* ---------- typing ---------- */
  function nearest(G, list) {
    let best = null, bd = Infinity;
    for (const e of list) { const d = dist(G, e); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  function stat(G, ch, field) {
    const s = G.keyStats[ch] || (G.keyStats[ch] = { h: 0, m: 0 });
    s[field]++;
  }
  function miss(G, expected) {
    G.errors++; G.combo = 0;
    if (expected) stat(G, expected, "m");
    G.ev.push({ e: "miss" });
    return false;
  }
  function kill(G, e, how) {
    G.kills++;
    const bonus = e.maxHp * 5;
    G.score += bonus;
    remove(G, e);
    G.ev.push({ e: "kill", id: e.id, x: e.x, y: e.y, kind: e.kind, bonus, how: how || "typed" });
    if (G.rnd() < CRATE_CHANCE) {
      const item = ITEMS[Math.floor(G.rnd() * ITEMS.length)];
      const crates = G.ents.filter((c) => c.kind === "crate");
      const clash = G.ents.some((o) => o.word[0] === item[0]);
      if (crates.length < 2 && !clash) {
        addCrate(G, item, Math.max(90, Math.min(G.W - 90, e.x)), Math.max(150, Math.min(G.H - 150, e.y)));
      }
    }
  }
  function hit(G, e, ch) {
    e.prog++; G.hits++; G.combo++;
    if (G.combo > G.maxCombo) G.maxCombo = G.combo;
    stat(G, ch, "h");
    const gain = Math.round(10 * mult(G));
    G.score += gain;
    G.ev.push({ e: "shot", id: e.id, x: e.x, y: e.y, ch, gain });
    if (e.kind === "crate") {
      if (e.prog >= e.word.length) {
        G.items[e.item] = Math.min(ITEM_MAX, G.items[e.item] + 1);
        remove(G, e);
        G.ev.push({ e: "pickup", item: e.item, x: e.x, y: e.y });
      }
      return true;
    }
    e.hp--;
    if (e.hp <= 0) kill(G, e);
    else if (e.prog >= e.word.length) { e.word = e.words.shift(); e.prog = 0; G.ev.push({ e: "reword", id: e.id }); }
    return true;
  }
  function key(G, ch) {
    if (G.over || !/^[a-z]$/.test(ch)) return false;
    G.keys++;
    const t = ent(G, G.target);
    if (t && t.word[t.prog] === ch) return hit(G, t, ch);
    if (t && G.mode === "classic") return miss(G, t.word[t.prog]);
    const cand = nearest(G, G.ents.filter((e) => e !== t && e.word[e.prog] === ch));
    if (!cand) return miss(G, null);
    if (t) { G.combo = 0; G.switches++; G.ev.push({ e: "switch", from: t.id, to: cand.id }); }
    G.target = cand.id;
    return hit(G, cand, ch);
  }

  /* ---------- items ---------- */
  function useItem(G, name) {
    if (G.over || !(G.items[name] > 0)) return false;
    G.items[name]--;
    if (name === "bomb") {
      for (const e of enemies(G)) {
        if (dist(G, e) > BOMB_RADIUS) continue;
        if (e.kind === "tank" && e.words.length) {
          e.hp -= e.word.length - e.prog; e.word = e.words.shift(); e.prog = 0;
        } else kill(G, e, "bomb");
      }
    } else if (name === "freeze") G.freezeT = FREEZE_SEC;
    else if (name === "medkit") G.hp = Math.min(G.maxHp, G.hp + MEDKIT_HP);
    else if (name === "shield") G.shieldT = SHIELD_SEC;
    G.ev.push({ e: "item", item: name });
    return true;
  }

  function stats(G) {
    return {
      wpm: G.t > 0 ? G.hits / 5 / (G.t / 60) : 0,
      acc: G.keys ? G.hits / G.keys : 1,
      score: G.score, wave: G.wave, kills: G.kills, maxCombo: G.maxCombo, time: G.t,
    };
  }

  const API = { DIFF, KIND, ITEMS, BOMB_RADIUS, createGame, step, key, useItem, stats, mult, ent, addEnemy, addCrate, enemies };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.TSEngine = API;
})(typeof window !== "undefined" ? window : globalThis);
