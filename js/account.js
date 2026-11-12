/* =====================================================================
 *  Typing Survival — sign-in, class/seat form, leaderboards, score upload.
 * ===================================================================== */
(function () {
  "use strict";
  const UI = window.TSUI, N = window.TSNet, $ = UI.$;
  const SCOPES = { class: "我的班級", grade: "我的年段", school: "全校", public: "公開榜" };
  const GRADE_NAME = { J1: "初一", J2: "初二", J3: "初三", S1: "高一", S2: "高二", S3: "高三" };
  const ERR = {
    network: "連不上伺服器，請稍後再試。", session_expired: "登入已過期，請重新登入。", server: "伺服器出錯，請稍後再試。",
    not_school: "目前只接受學校帳號登入。", bad_token: "Google 登入失敗，請再試一次。", no_client_id: "後台還沒設定 Google 登入。",
    bad_name: "請填寫姓名。", bad_class: "班級不正確，請再檢查。", bad_seat: "座號不正確。", bad_nick: "這個暱稱不能用，請換一個（2–12 個字，不能有空格）。",
    locked: "班級已經填過了，要改請找老師。", no_class: "要先填好班級才能看這個排行榜。", school_only: "這個排行榜只有學校帳號可以看。",
  };
  const msg = (r) => ERR[r && r.error] || ERR.server;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const B = { scope: "school", mode: "free", diff: "normal", req: 0 };

  function label(p) {
    if (p.teacher) return "老師 · " + p.name;
    if (p.school) return p.cls ? `${p.cls} · ${p.seat} 號 · ${p.name}` : p.name;
    return p.nick || "新玩家";
  }
  function gradeLabel(g) { return (GRADE_NAME[g.slice(0, 2)] || g.slice(0, 2)) + (g.length > 2 ? (g.slice(2) === "AC" ? " 文商" : g.slice(2) === "S" ? " 理" : " " + g.slice(2)) : ""); }
  function classCode(grade, n) { return /^J\d$/.test(grade) ? grade + String(n).padStart(2, "0") : grade + n; }

  /* ---------- account bar on the menu ---------- */
  function renderAcct() {
    const el = $("#acct");
    if (!N.enabled()) { el.style.display = "none"; $("#btn-board").style.display = "none"; return; }
    el.style.display = ""; $("#btn-board").style.display = "";
    if (N.token && N.player) {
      el.innerHTML = `<span class="who">${esc(label(N.player))}</span>` +
        (N.player.needsProfile ? `<button id="btn-fill">填寫資料</button>` : "") + `<button id="btn-logout">登出</button>`;
      $("#btn-logout").onclick = () => { N.logout(); UI.renderMenu(); };
      if ($("#btn-fill")) $("#btn-fill").onclick = openProfile;
    } else {
      el.innerHTML = `<div id="gbtn"></div><span class="tip" id="acct-tip">登入後成績才會上排行榜。不登入也可以玩。</span>`;
      drawGoogleButton();
    }
  }
  function lockedGrade() { return N.token && N.player && N.player.grade ? N.player.grade : ""; }

  /* ---------- Google sign-in ---------- */
  let gisState = 0; // 0 not loaded, 1 loading, 2 ready
  function drawGoogleButton() {
    const box = $("#gbtn");
    if (!box || !N.config || !N.config.clientId) return;
    if (window.__TSV_FAKE_API) { box.innerHTML = `<button id="btn-fake-login">Google 登入</button>`; return; }
    if (gisState === 2) { google.accounts.id.renderButton(box, { theme: "filled_blue", size: "large", text: "signin_with", locale: "zh-TW" }); return; }
    if (gisState === 1) return;
    gisState = 1;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => {
      google.accounts.id.initialize({ client_id: N.config.clientId, callback: (resp) => signIn(resp.credential), auto_select: false });
      gisState = 2; drawGoogleButton();
    };
    s.onerror = () => { gisState = 0; const t = $("#acct-tip"); if (t) t.textContent = "載入 Google 登入失敗，可以先不登入玩。"; };
    document.head.appendChild(s);
  }
  async function signIn(idToken) {
    const tip = $("#acct-tip"); if (tip) tip.textContent = "登入中…";
    const r = await N.login(idToken);
    if (!r || !r.ok) { UI.renderMenu(); const t = $("#acct-tip"); if (t) t.textContent = msg(r); return; }
    if (N.player.needsProfile) openProfile(); else UI.renderMenu();
  }

  /* ---------- class + seat (school) or nickname (other accounts) ---------- */
  function openProfile() {
    const p = N.player, c = N.config || {}, f = $("#profile-form");
    if (p.school) {
      $("#profile-title").textContent = (c.year || "") + " 學年資料";
      f.innerHTML = `
        <div class="row"><label>姓名</label><input id="pf-name" maxlength="30" value="${esc(p.name)}"></div>
        <div class="row"><label>年段</label><select id="pf-grade">${(c.grades || []).map((g) => `<option value="${esc(g)}">${esc(g)}　${esc(gradeLabel(g))}</option>`).join("")}</select></div>
        <div class="row"><label>班號</label><input id="pf-no" inputmode="numeric" maxlength="2" placeholder="例如 3"></div>
        <div class="row"><label>座號</label><input id="pf-seat" inputmode="numeric" maxlength="2" placeholder="例如 12"></div>
        <div class="preview">你的班級：<b id="pf-code">—</b><span>範例：初二 3 班 = J203｜高一理 2 班 = S1S2｜高一文商 1 班 = S1AC1</span></div>
        <div class="warn">儲存後自己不能再改，填錯要請老師修改。</div>`;
      const upd = () => { const n = parseInt($("#pf-no").value, 10); $("#pf-code").textContent = n > 0 ? classCode($("#pf-grade").value, n) : "—"; };
      $("#pf-grade").onchange = upd; $("#pf-no").oninput = upd;
    } else {
      $("#profile-title").textContent = "取一個暱稱";
      f.innerHTML = `
        <div class="row"><label>暱稱</label><input id="pf-nick" maxlength="12" value="${esc(p.nick)}" placeholder="2–12 個字"></div>
        <div class="warn">暱稱會顯示在公開排行榜上，請不要用真實姓名。</div>`;
    }
    $("#profile-err").textContent = "";
    UI.show("profile");
    const first = f.querySelector("input"); if (first) first.focus();
  }
  async function saveProfile() {
    const p = N.player, err = $("#profile-err"), btn = $("#btn-profile-save");
    const data = p.school
      ? { name: $("#pf-name").value, grade: $("#pf-grade").value, classNo: parseInt($("#pf-no").value, 10) || 0, seat: parseInt($("#pf-seat").value, 10) || 0 }
      : { nick: $("#pf-nick").value.trim() };
    btn.disabled = true; err.textContent = "儲存中…";
    const r = await N.saveProfile(data);
    btn.disabled = false;
    if (!r || !r.ok) { err.textContent = msg(r); return; }
    UI.renderMenu(); UI.show("menu");
  }

  /* ---------- leaderboards ---------- */
  function scopesFor() {
    const p = N.token ? N.player : null;
    if (p && p.school && p.cls && !p.teacher) return ["class", "grade", "school", "public"];
    if (p && p.school) return ["school", "public"];
    return ["public"];
  }
  function segB(el, map, key) {
    el.innerHTML = Object.keys(map).map((k) => `<button data-v="${k}" class="${B[key] === k ? "sel" : ""}">${map[k]}</button>`).join("");
    el.onclick = (ev) => { const b = ev.target.closest("button"); if (!b) return; B[key] = b.dataset.v; renderBoard(); };
  }
  function openBoard() {
    B.mode = UI.S.prefs.mode; B.diff = UI.S.prefs.diff;
    const sc = scopesFor(); if (sc.indexOf(B.scope) === -1) B.scope = sc[0];
    UI.show("board"); renderBoard();
  }
  async function renderBoard() {
    const sc = scopesFor(), map = {}; sc.forEach((k) => (map[k] = SCOPES[k]));
    segB($("#lb-scope"), map, "scope"); segB($("#lb-mode"), UI.MODES, "mode"); segB($("#lb-diff"), UI.DIFFS, "diff");
    const body = $("#lb-body"), foot = $("#lb-foot"), id = ++B.req;
    body.innerHTML = `<div class="lb-msg">載入中…</div>`; foot.textContent = "";
    const r = await N.leaderboard(B.scope, B.mode, B.diff);
    if (id !== B.req) return;
    if (!r || !r.ok) { body.innerHTML = `<div class="lb-msg">${esc(msg(r))}</div>`; return; }
    if (!r.rows.length) { body.innerHTML = `<div class="lb-msg">還沒有人上榜，來當第一名吧。</div>`; }
    else {
      const showCls = B.scope === "grade" || B.scope === "school";
      body.innerHTML = r.rows.map((x) => `<div class="lb-row${x.me ? " me" : ""}"><i>${x.rank}</i><b>${esc(x.name)}${showCls && x.cls ? `<small>${esc(x.cls)}</small>` : ""}</b>` +
        `<span class="sc">${Number(x.score).toLocaleString()}</span><span>第 ${x.wave} 波</span><span>${Math.round(x.wpm)} WPM</span><span>${Math.round(x.acc)}%</span></div>`).join("");
    }
    const title = B.scope === "class" || B.scope === "grade" ? (B.scope === "grade" ? (GRADE_NAME[r.group] || r.group) : r.group) : SCOPES[B.scope];
    foot.textContent = `${r.year} 學年 · ${title} · 共 ${r.total} 人` + (r.me ? ` · 你是第 ${r.me.rank} 名` : N.ready() ? " · 你還沒有成績" : "");
  }

  /* ---------- score upload after a game ---------- */
  async function submit(G, st) {
    const el = $("#res-upload");
    if (!N.enabled()) { el.textContent = ""; return; }
    if (!N.token) { el.textContent = "沒有登入，成績不會上排行榜。"; return; }
    if (!N.ready()) { el.textContent = "還沒填寫資料，成績不會上排行榜。"; return; }
    el.textContent = "成績上傳中…";
    const r = await N.submitScore({ mode: G.mode, diff: G.diff, score: st.score, wave: st.wave, kills: st.kills, hits: G.hits, keys: G.keys,
      time: Math.round(st.time * 10) / 10, maxCombo: st.maxCombo, input: "kb" });
    if (!r || !r.ok) el.textContent = r && r.error === "rejected" ? "成績沒有被接受。" : r && r.error === "session_expired" ? "登入已過期，這次成績沒有上傳。" : "上傳失敗，這次成績只存在這台電腦。";
    else if (!r.ranked) el.textContent = "已記錄（觸控鍵盤的成績不上排行榜）。";
    else el.textContent = r.best ? "已上傳，這是你今年的最佳成績！" : `已上傳。你今年的最佳成績是 ${Number(r.bestScore).toLocaleString()} 分。`;
  }

  async function boot() {
    renderAcct();
    if (!N.enabled()) return;
    await N.loadConfig();
    await N.restore();
    UI.renderMenu();
  }

  $("#btn-board").onclick = openBoard;
  $("#btn-board-back").onclick = () => { UI.renderMenu(); UI.show("menu"); };
  $("#btn-profile-save").onclick = saveProfile;
  $("#btn-profile-later").onclick = () => { UI.renderMenu(); UI.show("menu"); };
  $("#acct").addEventListener("click", (ev) => { if (ev.target.id === "btn-fake-login") signIn("fake:" + (window.__TSV_FAKE_EMAIL || "a@foonyew.edu.my")); });

  window.TSAccount = { renderAcct, lockedGrade, submit, openBoard, openProfile, boot };
  boot();
})();
