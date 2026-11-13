/* =====================================================================
 *  Typing Survival — the shop screen: characters, skins, scenes, weapons.
 *  What exists is in shop.js; who owns what comes from the backend
 *  (TSNet.player: coins, owned, equip, all).
 * ===================================================================== */
(function () {
  "use strict";
  const UI = window.TSUI, N = window.TSNet, SH = window.TS_SHOP, RD = window.TSRender, $ = UI.$, esc = UI.esc;
  const TABS = { char: "角色", skin: "造型", scene: "場景", weapon: "武器" };
  const ERR = {
    network: "連不上伺服器，請稍後再試。", busy: "伺服器正忙，請再按一次。", session_expired: "登入已過期，請重新登入。", no_profile: "要先登入並填好資料才能買東西。",
    not_enough: "金幣不夠。", need_char: "要先擁有這個角色。", already_owned: "你已經有了。", not_for_sale: "這個不能用買的。", bad_item: "找不到這個商品。",
  };
  const V = { tab: "char", confirm: "", busy: false, note: "" };
  const me = () => (N.token && N.player && !N.player.needsProfile ? N.player : null);
  const equip = () => (me() ? me().equip : SH.DEFAULT);
  const price = (it) => (N.config && N.config.prices && N.config.prices[it.id] != null ? N.config.prices[it.id] : it.price);
  function owns(it) { const p = me(); return it.price === 0 && !it.unlock ? true : !!p && (p.all || p.owned.indexOf(it.id) !== -1); }
  function using(it) {
    const e = equip();
    return it.type === "char" ? e.char === it.id && !e.skin : it.type === "skin" ? e.skin === it.id : it.type === "scene" ? e.scene === it.key : e.weapon === it.key;
  }
  const items = (type) => Object.keys(SH.byId).map((k) => SH.byId[k]).filter((x) => x.type === type);

  /* ---------- pictures ---------- */
  const sceneThumbs = {};
  function paint(cv, it) {
    const c = cv.getContext("2d"), e = equip();
    c.clearRect(0, 0, cv.width, cv.height);
    if (it.type === "scene") {
      const g = sceneThumbs[it.key] || (sceneThumbs[it.key] = RD.makeGround(it.key));
      c.drawImage(g, 290, 160, 700, 400, 0, 0, cv.width, cv.height);
      return;
    }
    const sel = it.type === "char" ? { char: it.id, weapon: e.weapon } : it.type === "skin" ? { char: it.char, skin: it.id, weapon: e.weapon } : { char: e.char, skin: e.skin, weapon: it.key };
    c.fillStyle = "#3c6b4a"; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = "rgba(0,0,0,.2)"; c.beginPath(); c.ellipse(cv.width / 2 - 8, cv.height / 2 + 42, 40, 12, 0, 0, 7); c.fill();
    c.save(); c.translate(cv.width / 2 - 8, cv.height / 2 + 2); c.scale(1.7, 1.7);
    RD.avatar(c, 0, 0, SH.lookOf(sel), 1.3, { aim: -0.15, still: true });
    c.restore();
  }

  /* ---------- the screen ---------- */
  function button(it) {
    const p = me(), cost = price(it);
    if (using(it)) return `<button class="sb on" disabled>使用中</button>`;
    if (owns(it)) return `<button class="sb use" data-use="${it.id}">使用</button>`;
    if (it.unlock) return `<button class="sb lock" disabled>${esc(it.how)}</button>`;
    if (!p) return `<button class="sb buy" data-login="1"><i class="coin"></i>${cost}</button>`;
    if (it.type === "skin" && !owns(SH.byId[it.char])) return `<button class="sb lock" disabled>先擁有「${esc(SH.byId[it.char].name)}」</button>`;
    if (p.coins < cost) return `<button class="sb lock" disabled><i class="coin"></i>${cost}　還差 ${cost - p.coins}</button>`;
    if (V.confirm === it.id) return `<button class="sb sure" data-buy="${it.id}">確定用 ${cost} 金幣買？</button>`;
    return `<button class="sb buy" data-ask="${it.id}"><i class="coin"></i>${cost}　購買</button>`;
  }
  function render() {
    const p = me();
    $("#shop-coins").innerHTML = p ? (p.all ? "老師帳號：全部可用" : `<i class="coin"></i>${p.coins.toLocaleString()}`) : "登入並填好資料後才能買和使用";
    $("#shop-tabs").innerHTML = Object.keys(TABS).map((k) => `<button data-tab="${k}" class="${V.tab === k ? "sel" : ""}">${TABS[k]}</button>`).join("");
    const list = items(V.tab);
    $("#shop-grid").innerHTML = list.map((it, i) =>
      `<div class="sc-card${using(it) ? " on" : ""}${it.tier ? " t-" + it.tier : ""}"><canvas width="170" height="120" data-i="${i}"></canvas>` +
      `<b>${esc(it.name)}${it.tier ? `<em>${SH.TIER[it.tier]}</em>` : ""}</b>` +
      `<span>${esc(it.type === "char" ? it.desc : it.type === "skin" ? SH.byId[it.char].name + "的造型" : it.type === "scene" ? "只換背景" : "只換子彈的樣子")}</span>${button(it)}</div>`).join("");
    $("#shop-grid").querySelectorAll("canvas").forEach((cv) => paint(cv, list[+cv.dataset.i]));
    $("#shop-msg").textContent = V.note;
  }
  async function act(kind, id) {
    if (V.busy) return;
    const it = SH.byId[id];
    V.busy = true; V.note = kind === "buy" ? "購買中…" : "更換中…"; $("#shop-msg").textContent = V.note;
    let r;
    if (kind === "buy") r = await N.buy(id);
    else {
      const e = Object.assign({}, equip());
      if (it.type === "char") { e.char = it.id; e.skin = ""; } else if (it.type === "skin") { e.char = it.char; e.skin = it.id; } else e[it.type] = it.key;
      r = await N.equip(e);
    }
    V.busy = false; V.confirm = "";
    V.note = r && r.ok ? (kind === "buy" ? `買到「${it.name}」了！按「使用」換上。` : "") : ERR[r && r.error] || ERR.network;
    render();
  }
  function open() { V.confirm = ""; V.note = ""; UI.show("shop"); render(); }

  $("#shop-tabs").onclick = (ev) => { const b = ev.target.closest("button"); if (!b) return; V.tab = b.dataset.tab; V.confirm = ""; V.note = ""; render(); };
  $("#shop-grid").onclick = (ev) => {
    const b = ev.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.login) { V.note = "請先回主畫面登入，並填好資料。"; $("#shop-msg").textContent = V.note; }
    else if (b.dataset.ask) { V.confirm = b.dataset.ask; V.note = ""; render(); }
    else if (b.dataset.buy) act("buy", b.dataset.buy);
    else if (b.dataset.use) act("use", b.dataset.use);
  };
  $("#btn-shop").onclick = open;
  $("#btn-shop-back").onclick = () => { UI.renderMenu(); UI.show("menu"); };

  window.TSShopUI = { open, render };
})();
