/* =====================================================================
 *  Typing Survival — screens, keyboard input, HUD, main loop.
 *  A game runs in one of three roles:
 *    solo  – rules run here, in the animation frame
 *    host  – rules run here on a timer (keeps going in a background tab)
 *            and room.js sends snapshots to the guests
 *    guest – no rules here: keys go to the host, pictures come back
 *  Browser storage keys all start with "tsv_".
 * ===================================================================== */
(function () {
  "use strict";
  const E = window.TSEngine, RD = window.TSRender, $ = (s) => document.querySelector(s);
  const GRADES = [["J1", "初一"], ["J2", "初二"], ["J3", "初三"], ["S1", "高一"], ["S2", "高二"], ["S3", "高三"]];
  const MODES = { classic: "傳統模式", free: "自由模式" };
  const DIFFS = { easy: "簡單", normal: "普通", hard: "困難" };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem("tsv_" + k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem("tsv_" + k, JSON.stringify(v)); } catch (e) {} };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const S = { prefs: load("prefs", { mode: "free", diff: "normal", grade: "J2" }), G: null, role: "solo", me: "p0", rq: [], screen: "menu", last: 0, hintT: 0, timer: 0, ended: false };
  const cv = $("#cv"), ctx = cv.getContext("2d");
  const multi = () => S.role !== "solo";
  const room = () => window.TSRoom;

  /* ---------- layout: a fixed 1280x720 stage scaled to the window ---------- */
  function fit() {
    const k = Math.min(innerWidth / 1280, innerHeight / 720);
    $("#stage").style.transform = `translate(-50%,-50%) scale(${k})`;
  }
  addEventListener("resize", fit); fit();

  function show(name) {
    S.screen = name;
    for (const el of document.querySelectorAll(".screen")) el.classList.toggle("on", el.id === "scr-" + name);
    $("#hud").classList.toggle("on", name === "game" || name === "pause");
  }

  /* ---------- menu ---------- */
  function seg(el, map, key) {
    el.innerHTML = Object.keys(map).map((k) => `<button data-v="${k}" class="${S.prefs[key] === k ? "sel" : ""}">${map[k]}</button>`).join("");
    el.onclick = (ev) => { const b = ev.target.closest("button"); if (!b) return; S.prefs[key] = b.dataset.v; save("prefs", S.prefs); renderMenu(); };
  }
  function topicName(g) { const t = window.TS_WORDS.topics[g]; return t ? "一般單字 + " + t.name : "一般單字"; }
  function renderMenu() {
    const A = window.TSAccount, locked = A ? A.lockedGrade() : "";
    if (A) A.renderAcct();
    if (locked && Object.fromEntries(GRADES)[locked]) S.prefs.grade = locked;   // school students get their own grade's words
    seg($("#seg-mode"), MODES, "mode"); seg($("#seg-diff"), DIFFS, "diff"); seg($("#seg-grade"), Object.fromEntries(GRADES), "grade");
    $("#row-grade").classList.toggle("locked", !!locked);
    $("#mode-desc").textContent = S.prefs.mode === "free"
      ? "打到一半可以隨時改打別的喪屍，已打的進度會保留。換目標時連擊歸零。"
      : "打了第一個字母就鎖定那隻喪屍，必須把它的字打完。";
    $("#bank-desc").textContent = "詞庫：" + topicName(S.prefs.grade);
    const b = load("best_" + S.prefs.mode + "_" + S.prefs.diff, null);
    $("#best").textContent = b ? `單人最佳紀錄：${b.score.toLocaleString()} 分 · 第 ${b.wave} 波 · ${Math.round(b.wpm)} WPM` : "單人最佳紀錄：還沒有";
  }
  function settingsText(s) { return MODES[s.mode] + " · " + DIFFS[s.diff] + " · " + (Object.fromEntries(GRADES)[s.grade] || s.grade) + "詞庫"; }

  /* ---------- starting and stopping ---------- */
  function wordsFor(grade) {
    const W = window.TS_WORDS, senior = grade[0] === "S";
    return { words: (W.general + (senior ? " " + W.advanced : "")).split(" "), topic: W.topics[grade] ? W.topics[grade].words.split(" ") : [] };
  }
  function begin(role, me) {
    stopGame();
    S.role = role; S.me = me; S.rq = []; S.ended = false; RD.reset();
    $("#hud").classList.toggle("multi", role !== "solo");
    $("#btn-resume").textContent = "繼續";
    $("#pause-title").textContent = role === "solo" ? "暫停" : "選單";
    $("#btn-quit").textContent = role === "solo" ? "回主畫面" : "離開房間";
    $("#pause-note").textContent = role === "solo" ? "" : "多人遊戲不會暫停。" + (role === "host" ? "你是房主，離開的話這場遊戲會結束。" : "");
    show("game");
  }
  // what the signed-in player chose in the shop (character, skin, scene, weapon)
  function myEquip() { const N = window.TSNet; return N && N.token && N.player && N.player.equip ? N.player.equip : window.TS_SHOP.DEFAULT; }
  function start(seed) {                                   // solo
    const b = wordsFor(S.prefs.grade), eq = myEquip();
    begin("solo", "p0");
    S.G = E.createGame({ mode: S.prefs.mode, diff: S.prefs.diff, words: b.words, topic: b.topic, seed, scene: eq.scene,
      players: [{ pid: "p0", name: "", look: { char: eq.char, skin: eq.skin, weapon: eq.weapon } }] });
    $("#hud-mode").textContent = MODES[S.prefs.mode] + " · " + DIFFS[S.prefs.diff];
  }
  function beginHost(players, st) {
    const b = wordsFor(st.grade);
    begin("host", "p0");
    S.G = E.createGame({ mode: st.mode, diff: st.diff, words: b.words, topic: b.topic, players, seed: st.seed, scene: st.scene });
    $("#hud-mode").textContent = MODES[st.mode] + " · " + DIFFS[st.diff] + " · " + players.length + " 人";
    let last = performance.now(), n = 0;
    S.timer = setInterval(() => {
      const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
      if (!S.G) return;
      for (let left = dt; left > 0.0001; left -= 0.05) E.step(S.G, Math.min(0.05, left));
      pump();
      if (++n % 2 === 0 || S.G.over) room().sync();
    }, 33);
  }
  function beginGuest(me, st, count) {
    begin("guest", me);
    S.G = null;
    $("#hud-mode").textContent = MODES[st.mode] + " · " + DIFFS[st.diff] + " · " + count + " 人";
  }
  function applySnap(snap, evs) { if (S.role !== "guest") return; S.G = snap; for (const e of evs || []) S.rq.push(e); }
  function stopGame() { if (S.timer) clearInterval(S.timer); S.timer = 0; S.G = null; S.rq = []; }
  // engine events go to the renderer, and (host) to the guests
  function pump() {
    const G = S.G; if (!G || !G.ev || !G.ev.length) return;
    const evs = G.ev.splice(0);
    for (const e of evs) S.rq.push(e);
    if (S.role === "host") room().queue(evs);
  }
  function hostInput(pid, msg) {
    if (S.role !== "host" || !S.G) return;
    if (msg.t === "k") E.key(S.G, String(msg.ch || ""), pid);
    else if (msg.t === "i") E.useItem(S.G, String(msg.name || ""), pid);
    else if (msg.t === "bye") E.leave(S.G, pid);
    pump(); room().sync(true);
  }

  /* ---------- results ---------- */
  const fmtTime = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  function finish() {
    const G = S.G;
    if (!G || !G.over || S.screen === "result") return;
    const st = E.stats(G, S.me);
    $("#res-upload").textContent = ""; $("#res-coins").innerHTML = "";
    if (multi()) {
      const rows = G.players.slice().sort((a, b) => b.score - a.score), total = rows.reduce((n, p) => n + p.score, 0);
      $("#res-title").textContent = "全隊倒下";
      $("#res-score").textContent = total.toLocaleString();
      $("#res-sub").textContent = `全隊總分 · 第 ${G.wave} 波 · ${fmtTime(G.t)} · ${MODES[G.mode]} · ${DIFFS[G.diff]}`;
      $("#res-grid").style.display = "none"; $("#res-team").style.display = "";
      $("#res-team").innerHTML = `<div class="tr th"><span></span><span>分數</span><span>WPM</span><span>準確率</span><span>救人</span></div>` + rows.map((p) => {
        const s = E.stats(G, p.pid);
        return `<div class="tr${p.pid === S.me ? " me" : ""}"><b><i style="background:${RD.PCOL[p.i % RD.PCOL.length]}"></i>${esc(p.name || "玩家")}${p.left ? "（已離開）" : ""}</b><span class="sc">${p.score.toLocaleString()}</span><span>${Math.round(s.wpm)}</span><span>${Math.round(s.acc * 100)}%</span><span>${p.revives}</span></div>`;
      }).join("");
      $("#res-upload").textContent = "多人連線的成績不進排行榜。";
      if (window.TSAccount) window.TSAccount.submitCoop(G, st);
      $("#btn-again").textContent = "回房間"; $("#btn-menu").textContent = "離開房間";
      if (S.timer) { clearInterval(S.timer); S.timer = 0; }
      show("result");
      return;
    }
    const key = "best_" + G.mode + "_" + G.diff, old = load(key, null), isBest = !old || st.score > old.score;
    if (isBest) save(key, { score: st.score, wave: st.wave, wpm: st.wpm, acc: st.acc, at: Date.now() });
    $("#res-title").textContent = isBest && st.score > 0 ? "新紀錄！" : "遊戲結束";
    $("#res-score").textContent = st.score.toLocaleString();
    $("#res-grid").style.display = ""; $("#res-team").style.display = "none";
    $("#res-grid").innerHTML = [["波數", st.wave], ["擊倒", st.kills], ["WPM", Math.round(st.wpm)], ["準確率", Math.round(st.acc * 100) + "%"], ["最高連擊", st.maxCombo], ["時間", fmtTime(st.time)]]
      .map(([a, b]) => `<div><b>${b}</b><span>${a}</span></div>`).join("");
    $("#res-sub").textContent = MODES[G.mode] + " · " + DIFFS[G.diff] + (old && !isBest ? ` · 最佳 ${old.score.toLocaleString()}` : "");
    $("#btn-again").textContent = "再玩一次"; $("#btn-menu").textContent = "回主畫面";
    show("result");
    if (window.TSAccount) window.TSAccount.submit(G, st);
  }

  /* ---------- HUD ---------- */
  function hud() {
    const G = S.G, P = E.player(G, S.me) || G.players[0], st = E.stats(G, P.pid);
    $("#hp-fill").style.width = (P.hp / P.maxHp) * 100 + "%";
    $("#hp-fill").className = P.hp / P.maxHp < 0.3 ? "low" : "";
    $("#hp-num").textContent = P.down ? "倒下" : Math.ceil(P.hp);
    $("#hp-num").style.color = P.hp / P.maxHp < 0.45 ? "#fff" : "";
    $("#hud-wave").textContent = G.wave ? "第 " + G.wave + " 波" : "準備";
    $("#hud-left").textContent = G.resting ? "下一波即將開始" : "剩餘 " + (G.toSpawn + E.enemies(G).length) + " 隻 · " + fmtTime(G.t);
    $("#hud-score").textContent = P.score.toLocaleString();
    $("#hud-kills").textContent = G.n > 1 ? "全隊 " + G.players.reduce((n, p) => n + p.score, 0).toLocaleString() : "擊倒 " + P.kills;
    const cb = $("#hud-combo");
    cb.style.opacity = P.combo >= 5 ? 1 : 0;
    cb.firstChild.textContent = "x" + P.combo;
    $("#hud-mult").textContent = "得分 ×" + E.mult(P).toFixed(1);
    $("#hud-wpm").textContent = Math.round(st.wpm);
    $("#hud-acc").textContent = Math.round(st.acc * 100) + "%";
    for (const name of E.ITEMS) {
      const el = $("#slot-" + name), n = P.items[name];
      el.classList.toggle("empty", !n); el.querySelector(".q").textContent = n;
      el.classList.toggle("active", (name === "freeze" && G.freezeT > 0) || (name === "shield" && P.shieldT > 0));
    }
    if (G.n > 1) {
      $("#teambox").innerHTML = G.players.filter((p) => p.pid !== P.pid).map((p) =>
        `<div class="mate${p.down ? " down" : ""}${p.left ? " left" : ""}"><i style="background:${RD.PCOL[p.i % RD.PCOL.length]}"></i><b>${esc(p.name || "玩家")}</b><span>${p.left ? "離開" : p.down ? "倒下" : p.score.toLocaleString()}</span><div class="mb"><u style="width:${p.left ? 0 : (p.hp / p.maxHp) * 100}%"></u></div></div>`).join("");
    }
    $("#hint").classList.toggle("on", performance.now() < S.hintT);
  }
  function hintMsg(msg) { $("#hint").textContent = msg; S.hintT = performance.now() + 2500; }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - S.last) / 1000 || 0); S.last = now;
    if (S.screen !== "game" && S.screen !== "pause") return;
    $("#waiting").style.display = S.G ? "none" : "";
    if (!S.G) return;
    if (S.role === "solo" && S.screen === "game") { E.step(S.G, dt); pump(); }
    RD.draw(ctx, S.G, now / 1000, S.rq.splice(0), S.me);
    hud();
    if (S.G.over && !S.ended) { S.ended = true; setTimeout(finish, 900); }
  }

  /* ---------- input ---------- */
  function act(msg) {
    if (S.role === "guest") return room().send(msg);
    if (msg.t === "k") E.key(S.G, msg.ch, S.me); else E.useItem(S.G, msg.name, S.me);
    pump();
    if (S.role === "host") room().sync(true);
  }
  addEventListener("keydown", (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (S.screen === "game" || S.screen === "pause") {
      if (ev.key === "Escape") { show(S.screen === "game" ? "pause" : "game"); ev.preventDefault(); return; }
      if (S.screen !== "game" || !S.G || S.G.over) return;
      if (ev.isComposing || ev.key === "Process" || ev.keyCode === 229) { hintMsg("請切換到英文輸入法"); return; }
      if (/^[1-4]$/.test(ev.key)) { act({ t: "i", name: E.ITEMS[+ev.key - 1] }); ev.preventDefault(); return; }
      if (/^[a-zA-Z]$/.test(ev.key)) {
        if (ev.getModifierState && ev.getModifierState("CapsLock")) hintMsg("Caps Lock 開著");
        act({ t: "k", ch: ev.key.toLowerCase() }); ev.preventDefault();
      }
    } else if (ev.key === "Enter" && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(ev.target.tagName)) {
      if (S.screen === "menu" || (S.screen === "result" && !multi())) start();
    }
  });
  addEventListener("blur", () => { if (S.screen === "game" && S.role === "solo") show("pause"); });

  function toMenu() { stopGame(); S.role = "solo"; renderMenu(); show("menu"); }
  $("#btn-start").onclick = () => start();
  $("#btn-again").onclick = () => (multi() ? room().backToLobby() : start());
  $("#btn-menu").onclick = () => (multi() ? room().leave() : toMenu());
  $("#btn-resume").onclick = () => show("game");
  $("#btn-quit").onclick = () => (multi() ? room().leave() : toMenu());

  window.TSUI = { S, $, esc, show, renderMenu, toMenu, settingsText, myEquip, beginHost, beginGuest, applySnap, hostInput, stopGame, MODES, DIFFS };
  renderMenu(); show("menu");
  requestAnimationFrame(frame);
  window.__TSV = { S, start, finish };   // for tests
})();
