/* =====================================================================
 *  Typing Survival — canvas drawing. Reads a game object G (engine.js)
 *  and its event list; keeps only visual state (particles, bullets …).
 * ===================================================================== */
(function () {
  "use strict";
  const W = 1280, H = 720, INK = "#1f2a33";
  const SKIN = {
    normal: { body: "#a9d86e", dark: "#7fb04a", shirt: "#5b7fa6" },
    runner: { body: "#e8dc7a", dark: "#c2b451", shirt: "#c9744a" },
    tank:   { body: "#b497e0", dark: "#8d6cc4", shirt: "#5a4a7a" },
  };
  const ITEM_COLOR = { bomb: "#ff8a3d", freeze: "#7fd8ff", medkit: "#ff6b81", shield: "#8be28b" };
  const R = { fx: [], bullets: [], floats: [], shake: 0, flash: 0, banner: null, ground: null, pulse: {} };

  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function blob(c, x, y, r, fill, lw) {
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = fill; c.fill();
    c.lineWidth = lw || 3; c.strokeStyle = INK; c.stroke();
  }

  /* ---------- ground (drawn once) ---------- */
  function makeGround() {
    const g = document.createElement("canvas"); g.width = W; g.height = H;
    const c = g.getContext("2d");
    let s = 12345; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    c.fillStyle = "#5c9f6a"; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 46; i++) {
      c.fillStyle = i % 2 ? "rgba(255,255,255,.045)" : "rgba(0,40,30,.06)";
      c.beginPath(); c.ellipse(rnd() * W, rnd() * H, 60 + rnd() * 120, 30 + rnd() * 60, rnd() * 3, 0, 7); c.fill();
    }
    // paths to the middle
    c.strokeStyle = "#d8c99a"; c.lineWidth = 86; c.lineCap = "round";
    c.beginPath(); c.moveTo(-40, 360); c.lineTo(W + 40, 360); c.moveTo(640, -40); c.lineTo(640, H + 40); c.stroke();
    c.strokeStyle = "rgba(120,100,60,.25)"; c.lineWidth = 2; c.setLineDash([14, 18]);
    c.beginPath(); c.moveTo(0, 360); c.lineTo(W, 360); c.moveTo(640, 0); c.lineTo(640, H); c.stroke(); c.setLineDash([]);
    c.fillStyle = "#e6d9ae"; c.beginPath(); c.arc(640, 360, 118, 0, 7); c.fill();
    c.strokeStyle = "rgba(120,100,60,.35)"; c.lineWidth = 4; c.beginPath(); c.arc(640, 360, 118, 0, 7); c.stroke();
    c.beginPath(); c.arc(640, 360, 78, 0, 7); c.stroke();
    // tufts, flowers, bushes
    for (let i = 0; i < 260; i++) {
      const x = rnd() * W, y = rnd() * H;
      if (Math.abs(y - 360) < 56 || Math.abs(x - 640) < 56) continue;
      c.strokeStyle = "rgba(30,80,50,.5)"; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x - 2, y - 7); c.moveTo(x, y); c.lineTo(x, y - 9); c.moveTo(x + 4, y); c.lineTo(x + 2, y - 7); c.stroke();
      if (i % 9 === 0) { c.fillStyle = ["#fff3b0", "#ffd1dc", "#ffffff"][i % 3]; c.beginPath(); c.arc(x + 9, y - 4, 3.2, 0, 7); c.fill(); }
    }
    for (const [x, y, r] of [[120, 110, 44], [1170, 130, 50], [150, 610, 48], [1140, 600, 42], [420, 120, 30], [880, 610, 32]]) {
      c.fillStyle = "rgba(0,0,0,.18)"; c.beginPath(); c.ellipse(x + 6, y + r * 0.7, r, r * 0.35, 0, 0, 7); c.fill();
      blob(c, x, y, r, "#3f8452"); blob(c, x - r * 0.45, y + r * 0.2, r * 0.62, "#4a9660"); blob(c, x + r * 0.5, y + r * 0.25, r * 0.55, "#4a9660");
    }
    return g;
  }

  /* ---------- characters ---------- */
  function drawZombie(c, G, e, t) {
    const k = SKIN[e.kind], r = e.r, dir = e.x < G.px ? 1 : -1, frozen = G.freezeT > 0;
    const wob = frozen ? 0 : Math.sin(t * (e.kind === "runner" ? 14 : 7) + e.id) * (e.biting ? 1 : 2.4);
    const lunge = e.biting && !frozen ? Math.max(0, Math.sin(t * 12 + e.id)) * 6 : 0;
    const ang = Math.atan2(G.py - e.y, G.px - e.x);
    const x = e.x + Math.cos(ang) * lunge, y = e.y + Math.sin(ang) * lunge + wob * 0.5;
    c.fillStyle = "rgba(0,0,0,.22)"; c.beginPath(); c.ellipse(e.x, e.y + r * 0.95, r * 0.95, r * 0.32, 0, 0, 7); c.fill();
    // feet
    c.fillStyle = k.dark; c.strokeStyle = INK; c.lineWidth = 3;
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(x + s * r * 0.42, y + r * 0.88 + (s * wob) / 2, r * 0.3, r * 0.2, 0, 0, 7); c.fill(); c.stroke(); }
    // body with shirt
    blob(c, x, y, r, k.body);
    c.save(); c.beginPath(); c.arc(x, y, r - 1.5, 0, 7); c.clip();
    c.fillStyle = k.shirt; c.fillRect(x - r, y + r * 0.42, r * 2, r);
    c.restore();
    c.beginPath(); c.arc(x, y, r, 0, 7); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
    // arms reaching for the player
    c.lineCap = "round";
    for (const s of [-0.28, 0.34]) {
      const ax = x + dir * r * 0.75, ay = y + r * s + wob * 0.4;
      c.strokeStyle = INK; c.lineWidth = r * 0.42 + 4; c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax + dir * r * 0.75, ay - 2); c.stroke();
      c.strokeStyle = k.body; c.lineWidth = r * 0.42; c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax + dir * r * 0.75, ay - 2); c.stroke();
    }
    // face
    const ex = x + dir * r * 0.22, ey = y - r * 0.2;
    for (const s of [-1, 1]) {
      const er = r * (s === dir ? 0.3 : 0.24);
      blob(c, ex + s * r * 0.34, ey, er, "#fff", 2.5);
      c.fillStyle = INK; c.beginPath(); c.arc(ex + s * r * 0.34 + dir * er * 0.35, ey + 1, er * 0.42, 0, 7); c.fill();
    }
    const open = e.biting && !frozen ? 0.5 + 0.5 * Math.sin(t * 12 + e.id) : 0.25;
    c.fillStyle = "#5a2a3a"; c.strokeStyle = INK; c.lineWidth = 2.5;
    c.beginPath(); c.ellipse(ex, y + r * 0.3, r * 0.34, r * (0.08 + 0.2 * open), 0, 0, 7); c.fill(); c.stroke();
    c.fillStyle = "#fff"; c.fillRect(ex - r * 0.2, y + r * 0.3 - r * (0.08 + 0.2 * open) + 1, r * 0.14, r * 0.12); c.fillRect(ex + r * 0.06, y + r * 0.3 - r * (0.08 + 0.2 * open) + 1, r * 0.14, r * 0.12);
    if (e.kind === "tank") { // stitches + hair tuft
      c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - r * 0.5, y - r * 0.62); c.lineTo(x - r * 0.1, y - r * 0.72);
      c.moveTo(x - r * 0.42, y - r * 0.75); c.lineTo(x - r * 0.36, y - r * 0.55); c.moveTo(x - r * 0.24, y - r * 0.8); c.lineTo(x - r * 0.2, y - r * 0.6); c.stroke();
    }
    if (e.kind === "runner") { c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 3, y - r); c.lineTo(x - dir * 5, y - r - 7); c.moveTo(x + 3, y - r); c.lineTo(x + 3 - dir * 4, y - r - 6); c.stroke(); }
    if (frozen) { c.fillStyle = "rgba(150,225,255,.5)"; c.beginPath(); c.arc(x, y, r + 5, 0, 7); c.fill(); c.strokeStyle = "rgba(255,255,255,.9)"; c.lineWidth = 2; c.stroke(); }
  }

  function drawPlayer(c, G, t, aim) {
    const x = G.px, y = G.py, dir = Math.cos(aim) >= 0 ? 1 : -1, bob = Math.sin(t * 4) * 1.5;
    c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(x, y + 24, 24, 8, 0, 0, 7); c.fill();
    c.fillStyle = "#34495e"; c.strokeStyle = INK; c.lineWidth = 3;
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(x + s * 9, y + 22, 8, 5, 0, 0, 7); c.fill(); c.stroke(); }
    blob(c, x, y + 6 + bob, 17, "#ffb84d");                   // hoodie
    blob(c, x, y - 12 + bob, 15, "#ffd9b3");                  // head
    c.fillStyle = "#3d7bd9"; c.strokeStyle = INK;             // cap
    c.beginPath(); c.arc(x, y - 15 + bob, 15, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
    rr(c, x + (dir > 0 ? 4 : -22), y - 18 + bob, 18, 6, 3); c.fill(); c.stroke();
    c.fillStyle = INK; for (const s of [-1, 1]) { c.beginPath(); c.arc(x + dir * 3 + s * 5.5, y - 9 + bob, 2.2, 0, 7); c.fill(); }
    // keyboard blaster, pointing at the target
    c.save(); c.translate(x, y + 6 + bob); c.rotate(aim);
    c.fillStyle = "#e9eef2"; c.strokeStyle = INK; c.lineWidth = 3; rr(c, 12, -8, 30, 16, 4); c.fill(); c.stroke();
    c.fillStyle = "#9aa7b1"; for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) c.fillRect(16 + i * 6, -5 + j * 6, 4, 4);
    c.fillStyle = "#ffd23f"; rr(c, 40, -4, 7, 8, 2); c.fill(); c.stroke();
    c.restore();
    if (G.shieldT > 0) {
      c.strokeStyle = "rgba(139,226,139,.95)"; c.lineWidth = 4; c.fillStyle = "rgba(139,226,139,.18)";
      c.beginPath(); c.arc(x, y, 44 + Math.sin(t * 8) * 2, 0, 7); c.fill(); c.stroke();
    }
  }

  function drawCrate(c, e, t) {
    const y = e.y + Math.sin(t * 3 + e.id) * 3, blink = e.ttl < 3 && Math.floor(t * 8) % 2;
    if (blink) return;
    c.fillStyle = "rgba(0,0,0,.22)"; c.beginPath(); c.ellipse(e.x, e.y + 20, 18, 6, 0, 0, 7); c.fill();
    c.fillStyle = "rgba(255,240,170,.35)"; c.beginPath(); c.arc(e.x, y, 30, 0, 7); c.fill();
    c.fillStyle = "#c9964a"; c.strokeStyle = INK; c.lineWidth = 3; rr(c, e.x - 16, y - 16, 32, 32, 5); c.fill(); c.stroke();
    c.fillStyle = ITEM_COLOR[e.item]; c.beginPath(); c.arc(e.x, y, 9, 0, 7); c.fill(); c.stroke();
  }

  /* ---------- word labels ---------- */
  function layoutLabels(c, G) {
    const out = [];
    for (const e of G.ents) {
      const big = e.kind === "tank", fs = big ? 23 : 20;
      c.font = `700 ${fs}px Consolas, "Cascadia Mono", monospace`;
      const cw = c.measureText("m").width + 1.5, w = cw * e.word.length + 18, h = fs + (big ? 16 : 10);
      out.push({ e, fs, cw, w, h, x: e.x - w / 2, y: e.y - e.r - h - (e.kind === "crate" ? 12 : 10) });
    }
    out.sort((a, b) => b.e.y - a.e.y);                    // nearest-to-bottom first, others move up
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < out.length; i++) for (let j = 0; j < i; j++) {
      const a = out[i], b = out[j];
      if (a.x < b.x + b.w + 4 && b.x < a.x + a.w + 4 && a.y < b.y + b.h + 3 && b.y < a.y + a.h + 3) a.y = b.y - a.h - 3;
    }
    for (const L of out) { L.x = Math.max(6, Math.min(W - L.w - 6, L.x)); L.y = Math.max(74, Math.min(H - L.h - 6, L.y)); }
    return out;
  }
  function drawLabel(c, G, L, t) {
    const e = L.e, isT = G.target === e.id, held = !isT && e.prog > 0, crate = e.kind === "crate";
    const p = R.pulse[e.id] ? Math.max(0, 1 - (t - R.pulse[e.id]) / 0.12) : 0;
    c.save();
    if (p) { c.translate(L.x + L.w / 2, L.y + L.h / 2); c.scale(1 + p * 0.12, 1 + p * 0.12); c.translate(-(L.x + L.w / 2), -(L.y + L.h / 2)); }
    if (isT) { c.shadowColor = "rgba(255,210,63,.9)"; c.shadowBlur = 16; }
    c.fillStyle = crate ? "rgba(70,50,8,.93)" : "rgba(14,20,24,.9)"; rr(c, L.x, L.y, L.w, L.h, 7); c.fill();
    c.shadowBlur = 0;
    c.lineWidth = isT ? 3 : 2; c.strokeStyle = isT ? "#ffd23f" : held ? "#d6ae36" : crate ? "#ffe9a3" : "rgba(255,255,255,.28)";
    if (held) c.setLineDash([6, 4]);
    c.stroke(); c.setLineDash([]);
    c.font = `700 ${L.fs}px Consolas, "Cascadia Mono", monospace`; c.textBaseline = "top"; c.textAlign = "left";
    for (let i = 0; i < e.word.length; i++) {
      const x = L.x + 9 + i * L.cw, y = L.y + 5;
      c.fillStyle = i < e.prog ? (isT ? "#ffd23f" : "#a8892b") : crate ? "#ffe9a3" : "#fff";
      if (i < e.prog && !isT) c.globalAlpha = 0.85;
      c.fillText(e.word[i], x, y); c.globalAlpha = 1;
      if (i === e.prog && (isT || held)) { c.fillStyle = isT ? "#ffd23f" : "#d6ae36"; c.fillRect(x, y + L.fs + 1, L.cw - 2, 2.5); }
    }
    if (e.kind === "tank") {
      c.fillStyle = "#3a2030"; rr(c, L.x + 8, L.y + L.h - 9, L.w - 16, 5, 2.5); c.fill();
      c.fillStyle = "#c89bff"; rr(c, L.x + 8, L.y + L.h - 9, Math.max(5, (L.w - 16) * e.hp / e.maxHp), 5, 2.5); c.fill();
    }
    c.restore();
  }

  /* ---------- events → effects ---------- */
  function consume(G, t) {
    for (const ev of G.ev) {
      if (ev.e === "shot") {
        R.bullets.push({ x: ev.x, y: ev.y, ch: ev.ch, t0: t });
        R.aim = Math.atan2(ev.y - G.py, ev.x - G.px); R.pulse[ev.id] = t;
      } else if (ev.e === "kill") {
        for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283, v = 60 + Math.random() * 80; R.fx.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, r: 9 + Math.random() * 9, t0: t, life: 0.5, col: "#fff" }); }
        for (let i = 0; i < 5; i++) { const a = Math.random() * 6.283; R.fx.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150 - 40, r: 5, t0: t, life: 0.6, col: "#ffe066", star: 1 }); }
        R.floats.push({ x: ev.x, y: ev.y - 20, txt: "+" + ev.bonus, t0: t, col: "#fff3b0" });
      } else if (ev.e === "bite") {
        if (ev.blocked) continue;
        R.shake = 0.25; R.flash = 0.35; R.floats.push({ x: G.px + (Math.random() * 40 - 20), y: G.py - 50, txt: "-" + ev.dmg, t0: t, col: "#ff6b6b" });
      } else if (ev.e === "miss") R.missT = t;
      else if (ev.e === "pickup") R.floats.push({ x: ev.x, y: ev.y - 24, txt: "+ " + ev.item, t0: t, col: ITEM_COLOR[ev.item] });
      else if (ev.e === "wave") R.banner = { txt: "第 " + ev.wave + " 波", t0: t };
      else if (ev.e === "waveClear") R.floats.push({ x: 640, y: 250, txt: "过关奖励 +" + ev.bonus, t0: t, col: "#fff3b0", big: 1 });
      else if (ev.e === "item" && ev.item === "bomb") R.boom = t;
    }
  }

  function draw(c, G, t) {
    if (!R.ground) R.ground = makeGround();
    consume(G, t);
    c.save();
    if (R.shake > 0) { R.shake -= 1 / 60; c.translate((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9); }
    c.drawImage(R.ground, 0, 0);
    if (G.freezeT > 0) { c.fillStyle = "rgba(160,225,255,.16)"; c.fillRect(0, 0, W, H); }

    const tgt = TSEngine.ent(G, G.target);
    if (tgt) R.aim = Math.atan2(tgt.y - G.py, tgt.x - G.px);
    const list = G.ents.slice().sort((a, b) => a.y - b.y);
    let playerDrawn = false;
    for (const e of list) {
      if (!playerDrawn && e.y > G.py) { drawPlayer(c, G, t, R.aim || 0); playerDrawn = true; }
      if (e.kind === "crate") drawCrate(c, e, t); else drawZombie(c, G, e, t);
    }
    if (!playerDrawn) drawPlayer(c, G, t, R.aim || 0);

    // letter bullets
    R.bullets = R.bullets.filter((b) => t - b.t0 < 0.1);
    for (const b of R.bullets) {
      const k = (t - b.t0) / 0.1, x = G.px + (b.x - G.px) * k, y = G.py + (b.y - G.py) * k;
      c.strokeStyle = "rgba(255,225,110,.75)"; c.lineWidth = 5; c.lineCap = "round";
      c.beginPath(); c.moveTo(G.px + (b.x - G.px) * Math.max(0, k - 0.35), G.py + (b.y - G.py) * Math.max(0, k - 0.35)); c.lineTo(x, y); c.stroke();
      c.font = "800 20px Consolas, monospace"; c.textAlign = "center"; c.textBaseline = "middle";
      c.lineWidth = 4; c.strokeStyle = INK; c.strokeText(b.ch, x, y); c.fillStyle = "#ffd23f"; c.fillText(b.ch, x, y);
    }
    // poofs and stars
    R.fx = R.fx.filter((p) => t - p.t0 < p.life);
    for (const p of R.fx) {
      const k = (t - p.t0) / p.life, x = p.x + p.vx * k * p.life, y = p.y + p.vy * k * p.life;
      c.globalAlpha = 1 - k; c.fillStyle = p.col;
      if (p.star) { c.save(); c.translate(x, y); c.rotate(k * 5); c.fillRect(-p.r, -2, p.r * 2, 4); c.fillRect(-2, -p.r, 4, p.r * 2); c.restore(); }
      else { c.beginPath(); c.arc(x, y, p.r * (1 - k * 0.5), 0, 7); c.fill(); }
      c.globalAlpha = 1;
    }
    if (R.boom && t - R.boom < 0.45) {
      const k = (t - R.boom) / 0.45;
      c.strokeStyle = `rgba(255,170,60,${1 - k})`; c.lineWidth = 16 * (1 - k) + 2; c.beginPath(); c.arc(G.px, G.py, TSEngine.BOMB_RADIUS * k, 0, 7); c.stroke();
      c.fillStyle = `rgba(255,240,200,${0.5 * (1 - k)})`; c.fill();
    }

    for (const L of layoutLabels(c, G).reverse()) if (G.target !== L.e.id) drawLabel(c, G, L, t);
    for (const L of layoutLabels(c, G)) if (G.target === L.e.id) drawLabel(c, G, L, t);

    R.floats = R.floats.filter((f) => t - f.t0 < 0.9);
    for (const f of R.floats) {
      const k = (t - f.t0) / 0.9;
      c.globalAlpha = 1 - k * k; c.font = `800 ${f.big ? 30 : 20}px "Trebuchet MS", "Microsoft YaHei", sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
      c.lineWidth = 5; c.strokeStyle = INK; c.strokeText(f.txt, f.x, f.y - k * 34); c.fillStyle = f.col; c.fillText(f.txt, f.x, f.y - k * 34);
      c.globalAlpha = 1;
    }
    c.restore();

    if (R.flash > 0) { R.flash -= 1 / 60; }
    const low = G.hp / G.maxHp < 0.3 ? 0.25 + 0.12 * Math.sin(t * 6) : 0, red = Math.max(low, R.flash);
    if (red > 0) {
      const g = c.createRadialGradient(640, 360, 260, 640, 360, 760);
      g.addColorStop(0, "rgba(255,40,40,0)"); g.addColorStop(1, `rgba(255,40,40,${red})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    if (R.banner && t - R.banner.t0 < 1.6) {
      const k = (t - R.banner.t0) / 1.6, a = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
      c.globalAlpha = a; c.font = '800 64px "Trebuchet MS", "Microsoft YaHei", sans-serif'; c.textAlign = "center"; c.textBaseline = "middle";
      c.lineWidth = 10; c.strokeStyle = INK; c.strokeText(R.banner.txt, 640, 210); c.fillStyle = "#fff"; c.fillText(R.banner.txt, 640, 210);
      c.globalAlpha = 1;
    }
  }
  function reset() { R.fx = []; R.bullets = []; R.floats = []; R.shake = 0; R.flash = 0; R.banner = null; R.pulse = {}; R.aim = 0; R.boom = 0; R.missT = 0; }

  window.TSRender = { draw, reset, state: R, ITEM_COLOR };
})();
