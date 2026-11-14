/* =====================================================================
 *  打字求生 Typing Survival — 商店目錄 (shop catalogue)
 *  What exists, what it looks like and its default price. Prices can be
 *  changed in the Google Sheet (Shop tab); the ids here must match the
 *  SHOP list in apps-script/Code.gs (tests/backend.test.js checks that).
 *
 *  Characters differ in what they start with; skins, scenes and weapons
 *  only change the look.
 * ===================================================================== */
(function (root) {
  const TIER = { common: "普通", rare: "稀有", legend: "傳說", feat: "成就" };
  const chars = [
    { id: "student", name: "學生",   price: 0,   desc: "沒有特殊能力。",                       look: { body: "#ffb84d", hat: "cap",    hatCol: "#34506b" } },
    { id: "medic",   name: "醫護兵", price: 300, desc: "開場帶 1 個醫療包；醫療包回 50 血。",   look: { body: "#f1f3f4", hat: "cross",  hatCol: "#f1f3f4" } },
    { id: "bomber",  name: "爆破手", price: 300, desc: "開場帶 1 個炸彈；炸彈範圍更大。",       look: { body: "#7c8a45", hat: "helmet", hatCol: "#55622d" } },
    { id: "froster", name: "冰凍師", price: 300, desc: "開場帶 1 個冰凍；冰凍持續 7 秒。",       look: { body: "#6ec6e8", hat: "beanie", hatCol: "#2f78ad" } },
    { id: "guard",   name: "盾衛",   price: 300, desc: "開場帶 1 個護盾；生命上限 120。",       look: { body: "#8f99a8", hat: "visor",  hatCol: "#5a6473" } },
    { id: "lucky",   name: "幸運兒", price: 300, desc: "你擊倒的喪屍更常掉道具箱。",           look: { body: "#63c56d", hat: "clover", hatCol: "#2f8a45" } },
  ];
  // look = what changes compared with the character's own look
  const skins = [
    { id: "student.red",    char: "student", tier: "common", price: 80,  name: "紅色外套",   look: { body: "#e8574e", hatCol: "#7a2320" } },
    { id: "student.purple", char: "student", tier: "common", price: 80,  name: "紫色外套",   look: { body: "#9a6fe0", hatCol: "#4a2f85" } },
    { id: "student.ninja",  char: "student", tier: "rare",   price: 200, name: "忍者",       look: { body: "#39424e", hat: "band", hatCol: "#d8383f", extra: "scarf", extraCol: "#d8383f" } },
    { id: "student.gold",   char: "student", tier: "legend", price: 500, name: "金色傳說",   look: { body: "#ffd447", hatCol: "#b8860b", aura: "gold" } },
    { id: "student.hero",   char: "student", tier: "feat",   price: 0,   name: "救援英雄",   look: { body: "#3f6fd8", hatCol: "#1f3f8f", extra: "cape", extraCol: "#e8433b" }, unlock: "revives100", how: "累計救起隊友 100 次" },

    { id: "medic.pink",     char: "medic",   tier: "common", price: 80,  name: "粉紅制服",   look: { body: "#ffb3c7", hatCol: "#ffb3c7" } },
    { id: "medic.green",    char: "medic",   tier: "common", price: 80,  name: "手術綠",     look: { body: "#7fd1b3", hatCol: "#7fd1b3" } },
    { id: "medic.doctor",   char: "medic",   tier: "rare",   price: 200, name: "口罩醫生",   look: { body: "#dfe9f0", hatCol: "#4fa3c7", extra: "mask", extraCol: "#bfe3f2" } },
    { id: "medic.master",   char: "medic",   tier: "feat",   price: 0,   name: "打字大師",   look: { body: "#2b2f4a", hatCol: "#ffd447", extra: "cape", extraCol: "#ffd447", aura: "gold" }, unlock: "rank7", how: "打字檢定達到 7 級" },

    { id: "bomber.desert",  char: "bomber",  tier: "common", price: 80,  name: "沙漠迷彩",   look: { body: "#c9a868", hatCol: "#8f7440" } },
    { id: "bomber.navy",    char: "bomber",  tier: "common", price: 80,  name: "海軍藍",     look: { body: "#3d5a80", hatCol: "#293d59" } },
    { id: "bomber.hardhat", char: "bomber",  tier: "rare",   price: 200, name: "工程師",     look: { body: "#f08a3c", hat: "helmet", hatCol: "#ffd23f", extra: "stripe", extraCol: "#fff3b0" } },
    { id: "bomber.hunter",  char: "bomber",  tier: "feat",   price: 0,   name: "喪屍獵人",   look: { body: "#4a3b34", hatCol: "#2b221e", extra: "mask", extraCol: "#2b221e" }, unlock: "kills5000", how: "累計擊倒 5,000 隻喪屍" },

    { id: "froster.mint",   char: "froster", tier: "common", price: 80,  name: "薄荷",       look: { body: "#9fe8cf", hatCol: "#3f9f86" } },
    { id: "froster.navy",   char: "froster", tier: "common", price: 80,  name: "深海",       look: { body: "#3f66b8", hatCol: "#22386b" } },
    { id: "froster.penguin",char: "froster", tier: "rare",   price: 200, name: "企鵝裝",     look: { body: "#2c3440", hat: "beanie", hatCol: "#2c3440", extra: "belly", extraCol: "#ffffff" } },
    { id: "froster.aurora", char: "froster", tier: "legend", price: 500, name: "極光",       look: { body: "#7af0d8", hatCol: "#6a5acd", aura: "aurora" } },

    { id: "guard.bronze",   char: "guard",   tier: "common", price: 80,  name: "青銅",       look: { body: "#c08a4e", hatCol: "#8a5f30" } },
    { id: "guard.black",    char: "guard",   tier: "common", price: 80,  name: "黑鐵",       look: { body: "#4a4f58", hatCol: "#2b2f36" } },
    { id: "guard.robot",    char: "guard",   tier: "rare",   price: 200, name: "機器人",     look: { body: "#b8c4d0", hatCol: "#7f8fa0", extra: "antenna", extraCol: "#ff5a4d" } },
    { id: "guard.knight",   char: "guard",   tier: "legend", price: 500, name: "聖騎士",     look: { body: "#e9eef5", hatCol: "#c9a227", extra: "cape", extraCol: "#3f6fd8", aura: "holy" } },

    { id: "lucky.orange",   char: "lucky",   tier: "common", price: 80,  name: "橘子",       look: { body: "#ff9a3c", hatCol: "#c2661a" } },
    { id: "lucky.pink",     char: "lucky",   tier: "common", price: 80,  name: "櫻花",       look: { body: "#ff9ec4", hatCol: "#d45a8c" } },
    { id: "lucky.bunny",    char: "lucky",   tier: "rare",   price: 200, name: "兔子",       look: { body: "#f6f1e6", hat: "band", hatCol: "#f6f1e6", extra: "ears", extraCol: "#ffb3c7" } },
    { id: "lucky.combo",    char: "lucky",   tier: "feat",   price: 0,   name: "連擊之星",   look: { body: "#ff6fb5", hatCol: "#7a3fd8", aura: "rainbow" }, unlock: "combo100", how: "單場達到 100 連擊" },
  ];
  const scenes = [
    { id: "park",   name: "公園",     price: 0 },
    { id: "school", name: "學校操場", price: 250 },
    { id: "night",  name: "夜晚街道", price: 250 },
    { id: "snow",   name: "雪地",     price: 250 },
  ];
  const weapons = [
    { id: "keyboard", name: "鍵盤槍", price: 0,   col: "#ffd23f" },
    { id: "water",    name: "水槍",   price: 150, col: "#5ec8ff" },
    { id: "laser",    name: "雷射槍", price: 150, col: "#ff5a6e" },
    { id: "wand",     name: "魔法杖", price: 150, col: "#c79bff" },
    { id: "sling",    name: "彈弓",   price: 150, col: "#d9a066" },
  ];
  const byId = {};
  chars.forEach((x) => (byId[x.id] = Object.assign({ type: "char" }, x)));
  skins.forEach((x) => (byId[x.id] = Object.assign({ type: "skin" }, x)));
  scenes.forEach((x) => (byId["scene." + x.id] = Object.assign({ type: "scene" }, x, { id: "scene." + x.id, key: x.id })));
  weapons.forEach((x) => (byId["weapon." + x.id] = Object.assign({ type: "weapon" }, x, { id: "weapon." + x.id, key: x.id })));

  // what a player with this choice looks like: the character's look + the skin's changes
  function lookOf(sel) {
    sel = sel || {};
    const c = byId[sel.char] && byId[sel.char].type === "char" ? byId[sel.char] : byId.student;
    const s = byId[sel.skin] && byId[sel.skin].type === "skin" && byId[sel.skin].char === c.id ? byId[sel.skin] : null;
    const w = byId["weapon." + sel.weapon] ? sel.weapon : "keyboard";
    return Object.assign({ char: c.id, weapon: w, weaponCol: byId["weapon." + w].col }, c.look, s ? s.look : null);
  }
  const DEFAULT = { char: "student", skin: "", scene: "park", weapon: "keyboard" };
  const API = { TIER, chars, skins, scenes, weapons, byId, lookOf, DEFAULT };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.TS_SHOP = API;
})(typeof window !== "undefined" ? window : globalThis);
