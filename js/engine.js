/* =====================================================================
 *  Typing Survival — game rules (no DOM; runs in the browser and in Node)
 *  One authority (solo player or room host) owns a game object G:
 *  step(G, dt) advances time, key(G, ch, pid) handles a typed letter,
 *  useItem(G, name, pid) uses an item, leave(G, pid) drops a player.
 *  Things that happened are pushed to G.ev. snapshot(G) is the plain
 *  data a guest needs to draw the same picture.
 *
 *  Co-op rules: an enemy's health is its word length; every correct letter
 *  from any player is 1 damage, and each player has their own progress on
 *  the word. A player at 0 hp goes down and gets a word over their head:
 *  every teammate still standing must type it to bring them back.
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
    down:   { speed: 0,  r: 22, bite: 0 },
  };
  const ITEMS = ["bomb", "freeze", "medkit", "shield"];
  const ITEM_MAX = 3, BOMB_RADIUS = 300, FREEZE_SEC = 5, SHIELD_SEC = 6, MEDKIT_HP = 35;
  const CRATE_CHANCE = 0.12, CRATE_TTL = 12, REVIVE_HP = 50, MAX_PLAYERS = 6, RING = 54;
  // What each character starts with (shop.js describes them to the player). Nothing here adds score.
  const CHARS = {
    student: {},
    medic:   { item: "medkit", medkitHp: 50 },
    bomber:  { item: "bomb", bombR: 380 },
    froster: { item: "freeze", freezeSec: 7 },
    guard:   { item: "shield", maxHp: 120 },
    lucky:   { crate: 0.18 },
  };

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
    const list = (o.players && o.players.length ? o.players : [{ pid: "p0", name: "" }]).slice(0, MAX_PLAYERS);
    const G = {
      W: o.W || 1280, H: o.H || 720,
      mode: o.mode === "free" ? "free" : "classic",
      diff: DIFF[o.diff] ? o.diff : "normal",
      rnd: mulberry32(o.seed == null ? (Date.now() & 0xffffffff) : o.seed),
      general: bucket(o.words), topic: bucket(o.topic),
      t: 0, kills: 0, wave: 0, toSpawn: 0, spawnT: 0, resting: false, rest: 0,
      ents: [], nextId: 1, freezeT: 0, over: false, ev: [], n: list.length, scene: o.scene || "park",
    };
    G.D = DIFF[G.diff];
    G.players = list.map((p, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / list.length, r = list.length > 1 ? RING : 0;
      const look = p.look || {}, C = (!o.noAbilities && CHARS[look.char]) || CHARS.student;
      const P = {
        pid: p.pid, name: p.name || "", i, x: G.W / 2 + Math.cos(a) * r, y: G.H / 2 + Math.sin(a) * r,
        look: { char: look.char || "student", skin: look.skin || "", weapon: look.weapon || "keyboard" },
        hp: C.maxHp || 100, maxHp: C.maxHp || 100, down: false, left: false, shieldT: 0, target: 0,
        medkitHp: C.medkitHp || MEDKIT_HP, bombR: C.bombR || BOMB_RADIUS, freezeSec: C.freezeSec || FREEZE_SEC, crate: C.crate || CRATE_CHANCE,
        score: 0, combo: 0, maxCombo: 0, kills: 0, keys: 0, hits: 0, errors: 0, switches: 0, downs: 0, revives: 0,
        items: { bomb: 0, freeze: 0, medkit: 0, shield: 0 }, keyStats: {},
      };
      if (C.item) P.items[C.item] = 1;
      return P;
    });
    return G;
  }

  const mult = (P) => 1 + Math.min(Math.floor(P.combo / 10), 20) * 0.1;
  const ent = (G, id) => (id ? G.ents.find((e) => e.id === id) || null : null);
  const player = (G, pid) => G.players.find((p) => p.pid === pid) || null;
  const standing = (G) => G.players.filter((p) => !p.down && !p.left);
  const enemies = (G) => G.ents.filter((e) => e.kind !== "crate" && e.kind !== "down");
  const prog = (e, pid) => e.prog[pid] || 0;
  const scale = (G) => 1 + 0.6 * (G.n - 1);
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function remove(G, e) {
    const i = G.ents.indexOf(e);
    if (i >= 0) G.ents.splice(i, 1);
    for (const p of G.players) if (p.target === e.id) p.target = 0;
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
      id: G.nextId++, kind, x, y, r: KIND[kind].r, word: words[0], words: words.slice(1), prog: {}, dmg: {},
      hp: words.reduce((n, w) => n + w.length, 0), biting: false, biteT: 0, tp: "",
    };
    e.maxHp = e.hp;
    G.ents.push(e);
    return e;
  }
  function addCrate(G, item, x, y) {
    const e = { id: G.nextId++, kind: "crate", item, x, y, r: KIND.crate.r, word: item, words: [], prog: {}, dmg: {}, hp: item.length, maxHp: item.length, ttl: CRATE_TTL };
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
    else if (kind === "tank") {
      words = [pickWord(G, 8, 12)];
      for (let i = 0; i < (G.n >= 4 ? 2 : 1); i++) { G.ents.push({ word: words[words.length - 1] }); words.push(pickWord(G, lo, hi)); G.ents.pop(); }
    } else words = [pickWord(G, lo, hi + bonus)];
    return addEnemy(G, kind, x, y, words);
  }

  /* ---------- going down and coming back ---------- */
  function end(G) { if (!G.over) { G.over = true; G.ev.push({ e: "over" }); } }
  function knockDown(G, P) {
    P.hp = 0; P.down = true; P.target = 0; P.combo = 0; P.downs++;
    G.ev.push({ e: "down", pid: P.pid });
    if (!standing(G).length) return end(G);
    const e = { id: G.nextId++, kind: "down", pid: P.pid, x: P.x, y: P.y, r: KIND.down.r, word: pickWord(G, 4, 6), words: [], prog: {}, dmg: {}, hp: 0, maxHp: 0 };
    G.ents.push(e);
    checkRevives(G);
  }
  function checkRevives(G) {
    const up = standing(G);
    if (!up.length) return;
    for (const e of G.ents.filter((x) => x.kind === "down")) {
      if (!up.every((p) => prog(e, p.pid) >= e.word.length)) continue;
      const P = player(G, e.pid);
      remove(G, e);
      P.down = false; P.hp = REVIVE_HP; P.shieldT = 2;
      for (const p of up) { p.revives++; p.score += 100; }
      G.ev.push({ e: "revive", pid: P.pid, x: P.x, y: P.y });
    }
  }
  function leave(G, pid) {
    const P = player(G, pid);
    if (!P || P.left) return;
    P.left = true; P.target = 0;
    for (const e of G.ents.filter((x) => x.kind === "down" && x.pid === pid)) remove(G, e);
    G.ev.push({ e: "left", pid });
    if (!standing(G).length) return end(G);
    checkRevives(G);
  }

  /* ---------- time ---------- */
  function step(G, dt) {
    if (G.over) return;
    G.t += dt;
    if (G.freezeT > 0) G.freezeT = Math.max(0, G.freezeT - dt);
    for (const p of G.players) if (p.shieldT > 0) p.shieldT = Math.max(0, p.shieldT - dt);

    const alive = enemies(G).length, k = scale(G);
    if (G.toSpawn === 0 && alive === 0) {
      if (!G.resting) {
        G.resting = true; G.rest = G.wave === 0 ? 1.5 : 3;
        if (G.wave > 0) { const bonus = 100 * G.wave; for (const p of standing(G)) p.score += bonus; G.ev.push({ e: "waveClear", wave: G.wave, bonus }); }
      }
      G.rest -= dt;
      if (G.rest <= 0) {
        G.resting = false; G.wave++; G.toSpawn = Math.round((5 + 3 * G.wave) * k); G.spawnT = 0;
        G.ev.push({ e: "wave", wave: G.wave });
      }
    } else if (G.toSpawn > 0) {
      G.spawnT -= dt;
      if (G.spawnT <= 0 && alive < Math.min(6 + G.wave, 14) + 3 * (G.n - 1)) {
        spawn(G); G.toSpawn--;
        G.spawnT = (Math.max(0.55, 2.2 - 0.12 * G.wave) * G.D.spawn * (0.7 + 0.6 * G.rnd())) / k;
      }
    }

    const speedUp = G.D.speed * (1 + 0.03 * (G.wave - 1));
    for (const e of G.ents.slice()) {
      if (e.kind === "crate") { e.ttl -= dt; if (e.ttl <= 0) remove(G, e); continue; }
      if (e.kind === "down" || G.freezeT > 0) continue;
      let T = null, best = Infinity;
      for (const p of standing(G)) { const d = d2(e, p); if (d < best) { best = d; T = p; } }
      if (!T) return end(G);
      if (e.tp !== T.pid) { e.tp = T.pid; e.biting = false; }
      // "close enough" needs slack: walking to exactly `stop` leaves the distance a hair
      // above it (rounding), and such an enemy would creep forever and never bite.
      const stop = 30 + e.r;
      if (best > stop + 0.5) {
        const v = Math.min(KIND[e.kind].speed * speedUp * dt, best - stop);
        e.x += ((T.x - e.x) / best) * v; e.y += ((T.y - e.y) / best) * v;
        e.biting = false;
      } else {
        if (!e.biting) { e.biting = true; e.biteT = 0.5; }
        e.biteT -= dt;
        if (e.biteT <= 0) {
          e.biteT = 1;
          const blocked = T.shieldT > 0;
          const dmg = blocked ? 0 : Math.max(1, Math.round(KIND[e.kind].bite * G.D.bite));
          T.hp -= dmg;
          G.ev.push({ e: "bite", id: e.id, pid: T.pid, dmg, blocked });
          if (T.hp <= 0) { knockDown(G, T); if (G.over) return; }
        }
      }
    }
  }

  /* ---------- typing ---------- */
  function stat(P, ch, field) {
    const s = P.keyStats[ch] || (P.keyStats[ch] = { h: 0, m: 0 });
    s[field]++;
  }
  function miss(G, P, expected) {
    P.errors++; P.combo = 0;
    if (expected) stat(P, expected, "m");
    G.ev.push({ e: "miss", pid: P.pid });
    return false;
  }
  function kill(G, e, P, how) {
    G.kills++;
    if (P) P.kills++;
    for (const pid in e.dmg) { const p = player(G, pid); if (p) p.score += e.dmg[pid] * 5; }
    if (how === "bomb" && P) P.score += Math.max(0, e.hp) * 5;
    remove(G, e);
    G.ev.push({ e: "kill", id: e.id, x: e.x, y: e.y, kind: e.kind, bonus: e.maxHp * 5, how: how || "typed", pid: P ? P.pid : "" });
    if (G.rnd() < (P ? P.crate : CRATE_CHANCE)) {
      const item = ITEMS[Math.floor(G.rnd() * ITEMS.length)];
      const crates = G.ents.filter((c) => c.kind === "crate");
      const clash = G.ents.some((o) => o.word[0] === item[0]);
      if (crates.length < 2 && !clash) {
        addCrate(G, item, Math.max(90, Math.min(G.W - 90, e.x)), Math.max(150, Math.min(G.H - 150, e.y)));
      }
    }
  }
  function nextWord(G, e) {
    if (!e.words.length) return false;
    e.word = e.words.shift(); e.prog = {};
    G.ev.push({ e: "reword", id: e.id });
    return true;
  }
  function hit(G, P, e, ch) {
    e.prog[P.pid] = prog(e, P.pid) + 1; P.hits++; P.combo++;
    if (P.combo > P.maxCombo) P.maxCombo = P.combo;
    stat(P, ch, "h");
    const gain = Math.round(10 * mult(P));
    P.score += gain;
    G.ev.push({ e: "shot", pid: P.pid, id: e.id, x: e.x, y: e.y, ch, gain });
    const done = e.prog[P.pid] >= e.word.length;
    if (e.kind === "crate") {
      if (done) {
        P.items[e.item] = Math.min(ITEM_MAX, P.items[e.item] + 1);
        remove(G, e);
        G.ev.push({ e: "pickup", pid: P.pid, item: e.item, x: e.x, y: e.y });
      }
      return true;
    }
    if (e.kind === "down") {
      if (done) { P.target = 0; checkRevives(G); }
      return true;
    }
    e.hp--; e.dmg[P.pid] = (e.dmg[P.pid] || 0) + 1;
    if (e.hp <= 0) kill(G, e, P);
    else if (done && !nextWord(G, e)) kill(G, e, P);
    return true;
  }
  function key(G, ch, pid) {
    const P = pid ? player(G, pid) : G.players[0];
    if (G.over || !P || P.down || P.left || !/^[a-z]$/.test(ch)) return false;
    P.keys++;
    const t = ent(G, P.target);
    if (t && t.word[prog(t, P.pid)] === ch) return hit(G, P, t, ch);
    if (t && G.mode === "classic") return miss(G, P, t.word[prog(t, P.pid)]);
    let cand = null, best = Infinity;
    for (const e of G.ents) {
      if (e === t || e.word[prog(e, P.pid)] !== ch) continue;
      const d = d2(e, P);
      if (d < best) { best = d; cand = e; }
    }
    if (!cand) return miss(G, P, null);
    if (t) { P.combo = 0; P.switches++; G.ev.push({ e: "switch", pid: P.pid, from: t.id, to: cand.id }); }
    P.target = cand.id;
    return hit(G, P, cand, ch);
  }

  /* ---------- items ---------- */
  function useItem(G, name, pid) {
    const P = pid ? player(G, pid) : G.players[0];
    if (G.over || !P || P.down || P.left || !(P.items[name] > 0)) return false;
    P.items[name]--;
    if (name === "bomb") {
      for (const e of enemies(G)) {
        if (d2(e, P) > P.bombR) continue;
        if (e.kind === "tank" && e.words.length) {      // a bomb finishes the tank's current word
          const left = e.word.length - Math.max(0, ...Object.values(e.prog));
          e.hp -= Math.min(left, e.hp - 1); nextWord(G, e);
        } else kill(G, e, P, "bomb");
      }
    } else if (name === "freeze") G.freezeT = P.freezeSec;
    else if (name === "medkit") P.hp = Math.min(P.maxHp, P.hp + P.medkitHp);
    else if (name === "shield") P.shieldT = SHIELD_SEC;
    G.ev.push({ e: "item", pid: P.pid, item: name, x: P.x, y: P.y, r: P.bombR });
    return true;
  }

  function stats(G, pid) {
    const P = pid ? player(G, pid) : G.players[0];
    return {
      wpm: G.t > 0 ? P.hits / 5 / (G.t / 60) : 0,
      acc: P.keys ? P.hits / P.keys : 1,
      score: P.score, wave: G.wave, kills: P.kills, maxCombo: P.maxCombo, time: G.t,
      hits: P.hits, keys: P.keys, revives: P.revives, downs: P.downs,
    };
  }

  /* What a guest needs to draw the game (no word lists, no functions). */
  function snapshot(G) {
    const r1 = (v) => Math.round(v * 10) / 10;
    return {
      remote: true, W: G.W, H: G.H, mode: G.mode, diff: G.diff, n: G.n, scene: G.scene, t: r1(G.t), kills: G.kills, wave: G.wave,
      toSpawn: G.toSpawn, resting: G.resting, freezeT: r1(G.freezeT), over: G.over,
      players: G.players.map((p) => ({
        pid: p.pid, name: p.name, i: p.i, look: p.look, x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, down: p.down, left: p.left, shieldT: r1(p.shieldT),
        target: p.target, score: p.score, combo: p.combo, maxCombo: p.maxCombo, kills: p.kills, keys: p.keys, hits: p.hits,
        errors: p.errors, downs: p.downs, revives: p.revives, items: p.items,
      })),
      ents: G.ents.map((e) => ({
        id: e.id, kind: e.kind, x: r1(e.x), y: r1(e.y), r: e.r, word: e.word, prog: e.prog, hp: e.hp, maxHp: e.maxHp,
        biting: e.biting, tp: e.tp, item: e.item, ttl: e.ttl == null ? undefined : r1(e.ttl), pid: e.pid,
      })),
    };
  }

  const API = { DIFF, KIND, ITEMS, CHARS, BOMB_RADIUS, MAX_PLAYERS, createGame, step, key, useItem, leave, stats, snapshot, mult, ent, player, prog, standing, addEnemy, addCrate, enemies };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.TSEngine = API;
})(typeof window !== "undefined" ? window : globalThis);
