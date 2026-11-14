/* =====================================================================
 *  Typing Survival — typing test: the teacher's graded test, the self check,
 *  weak keys + practice, and the teacher console (老師後台).
 *  Rules of the test itself are in engine.js ("typing test"); marks are
 *  worked out by the backend, this file only shows them.
 * ===================================================================== */
(function () {
  "use strict";
  const UI = window.TSUI, N = window.TSNet, E = window.TSEngine, L = window.TS_LINES, $ = UI.$, esc = UI.esc;
  const CONTENT = { word: "單字", sentence: "句子", excel: "Excel 公式", c: "C 程式" };
  const KIND = { word: "單字", sentence: "句子", subject: "專科（高一 Excel 公式、高二 C 程式，其他年段打句子）" };
  const KIND_SHORT = { word: "單字", sentence: "句子", subject: "專科" };
  const STATUS = { started: "考試中", finished: "完成", "left page": "切換視窗", "ended by teacher": "老師結束", "rejected (too fast)": "作廢" };
  const ERR = {
    network: "連不上伺服器，請再試一次。", session_expired: "登入已過期，請回主畫面重新登入。", server: "伺服器出錯，請稍後再試。",
    no_profile: "要先用學校帳號登入並填好班級。", no_test: "目前沒有開放中的測驗。", wrong_code: "代號不對，請再聽一次老師公布的代號。",
    too_many_codes: "代號連續打錯太多次，請等 10 分鐘，或請老師幫忙。", not_your_class: "這個測驗不是開給你的班級。",
    no_attempts: "你的測驗次數已經用完。", not_teacher: "這個功能只有老師可以用。", need_classes: "請填寫班級，例如 J203 或 J2。",
    bad_classes: "班級格式不對。例：J203、S1S2，或整個年段 J2。多個用逗號分開。", bad_code: "代號至少 3 個字，而且要有英文字母。",
    code_used: "這個代號用過了，請換一個。", not_your_test: "這是別的老師開的測驗。", no_such_test: "找不到這個測驗。", not_running: "這次測驗已經結束了。",
  };
  const msg = (r) => ERR[r && r.error] || ERR.server;
  const call = (action, body, tries) => N.post(action, Object.assign({ token: N.token }, body || {}), tries || 3);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const grade = () => (N.token && N.player && N.player.grade) || UI.S.prefs.grade;
  const student = () => !!(N.token && N.player && N.player.school && N.player.cls && !N.player.teacher);
  const T = { info: null, run: null, ping: 0 };

  function deckFor(content, g) {
    if (content !== "word") return shuffle(L[content] || L.sentence);
    const b = UI.wordsFor(g);
    return shuffle(b.words.concat(b.topic).filter((w) => /^[a-z]{2,9}$/.test(w)));
  }
  // full-marks speed when there is no server to ask (not signed in)
  function localFull(content, g) { return content === "word" ? (/^(J1|J2)/.test(g) ? 40 : 45) : content === "sentence" ? (/^(J1|J2)/.test(g) ? 35 : 40) : 30; }

  /* ---------- the 打字檢定 screen ---------- */
  async function open(note) {
    UI.show("test");
    const g = grade(), subj = L.subjectOf(g.slice(0, 2));
    $("#ts-self").innerHTML = `<button data-k="word">單字<small>計入段位和排行榜</small></button><button data-k="sentence">句子<small>大寫、標點</small></button>` +
      (subj ? `<button data-k="subject">${CONTENT[subj]}<small>整行照打</small></button>` : "");
    $("#ts-msg").textContent = note || "";
    $("#ts-teacher").style.display = N.token && N.player && N.player.teacher ? "" : "none";
    $("#ts-keys").style.display = N.token ? "" : "none";
    const box = $("#ts-graded");
    box.style.display = student() ? "" : "none";
    $("#ts-self-tip").textContent = N.token ? "5 分鐘，不限次數，不需要代號。" : "5 分鐘，不限次數。沒有登入的話，成績不會記錄。";
    if (!student()) return;
    $("#ts-info").textContent = "查詢中…"; $("#ts-code").disabled = $("#btn-ts-go").disabled = true;
    const r = await call("testInfo", null, 2);
    if (UI.S.screen !== "test") return;
    T.info = r && r.ok ? r : null;
    if (!r || !r.ok) { $("#ts-info").textContent = msg(r); return; }
    if (!r.allowed) { $("#ts-info").textContent = "目前沒有開放給你班級的測驗。老師開放後，回到這個畫面就能輸入代號。"; return; }
    const left = r.attempts - r.used;
    $("#ts-info").innerHTML = `${esc(CONTENT[r.content])}測驗 · ${r.minutes} 分鐘 · 已用 ${r.used}/${r.attempts} 次` + (r.best != null ? ` · 目前最高 <b>${r.best}</b> 分` : "") +
      (left > 0 ? `<br>開始後不能暫停。<b>切換視窗或離開這個頁面，這次測驗就會結束並計分。</b>` : `<br>次數已經用完。`);
    $("#ts-code").disabled = $("#btn-ts-go").disabled = left <= 0;
    if (left > 0) $("#ts-code").focus();
  }

  async function startGraded() {
    const code = $("#ts-code").value.trim(), m = $("#ts-msg");
    if (!code) { m.textContent = "請輸入老師公布的代號。"; return; }
    $("#btn-ts-go").disabled = true; m.textContent = "連線中…";
    const r = await call("testStart", { code });
    $("#btn-ts-go").disabled = false;
    if (!r || !r.ok) { m.textContent = msg(r); return; }
    $("#ts-code").value = "";
    run({ type: "graded", content: r.content, minutes: r.minutes, id: r.attemptId, full: r.full, passAcc: r.passAcc,
      label: `${CONTENT[r.content]}測驗 · 第 ${r.attemptNo}/${r.attempts} 次` });
  }
  async function startSelf(kind) {
    const m = $("#ts-msg"), g = grade();
    if (!N.token) {
      const content = kind === "subject" ? L.subjectOf(g.slice(0, 2)) || "sentence" : kind;
      return run({ type: "local", content, minutes: 5, full: localFull(content, g), passAcc: 85, label: CONTENT[content] + "檢定" });
    }
    m.textContent = "連線中…";
    const r = await call("selfStart", { kind });
    if (!r || !r.ok) { m.textContent = msg(r); return; }
    run({ type: "self", kind, content: r.content, minutes: r.minutes, st: r.st, full: r.full, passAcc: r.passAcc, label: CONTENT[r.content] + "檢定" });
  }

  /* ---------- running one ---------- */
  function run(o) {
    T.run = o; o.done = false;
    UI.startTest({ kind: o.content === "word" ? "word" : "line", deck: o.deck || deckFor(o.content, grade()), seconds: Math.round(o.minutes * 60), label: o.label,
      onEnd: (G) => finish(o, G, false), onLeave: (G) => finish(o, G, true) });
    clearInterval(T.ping);
    if (o.type === "graded") T.ping = setInterval(async () => {          // the teacher's live list; also hears "the teacher ended it"
      const G = UI.S.G; if (!G || !G.test || o.done) return;
      const s = E.testStats(G);
      const r = await call("testPing", { attemptId: o.id, correct: s.correct, good: s.good, keys: s.keys, words: s.words }, 1);
      if (r && r.kicked && !o.done) finish(o, UI.S.G, false, true);
    }, 10000);
  }
  function counts(o, G) {
    const s = E.testStats(G, o.minutes), P = G.players[0];
    return { correct: s.correct, good: s.good, keys: s.keys, words: s.words, stats: P.keyStats, s };
  }
  function resultCard(title, big, unit, sub, cells, note) {
    $("#res-title").textContent = title;
    $("#res-score").innerHTML = esc(big) + (unit ? `<small>${esc(unit)}</small>` : "");
    $("#res-sub").textContent = sub;
    $("#res-grid").style.display = ""; $("#res-team").style.display = "none";
    $("#res-grid").innerHTML = cells.map(([a, b]) => `<div><b>${esc(b)}</b><span>${esc(a)}</span></div>`).join("");
    $("#res-upload").textContent = note || ""; $("#res-coins").innerHTML = "";
    $("#btn-menu").textContent = "回打字檢定";
    UI.S.onMenu = () => open();
    UI.show("result");
  }
  const one = (x) => (Math.round(x * 10) / 10).toFixed(1);
  function halved(acc, pass) { return acc < pass ? `準確率低於 ${pass}%，這次分數減半。` : ""; }
  function again(label, fn) { const b = $("#btn-again"); b.style.display = fn ? "" : "none"; b.textContent = label || ""; UI.S.again = fn || null; }

  async function finish(o, G, left, kicked) {
    if (o.done || !G) return;
    o.done = true; clearInterval(T.ping);
    const c = counts(o, G);
    UI.stopGame();
    if (o.type === "practice") {
      const mins = Math.max(G.t, 1) / 60, s = E.testStats(G, mins);
      if (N.token) call("addKeys", { stats: c.stats }, 2);
      resultCard(left ? "練習結束" : "練習完成", one(s.net), "淨 WPM", "弱點練習：" + o.keys.join(" "), [["WPM", one(s.wpm)], ["準確率", Math.round(s.acc) + "%"], ["打完", s.words + " 個字"]], "練習不計分，但會更新你的弱點鍵紀錄。");
      UI.S.onMenu = () => openKeys();
      $("#btn-menu").textContent = "回弱點鍵";
      return again("再練一次", () => practice());
    }
    if (left && o.type !== "graded") return open("離開了視窗，這次檢定取消了。檢定中請不要切換視窗。");
    if (o.type === "local") {
      const s = c.s, sc = E.testScore(s.net, s.acc, o.full, o.passAcc), cells = [["WPM", one(s.wpm)], ["準確率", Math.round(s.acc) + "%"], ["換算分數", sc]];
      if (o.content === "word") cells.push(["段位", E.rankOf(s.net) + " 級"]);
      resultCard("檢定完成", one(s.net), "淨 WPM", o.label + " · 5 分鐘", cells, "沒有登入，這次成績沒有記錄。" + halved(s.acc, o.passAcc));
      return again("再考一次", () => startSelfAgain(o));
    }
    resultCard("計分中…", "…", "", o.label, [], "成績上傳中，請不要關閉這個頁面。");
    again("", null);
    const body = { correct: c.correct, good: c.good, keys: c.keys, words: c.words, stats: c.stats };
    const send = async () => {
      $("#res-upload").textContent = "成績上傳中，請不要關閉這個頁面。"; again("", null);
      const r = o.type === "graded" ? await call("testFinish", Object.assign({ attemptId: o.id, left: !!left }, body), 6) : await call("selfFinish", Object.assign({ st: o.st, input: "kb" }, body), 6);
      if (!r || !r.ok) {
        resultCard("上傳失敗", "?", "", o.label, [], (r && r.error !== "network" ? msg(r) : "連不上伺服器。") + "請不要關閉頁面，按「重新上傳」。還是不行就請老師處理。");
        return again("重新上傳", send);
      }
      if (o.type === "graded") showGraded(o, r, left, kicked); else showSelf(o, r);
    };
    send();
  }
  function startSelfAgain(o) { UI.show("test"); $("#ts-msg").textContent = ""; startSelf(o.kind || (o.content === "word" || o.content === "sentence" ? o.content : "subject")); }
  function showGraded(o, r, left, kicked) {
    const title = r.status === "left page" ? "切換了視窗，測驗結束" : r.status === "ended by teacher" || kicked ? "老師結束了這次測驗" : r.status === "rejected (too fast)" ? "成績作廢" : "測驗完成";
    const cells = [["淨 WPM", one(r.net)], ["WPM", one(r.wpm)], ["準確率", Math.round(r.accuracy) + "%"], ["滿分速度", "淨 " + r.full], ["已用次數", r.attemptNo + "/" + r.attempts], ["目前最高", (r.best == null ? r.score : r.best) + " 分"]];
    const note = (r.status === "left page" ? "離開視窗後的時間也算在內。" : "") + halved(r.accuracy, r.passAcc) + (r.attemptNo < r.attempts ? "還可以再考，取最高分。" : "");
    resultCard(title, String(r.score), "分", o.label, cells, note || "成績已交給老師。");
    again("", null);
    if (r.unlocked && r.unlocked.length) unlocked(r.unlocked);
  }
  function showSelf(o, r) {
    const cells = [["WPM", one(r.wpm)], ["準確率", Math.round(r.accuracy) + "%"], ["換算分數", r.score]];
    if (r.rank) cells.push(["段位", r.rank + " 級"]);
    const note = !r.ranked ? (o.content === "word" ? "填好資料後，單字檢定才會上排行榜。" : "句子和專科檢定不排名，只給你自己參考。")
      : r.best ? "這是你今年的最佳紀錄，已上排行榜（檢定）。" : `已記錄。你今年的最佳是淨 ${one(r.bestNet)} WPM。`;
    resultCard("檢定完成", one(r.net), "淨 WPM", o.label + " · 5 分鐘", cells, note + halved(r.accuracy, r.passAcc));
    again("再考一次", () => startSelfAgain(o));
    if (r.unlocked && r.unlocked.length) unlocked(r.unlocked);
  }
  function unlocked(ids) {
    const S = window.TS_SHOP;
    for (const id of ids) if (N.player && N.player.owned.indexOf(id) === -1) N.player.owned.push(id);
    $("#res-coins").innerHTML = ids.map((id) => `<em>解鎖成就造型「${esc(S.byId[id] ? S.byId[id].name : id)}」！</em>`).join("");
  }

  /* ---------- weak keys ---------- */
  const ROWS = ["`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"], SHIFT = ["~!@#$%^&*()_+", "QWERTYUIOP{}|", 'ASDFGHJKL:"', "ZXCVBNM<>?"];
  const BASE = {}; ROWS.forEach((r, i) => { for (let j = 0; j < r.length; j++) { BASE[r[j]] = r[j]; BASE[SHIFT[i][j]] = r[j]; } });
  // per physical key: right, wrong (a Shift character counts on its key)
  function perKey(keys) {
    const out = {};
    for (const ch in keys) { const b = BASE[ch]; if (!b) continue; const a = keys[ch], o = out[b] || (out[b] = [0, 0, 0, 0]); for (let i = 0; i < 4; i++) o[i] += Number(a[i]) || 0; }
    return out;
  }
  // the characters typed wrong most often: at least 10 tries and 8% wrong
  function weakest(keys, n) {
    return Object.keys(keys).map((ch) => ({ ch, n: keys[ch][0] + keys[ch][1], rate: keys[ch][1] / Math.max(1, keys[ch][0] + keys[ch][1]) }))
      .filter((x) => x.n >= 10 && x.rate >= 0.08).sort((a, b) => b.rate - a.rate).slice(0, n);
  }
  function slowest(keys, n) {
    const all = Object.keys(keys).filter((ch) => keys[ch][3] >= 10).map((ch) => ({ ch, ms: keys[ch][2] / keys[ch][3] }));
    if (all.length < 6) return [];
    const mid = all.map((x) => x.ms).sort((a, b) => a - b)[Math.floor(all.length / 2)];
    return all.filter((x) => x.ms > mid * 1.4).sort((a, b) => b.ms - a.ms).slice(0, n).map((x) => Object.assign(x, { mid }));
  }
  function keyboardHtml(keys) {
    const k = perKey(keys);
    return `<div class="kb">` + ROWS.map((r, i) => `<div class="kb-row" style="margin-left:${[0, 26, 40, 62][i]}px">` + r.split("").map((ch, j) => {
      const a = k[ch], n = a ? a[0] + a[1] : 0, rate = n ? a[1] / n : 0;
      const cls = n < 5 ? "none" : rate >= 0.15 ? "bad" : rate >= 0.08 ? "warn" : "ok";
      return `<span class="key ${cls}" title="${n ? `打對 ${a[0]}、打錯 ${a[1]}` : "還沒有資料"}"><small>${esc(SHIFT[i][j] === ch.toUpperCase() ? "" : SHIFT[i][j])}</small>${esc(ch.toUpperCase())}${n >= 5 ? `<u>${Math.round(rate * 100)}%</u>` : ""}</span>`;
    }).join("") + `</div>`).join("") + `</div><div class="kb-legend"><span class="key ok"></span>錯少於 8%<span class="key warn"></span>8–15%<span class="key bad"></span>15% 以上<span class="key none"></span>資料不夠</div>`;
  }
  function weakHtml(keys, who) {
    const w = weakest(keys, 6), s = slowest(keys, 4), show = (ch) => (ch === " " ? "空白鍵" : ch);
    if (!Object.keys(keys).length) return `<p class="kb-tip">還沒有資料。做一次打字檢定或測驗之後，這裡會顯示${who}最常打錯的鍵。</p>`;
    return `<p class="kb-tip">` + (w.length ? `${who}最常打錯：` + w.map((x) => `<b>${esc(show(x.ch))}</b> ${Math.round(x.rate * 100)}%`).join("　") : `${who}沒有特別常打錯的鍵。`) +
      (s.length ? `<br>找得比較慢：` + s.map((x) => `<b>${esc(show(x.ch))}</b> ${(x.ms / 1000).toFixed(1)} 秒`).join("　") : "") + `</p>`;
  }
  async function openKeys() {
    UI.show("keys");
    $("#keys-title").textContent = "我的弱點鍵"; $("#keys-pick").style.display = "none";
    $("#keys-body").innerHTML = `<p class="kb-tip">載入中…</p>`; $("#btn-keys-practice").style.display = "none";
    $("#btn-keys-back").onclick = () => open();
    const r = await call("myKeys", null, 2);
    if (UI.S.screen !== "keys") return;
    if (!r || !r.ok) { $("#keys-body").innerHTML = `<p class="kb-tip">${esc(msg(r))}</p>`; return; }
    T.myKeys = r.keys;
    $("#keys-body").innerHTML = keyboardHtml(r.keys) + weakHtml(r.keys, "你");
    const w = weakest(r.keys, 3);
    $("#btn-keys-practice").style.display = w.length ? "" : "none";
    $("#btn-keys-practice").textContent = w.length ? `弱點練習（2 分鐘）：${w.map((x) => x.ch).join(" ")}` : "";
  }
  // 2 minutes of words (or lines) that contain the keys you get wrong most
  function practice() {
    const w = weakest(T.myKeys || {}, 3).map((x) => x.ch); if (!w.length) return openKeys();
    const letters = w.map((c) => c.toLowerCase()).filter((c) => /[a-z]/.test(c)), g = grade();
    let content = "word", deck = letters.length ? deckFor("word", g).filter((x) => letters.some((c) => x.indexOf(c) !== -1)) : [];
    if (deck.length < 12) {
      const pool = L.sentence.concat(L[L.subjectOf(g.slice(0, 2))] || []);
      content = "sentence"; deck = shuffle(pool.filter((x) => w.some((c) => x.indexOf(c) !== -1)));
      if (deck.length < 4) deck = shuffle(pool);
    }
    run({ type: "practice", content, deck, minutes: 2, keys: w, label: "弱點練習 " + w.join(" ") });
  }

  /* ---------- teacher console ---------- */
  const C = { code: "", timer: 0, tab: "tests", data: null };
  function stopWatch() { clearInterval(C.timer); C.timer = 0; }
  async function openTeacher() {
    stopWatch(); C.code = ""; UI.show("teacher");
    $("#tc-tabs").innerHTML = `<button data-t="tests" class="${C.tab === "tests" ? "sel" : ""}">測驗</button><button data-t="keys" class="${C.tab === "keys" ? "sel" : ""}">班級弱點鍵</button>`;
    if (C.tab === "keys") return teacherKeys();
    const body = $("#tc-body");
    body.innerHTML = `<p class="kb-tip">載入中…</p>`;
    const r = await call("tTests", null, 2);
    if (UI.S.screen !== "teacher" || C.code || C.tab !== "tests") return;
    if (!r || !r.ok) { body.innerHTML = `<p class="kb-tip">${esc(msg(r))}</p>`; return; }
    C.data = r;
    body.innerHTML = `
      <div class="tc-new">
        <label>班級<input id="tc-classes" placeholder="J203, J204 或整個年段 J2" autocomplete="off"></label>
        <label>類型<select id="tc-kind">${Object.keys(KIND).map((k) => `<option value="${k}">${KIND[k]}</option>`).join("")}</select></label>
        <label>分鐘<input id="tc-min" type="number" min="1" max="15" value="${r.defaults.minutes}"></label>
        <label>次數<input id="tc-att" type="number" min="1" max="10" value="${r.defaults.attempts}"></label>
        <label>代號<input id="tc-code" value="${esc(r.suggest)}" maxlength="20" autocomplete="off" spellcheck="false"></label>
        <button class="go" id="btn-tc-new">開新測驗</button>
      </div>
      <div id="tc-msg"></div>
      <div class="tc-list">` + (r.tests.length ? r.tests.map((t) => `
        <div class="tc-test ${t.status}">
          <b class="code">${esc(t.code)}</b><span>${esc(t.classes)}</span><span>${esc(KIND_SHORT[t.kind])} · ${t.minutes} 分 · ${t.attempts} 次</span>
          <span>${new Date(t.created).toLocaleDateString("zh-TW")}${r.admin && t.teacher !== r.email ? " · " + esc(t.teacherName) : ""}</span>
          <em>${t.status === "open" ? "開放中" : "已關閉"}</em><button data-code="${esc(t.code)}">查看</button>
        </div>`).join("") : `<p class="kb-tip">還沒有測驗。填好上面一行，按「開新測驗」，再把代號口頭告訴學生。</p>`) + `</div>
      <p class="kb-tip">滿分速度（淨 WPM）— 單字：${fullText(r.full.word)}｜句子：${fullText(r.full.sentence)}｜專科：${fullText(r.full.subject)}。準確率低於 ${r.passAcc}% 該次減半。要改請到 Sheet 的 Settings 分頁。</p>`;
    $("#btn-tc-new").onclick = create;
    body.querySelector(".tc-list").onclick = (ev) => { const b = ev.target.closest("button[data-code]"); if (b) watch(b.dataset.code); };
  }
  const fullText = (m) => Object.keys(m).map((k) => k + " " + m[k]).join("、");
  async function create() {
    const m = $("#tc-msg"); m.textContent = "建立中…"; $("#btn-tc-new").disabled = true;
    const r = await call("tCreate", { classes: $("#tc-classes").value, kind: $("#tc-kind").value, minutes: $("#tc-min").value, attempts: $("#tc-att").value, code: $("#tc-code").value });
    if (!r || !r.ok) { m.textContent = msg(r); $("#btn-tc-new").disabled = false; return; }
    watch(r.test.code);
  }
  function watch(code) {
    stopWatch(); C.code = code;
    $("#tc-body").innerHTML = `<p class="kb-tip">載入中…</p>`;
    refresh();
    C.timer = setInterval(refresh, 6000);
  }
  const mmss = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  async function refresh() {
    const code = C.code, r = await call("tMonitor", { code }, 1);
    if (UI.S.screen !== "teacher" || C.code !== code) return;
    if (!r || !r.ok) { if (!C.mon) $("#tc-body").innerHTML = `<p class="kb-tip">${esc(msg(r))}</p>`; return; }
    C.mon = r;
    const t = r.test, max = Math.max(t.attempts, ...r.students.map((s) => s.attempts.length), 1), cols = Array.from({ length: max }, (_, i) => i);
    const running = r.students.filter((s) => s.attempts.some((a) => a.status === "started" && !a.lost)).length, done = r.students.filter((s) => s.best).length;
    $("#tc-body").innerHTML = `
      <div class="tc-head">
        <div><span>代號（口頭告訴學生）</span><b class="code big">${esc(t.code)}</b></div>
        <div class="tc-meta">${esc(t.classes)} · ${esc(KIND_SHORT[t.kind])} · ${t.minutes} 分鐘 · ${t.attempts} 次<br><em class="${t.status}">${t.status === "open" ? "開放中" : "已關閉"}</em> · 已加入 ${r.students.length} 人 · 考試中 ${running} 人 · 有成績 ${done} 人</div>
        <div class="tc-btns"><button id="btn-tc-toggle">${t.status === "open" ? "關閉測驗" : "重新開放"}</button><button id="btn-tc-csv">下載成績（Excel）</button><button id="btn-tc-list">回測驗列表</button></div>
      </div>
      <div class="tc-table" style="--n:${max}"><div class="tc-row th"><span>班級</span><span>座號</span><span>姓名</span><span>現在</span>${cols.map((i) => `<span>第 ${i + 1} 次</span>`).join("")}<span>最高分</span><span></span></div>` +
      (r.students.length ? r.students.map((s) => {
        const live = s.attempts.filter((a) => a.status === "started")[0];
        const now = live ? (live.lost ? `<i class="bad">斷線／沒交</i>` : `<i class="run">考試中 ${mmss(live.secsLeft)}${live.liveWpm != null ? ` · ${Math.round(live.liveWpm)} WPM` : ""}</i>`) : s.attempts.length >= s.allowed ? "考完" : "還可再考";
        return `<div class="tc-row"><span>${esc(s.cls)}</span><span>${esc(s.seat)}</span><b>${esc(s.name)}</b><span>${now}</span>` +
          cols.map((i) => { const a = s.attempts[i]; return `<span>${!a ? "—" : a.status === "started" ? "…" : `${a.score}<small>${a.status === "finished" ? "" : esc(STATUS[a.status] || a.status)}</small>`}</span>`; }).join("") +
          `<span class="best">${s.best ? s.best.score : "—"}</span><span class="ops">` +
          (live && !live.lost ? `<button data-end="${esc(live.id)}" title="用目前打的字計分，這次算用掉">結束</button>` : "") +
          `<button data-extra="${esc(s.email)}" title="當機、斷線或要重考時，多給一次機會">加考 1 次</button></span></div>`;
      }).join("") : `<p class="kb-tip">還沒有學生加入。學生在主畫面按「打字檢定」，輸入代號就會出現在這裡。</p>`) + `</div>
      <p class="kb-tip" id="tc-msg">名單每 6 秒自動更新。「切換視窗」＝學生考試中離開了頁面，該次以離開前的字數、整段時間計分。</p>`;
    $("#btn-tc-list").onclick = () => { C.mon = null; openTeacher(); };
    $("#btn-tc-csv").onclick = () => csv(r);
    $("#btn-tc-toggle").onclick = async () => { await call("tUpdate", { code, status: t.status === "open" ? "closed" : "open" }); refresh(); };
    $("#tc-body").querySelector(".tc-table").onclick = async (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      b.disabled = true;
      const x = b.dataset.end ? await call("tEnd", { code, attemptId: b.dataset.end }) : await call("tExtra", { code, email: b.dataset.extra, delta: 1 });
      await refresh();
      if (!x || !x.ok) $("#tc-msg").textContent = msg(x);
    };
  }
  function csv(r) {
    const max = Math.max(1, ...r.students.map((s) => s.attempts.length)), q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const head = ["班級", "座號", "姓名", "Email", "已用次數", "最高分", "淨WPM", "WPM", "準確率%"].concat(Array.from({ length: max }, (_, i) => `第${i + 1}次`));
    const rows = r.students.map((s) => [s.cls, s.seat, s.name, s.email, s.attempts.length, s.best ? s.best.score : "", s.best ? s.best.net : "", s.best ? s.best.wpm : "", s.best ? s.best.acc : ""]
      .concat(Array.from({ length: max }, (_, i) => { const a = s.attempts[i]; return !a ? "" : a.status === "started" ? "未完成" : a.score + (a.status === "finished" ? "" : "（" + (STATUS[a.status] || a.status) + "）"); })));
    const text = "\ufeff" + [head].concat(rows).map((x) => x.map(q).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = `打字測驗_${r.test.code}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    T.lastCsv = text;
  }
  async function teacherKeys() {
    const body = $("#tc-body");
    body.innerHTML = `<div class="tc-new one"><label>班級或年段<input id="tk-cls" placeholder="J203 或 J2" autocomplete="off" value="${esc(C.cls || "")}"></label><button class="go" id="btn-tk">查看</button></div><div id="tk-out"><p class="kb-tip">輸入班級（例如 J203）或年段（例如 J2），看全班最常打錯的鍵。資料來自學生做過的測驗、檢定和弱點練習。</p></div>`;
    const go = async () => {
      C.cls = $("#tk-cls").value.trim().toUpperCase(); if (!C.cls) return;
      $("#tk-out").innerHTML = `<p class="kb-tip">載入中…</p>`;
      const r = await call("tKeys", { cls: C.cls }, 2);
      if (!r || !r.ok) { $("#tk-out").innerHTML = `<p class="kb-tip">${esc(msg(r))}</p>`; return; }
      $("#tk-out").innerHTML = r.students ? `<p class="kb-tip"><b>${esc(r.cls)}</b> · ${r.students} 位學生的資料</p>` + keyboardHtml(r.keys) + weakHtml(r.keys, "全班") : `<p class="kb-tip">${esc(r.cls)} 還沒有學生的打字資料。</p>`;
    };
    $("#btn-tk").onclick = go;
    $("#tk-cls").onkeydown = (ev) => { if (ev.key === "Enter") go(); };
    if (C.cls) go();
  }

  $("#btn-test").onclick = () => open();
  $("#btn-ts-back").onclick = () => { UI.renderMenu(); UI.show("menu"); };
  $("#btn-ts-go").onclick = startGraded;
  $("#ts-code").onkeydown = (ev) => { if (ev.key === "Enter") startGraded(); };
  $("#ts-self").onclick = (ev) => { const b = ev.target.closest("button"); if (b) startSelf(b.dataset.k); };
  $("#ts-keys").onclick = openKeys;
  $("#ts-teacher").onclick = () => { C.tab = "tests"; openTeacher(); };
  $("#btn-keys-practice").onclick = practice;
  $("#btn-tc-back").onclick = () => { stopWatch(); C.mon = null; open(); };
  $("#tc-tabs").onclick = (ev) => { const b = ev.target.closest("button"); if (b) { C.tab = b.dataset.t; C.mon = null; openTeacher(); } };

  window.TSTest = { open, openTeacher, openKeys, weakest, T, C };
})();
