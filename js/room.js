/* =====================================================================
 *  Typing Survival — co-op rooms (2–6 players), peer to peer with PeerJS.
 *  The host's browser runs the game; guests send keys and get snapshots.
 *    guest → host : hello {name} · k {ch} · i {name} · p (heartbeat) · bye
 *    host → guest : lobby {players, settings, you} · no {why} · start
 *                   s {s: snapshot, ev: events} · closed
 * ===================================================================== */
(function () {
  "use strict";
  const UI = window.TSUI, E = window.TSEngine, RD = window.TSRender, $ = UI.$, esc = UI.esc;
  const CFG = window.TS_CONFIG || {};
  const PREFIX = "tsv-fy-", CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", MAX = E.MAX_PLAYERS;
  let R = fresh();
  function fresh() { return { role: null, code: "", me: "", peer: null, conns: {}, host: null, lobby: [], settings: null, started: false, nextPid: 1, out: [], flush: 0, beat: 0, lastMsg: 0, joinTimer: 0 }; }

  function peerOptions() {
    const o = { debug: 0, config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] } };
    if (CFG.PEER_SERVER) Object.assign(o, CFG.PEER_SERVER);
    return o;
  }
  const myLook = () => { const e = UI.myEquip(); return { char: e.char, skin: e.skin, weapon: e.weapon }; };
  const genCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  function myName() {
    let v = ($("#mp-name").value || "").trim().replace(/\s+/g, " ").slice(0, 12);
    if (!v) v = "玩家" + Math.floor(100 + Math.random() * 900);
    $("#mp-name").value = v;
    try { localStorage.setItem("tsv_nick", v); } catch (e) {}
    return v;
  }
  function charName(p) { const c = window.TS_SHOP.byId[p.look && p.look.char]; return c && c.type === "char" && c.id !== "student" ? c.name : ""; }
  function msg(text, bad) { const el = $("#mp-msg"); el.textContent = text || ""; el.className = bad ? "bad" : ""; }
  const sendTo = (conn, m) => { try { if (conn && conn.open) conn.send(m); } catch (e) {} };
  const broadcast = (m) => { for (const pid in R.conns) sendTo(R.conns[pid], m); };

  /* ---------- lobby screen ---------- */
  function render() {
    const inRoom = !!R.role && !!R.me;
    $("#mp-join").style.display = inRoom ? "none" : "";
    $("#mp-room").style.display = inRoom ? "" : "none";
    if (!inRoom) return;
    $("#mp-code").textContent = R.code;
    $("#mp-settings").textContent = R.settings ? UI.settingsText(R.settings) : "";
    $("#mp-players").innerHTML = R.lobby.map((p, i) =>
      `<div class="mp-p"><i style="background:${RD.PCOL[i % RD.PCOL.length]}"></i><b>${esc(p.name)}</b><span>${esc(charName(p))} ${p.pid === "p0" ? "房主" : ""}${p.pid === R.me ? "（你）" : ""}</span></div>`).join("") +
      Array.from({ length: MAX - R.lobby.length }, () => `<div class="mp-p empty"><i></i><b>等待加入…</b><span></span></div>`).join("");
    const host = R.role === "host";
    $("#btn-mp-start").style.display = host ? "" : "none";
    $("#btn-mp-start").disabled = R.lobby.length < 2;
    if (host) msg(R.lobby.length < 2 ? "把房號告訴同學，至少 2 人才能開始。模式、難度、詞庫用你在主畫面選的設定。" : "人到齊就可以開始。");
    else msg("等房主開始…");
  }
  function open() {
    if (typeof Peer === "undefined") { alert("連線元件沒有載入，請重新整理網頁。"); return; }
    let nick = ""; try { nick = localStorage.getItem("tsv_nick") || ""; } catch (e) {}
    const N = window.TSNet, p = N && N.token && N.player ? N.player : null;
    if (!$("#mp-name").value) $("#mp-name").value = (p && (p.name || p.nick)) || nick;
    UI.show("room"); render();
    if (!R.role) msg("");
  }

  /* ---------- leaving ---------- */
  function shutdown() {
    clearInterval(R.beat); clearTimeout(R.joinTimer); clearTimeout(R.flush);
    try { if (R.peer) R.peer.destroy(); } catch (e) {}
    R = fresh();
  }
  function leave(note) {
    if (R.role === "host") broadcast({ t: "closed" });
    else if (R.host) sendTo(R.host, { t: "bye" });
    const peer = R.peer;
    R.peer = null;
    setTimeout(() => { try { if (peer) peer.destroy(); } catch (e) {} }, 150);   // let the goodbye go out first
    shutdown();
    UI.toMenu();
    if (note) { open(); msg(note, true); }
  }
  function backToLobby() {
    if (R.role === "host") { R.started = false; UI.stopGame(); broadcast(lobbyMsg()); }
    UI.show("room"); render();
  }

  /* ---------- host ---------- */
  const lobbyMsg = () => ({ t: "lobby", players: R.lobby, settings: R.settings, code: R.code });
  function host(retry) {
    shutdown();
    const name = myName(), code = genCode();
    R.role = "host"; R.code = code;
    R.settings = { mode: UI.S.prefs.mode, diff: UI.S.prefs.diff, grade: UI.S.prefs.grade };
    msg("建立房間中…");
    const peer = R.peer = new Peer(PREFIX + code, peerOptions());
    peer.on("open", () => { R.me = "p0"; R.lobby = [{ pid: "p0", name, look: myLook() }]; render(); });
    peer.on("error", (err) => {
      if (R.peer !== peer) return;
      if (err.type === "unavailable-id" && (retry || 0) < 3) return host((retry || 0) + 1);
      if (!R.me) { shutdown(); render(); msg("建立房間失敗，請檢查網路後再試。", true); }
    });
    peer.on("disconnected", () => { try { if (R.peer === peer && !peer.destroyed) peer.reconnect(); } catch (e) {} });
    peer.on("connection", (conn) => {
      conn.on("data", (d) => hostData(conn, d));
      conn.on("close", () => hostDrop(conn));
      conn.on("error", () => hostDrop(conn));
    });
    R.beat = setInterval(() => {                               // guests that went silent are gone
      const now = Date.now();
      for (const pid in R.conns) if (now - R.conns[pid].seen > 12000) hostDrop(R.conns[pid]);
    }, 3000);
  }
  function hostData(conn, d) {
    if (R.role !== "host" || !d || typeof d !== "object") return;
    conn.seen = Date.now();
    if (d.t === "hello") {
      if (conn.pid) return;
      if (R.started) return sendTo(conn, { t: "no", why: "started" });
      if (R.lobby.length >= MAX) return sendTo(conn, { t: "no", why: "full" });
      conn.pid = "p" + R.nextPid++;
      R.conns[conn.pid] = conn;
      const l = d.look && typeof d.look === "object" ? d.look : {};
      R.lobby.push({ pid: conn.pid, name: String(d.name || "玩家").slice(0, 12), look: { char: String(l.char || ""), skin: String(l.skin || ""), weapon: String(l.weapon || "") } });
      sendTo(conn, Object.assign({ you: conn.pid }, lobbyMsg()));
      broadcast(lobbyMsg()); render();
      return;
    }
    if (!conn.pid) return;
    if (d.t === "bye") return hostDrop(conn);
    if (R.started && (d.t === "k" || d.t === "i")) UI.hostInput(conn.pid, d);
  }
  function hostDrop(conn) {
    if (R.role !== "host" || !conn.pid || R.conns[conn.pid] !== conn) return;
    const pid = conn.pid;
    delete R.conns[pid];
    try { conn.close(); } catch (e) {}
    R.lobby = R.lobby.filter((p) => p.pid !== pid);
    if (R.started) UI.hostInput(pid, { t: "bye" });
    else { broadcast(lobbyMsg()); if (UI.S.screen === "room") render(); }
  }
  function startGame() {
    if (R.role !== "host" || R.lobby.length < 2 || R.started) return;
    R.started = true; R.out = [];
    R.settings = { mode: UI.S.prefs.mode, diff: UI.S.prefs.diff, grade: UI.S.prefs.grade, seed: (Math.random() * 0xffffffff) >>> 0, scene: UI.myEquip().scene };
    R.lobby[0].look = myLook();
    const players = R.lobby.map((p) => ({ pid: p.pid, name: p.name, look: p.look }));
    broadcast({ t: "start", settings: R.settings, count: players.length });
    UI.beginHost(players, R.settings);
    sync(true);
  }
  // snapshots: at once after a key (typing must feel instant), otherwise ~15 a second from ui.js
  function sync(now) {
    if (R.role !== "host" || !R.started) return;
    if (now) { if (!R.flush) R.flush = setTimeout(() => { R.flush = 0; sendSnap(); }, 0); return; }
    sendSnap();
  }
  function sendSnap() {
    const G = UI.S.G;
    if (!G || R.role !== "host") return;
    broadcast({ t: "s", s: E.snapshot(G), ev: R.out.splice(0) });
  }
  function queue(evs) { if (Object.keys(R.conns).length) for (const e of evs) R.out.push(e); else R.out.length = 0; }

  /* ---------- guest ---------- */
  function join() {
    const code = ($("#mp-code-in").value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 5) return msg("請輸入 5 個字的房號。", true);
    shutdown();
    const name = myName();
    R.role = "guest"; R.code = code;
    msg("連線中…");
    const peer = R.peer = new Peer(peerOptions());
    const fail = (text) => { if (R.peer !== peer) return; shutdown(); render(); msg(text, true); };
    R.joinTimer = setTimeout(() => { if (!R.me) fail("連不上房間 " + code + "。請檢查房號，或請房主重新建立房間。"); }, 15000);
    peer.on("error", (err) => { if (!R.me) fail(err.type === "peer-unavailable" ? "找不到房間 " + code + "，請檢查房號。" : "連線失敗，請檢查網路後再試。"); });
    peer.on("open", () => {
      const conn = R.host = peer.connect(PREFIX + code, { reliable: true, serialization: "json" });
      conn.on("open", () => sendTo(conn, { t: "hello", name, look: myLook() }));
      conn.on("data", guestData);
      conn.on("close", () => { if (R.peer === peer && R.me) leave("和房主的連線斷了。"); });
    });
    R.beat = setInterval(() => {
      if (!R.me) return;
      sendTo(R.host, { t: "p" });
      if (R.started && Date.now() - R.lastMsg > 10000) leave("和房主的連線斷了。");
    }, 2500);
  }
  function guestData(d) {
    if (R.role !== "guest" || !d || typeof d !== "object") return;
    R.lastMsg = Date.now();
    if (d.t === "no") { const why = d.why; shutdown(); render(); return msg(why === "full" ? "房間已經滿了（最多 6 人）。" : "這個房間已經開始遊戲了，請等下一場。", true); }
    if (d.t === "lobby") {
      if (d.you) { R.me = d.you; clearTimeout(R.joinTimer); }
      R.lobby = d.players || []; R.settings = d.settings; R.started = false;
      if (UI.S.screen === "room" || UI.S.screen === "game" || UI.S.screen === "pause") { UI.stopGame(); UI.show("room"); }
      if (UI.S.screen === "room") render();
    } else if (d.t === "start") {
      R.started = true; R.settings = d.settings;
      UI.beginGuest(R.me, d.settings, d.count);
    } else if (d.t === "s") UI.applySnap(d.s, d.ev);
    else if (d.t === "closed") leave("房主關閉了房間。");
  }
  const send = (m) => { if (R.role === "guest") sendTo(R.host, m); };

  $("#btn-multi").onclick = open;
  $("#btn-mp-create").onclick = () => host();
  $("#btn-mp-join").onclick = join;
  $("#mp-code-in").addEventListener("keydown", (ev) => { if (ev.key === "Enter") join(); });
  $("#btn-mp-start").onclick = startGame;
  $("#btn-mp-leave").onclick = () => leave();
  $("#btn-mp-back").onclick = () => { shutdown(); UI.toMenu(); };
  addEventListener("pagehide", () => { if (R.role === "host") broadcast({ t: "closed" }); else if (R.host) sendTo(R.host, { t: "bye" }); });

  window.TSRoom = { sync, queue, send, leave, backToLobby, state: () => R };
})();
