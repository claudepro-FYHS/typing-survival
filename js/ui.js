/* =====================================================================
 *  Typing Survival — screens, keyboard input, HUD, main loop.
 *  Browser storage keys all start with "tsv_".
 * ===================================================================== */
(function () {
  "use strict";
  const E = window.TSEngine, RD = window.TSRender, $ = (s) => document.querySelector(s);
  const GRADES = [["J1", "初一"], ["J2", "初二"], ["J3", "初三"], ["S1", "高一"], ["S2", "高二"], ["S3", "高三"]];
  const MODES = { classic: "傳統模式", free: "自由模式" };
  const DIFFS = { easy: "簡單", normal: "普通", hard: "困難" };
  const ITEM_NAME = { bomb: "炸彈", freeze: "冰凍", medkit: "醫療包", shield: "護盾" };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem("tsv_" + k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem("tsv_" + k, JSON.stringify(v)); } catch (e) {} };

  const S = { prefs: load("prefs", { mode: "free", diff: "normal", grade: "J2" }), G: null, paused: false, screen: "menu", last: 0, hintT: 0 };
  const cv = $("#cv"), ctx = cv.getContext("2d");

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
    $("#best").textContent = b ? `最佳紀錄：${b.score.toLocaleString()} 分 · 第 ${b.wave} 波 · ${Math.round(b.wpm)} WPM` : "最佳紀錄：還沒有";
  }

  /* ---------- game ---------- */
  function wordsFor(grade) {
    const W = window.TS_WORDS, senior = grade[0] === "S";
    return { words: (W.general + (senior ? " " + W.advanced : "")).split(" "), topic: W.topics[grade] ? W.topics[grade].words.split(" ") : [] };
  }
  function start(seed) {
    const b = wordsFor(S.prefs.grade);
    S.G = E.createGame({ mode: S.prefs.mode, diff: S.prefs.diff, words: b.words, topic: b.topic, seed });
    S.paused = false; RD.reset();
    $("#hud-mode").textContent = MODES[S.prefs.mode] + " · " + DIFFS[S.prefs.diff];
    show("game");
  }
  function finish() {
    if (!S.G || !S.G.over || S.screen === "result") return;
    const G = S.G, st = E.stats(G), key = "best_" + G.mode + "_" + G.diff, old = load(key, null);
    const isBest = !old || st.score > old.score;
    if (isBest) save(key, { score: st.score, wave: st.wave, wpm: st.wpm, acc: st.acc, at: Date.now() });
    $("#res-title").textContent = isBest && st.score > 0 ? "新紀錄！" : "遊戲結束";
    $("#res-score").textContent = st.score.toLocaleString();
    $("#res-grid").innerHTML = [["波數", st.wave], ["擊倒", st.kills], ["WPM", Math.round(st.wpm)], ["準確率", Math.round(st.acc * 100) + "%"], ["最高連擊", st.maxCombo], ["時間", fmtTime(st.time)]]
      .map(([a, b]) => `<div><b>${b}</b><span>${a}</span></div>`).join("");
    $("#res-sub").textContent = MODES[G.mode] + " · " + DIFFS[G.diff] + (old && !isBest ? ` · 最佳 ${old.score.toLocaleString()}` : "");
    show("result");
    if (window.TSAccount) window.TSAccount.submit(G, st);
  }
  const fmtTime = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

  function hud() {
    const G = S.G, st = E.stats(G);
    $("#hp-fill").style.width = (G.hp / G.maxHp) * 100 + "%";
    $("#hp-fill").className = G.hp / G.maxHp < 0.3 ? "low" : "";
    $("#hp-num").textContent = Math.ceil(G.hp);
    $("#hud-wave").textContent = G.wave ? "第 " + G.wave + " 波" : "準備";
    $("#hud-left").textContent = G.resting ? "下一波即將開始" : "剩餘 " + (G.toSpawn + E.enemies(G).length) + " 隻 · " + fmtTime(G.t);
    $("#hud-score").textContent = G.score.toLocaleString();
    $("#hud-kills").textContent = "擊倒 " + G.kills;
    const cb = $("#hud-combo");
    cb.style.opacity = G.combo >= 5 ? 1 : 0;
    cb.firstChild.textContent = "x" + G.combo;
    $("#hud-mult").textContent = "得分 ×" + E.mult(G).toFixed(1);
    $("#hud-wpm").textContent = Math.round(st.wpm);
    $("#hud-acc").textContent = Math.round(st.acc * 100) + "%";
    E.ITEMS.forEach((name, i) => {
      const el = $("#slot-" + name), n = G.items[name];
      el.classList.toggle("empty", !n); el.querySelector(".q").textContent = n;
      const act = (name === "freeze" && G.freezeT > 0) || (name === "shield" && G.shieldT > 0);
      el.classList.toggle("active", act);
    });
    const hint = $("#hint");
    hint.classList.toggle("on", performance.now() < S.hintT);
  }
  function hintMsg(msg) { $("#hint").textContent = msg; S.hintT = performance.now() + 2500; }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - S.last) / 1000 || 0); S.last = now;
    if (!S.G || (S.screen !== "game" && S.screen !== "pause")) return;
    if (S.screen === "game") E.step(S.G, dt);
    RD.draw(ctx, S.G, now / 1000);
    const over = S.G.ev.some((e) => e.e === "over");
    S.G.ev.length = 0;
    hud();
    if (over) setTimeout(finish, 900);
  }

  /* ---------- input ---------- */
  addEventListener("keydown", (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (S.screen === "game" || S.screen === "pause") {
      if (ev.key === "Escape") { show(S.screen === "game" ? "pause" : "game"); ev.preventDefault(); return; }
      if (S.screen !== "game" || S.G.over) return;
      if (ev.isComposing || ev.key === "Process" || ev.keyCode === 229) { hintMsg("請切換到英文輸入法"); return; }
      if (/^[1-4]$/.test(ev.key)) { E.useItem(S.G, E.ITEMS[+ev.key - 1]); ev.preventDefault(); return; }
      if (/^[a-zA-Z]$/.test(ev.key)) {
        if (ev.getModifierState && ev.getModifierState("CapsLock")) hintMsg("Caps Lock 開著");
        E.key(S.G, ev.key.toLowerCase()); ev.preventDefault();
      }
    } else if (ev.key === "Enter" && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(ev.target.tagName)) {
      if (S.screen === "menu" || S.screen === "result") start();
    }
  });
  addEventListener("blur", () => { if (S.screen === "game") show("pause"); });

  $("#btn-start").onclick = () => start();
  $("#btn-again").onclick = () => start();
  $("#btn-menu").onclick = () => { renderMenu(); show("menu"); };
  $("#btn-resume").onclick = () => show("game");
  $("#btn-quit").onclick = () => { S.G = null; renderMenu(); show("menu"); };

  window.TSUI = { S, $, show, renderMenu, MODES, DIFFS };
  renderMenu(); show("menu");
  requestAnimationFrame(frame);
  window.__TSV = { S, start, finish };   // for tests
})();
