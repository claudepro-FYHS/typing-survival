/* 打字求生 Typing Survival — 設定
 * APPS_SCRIPT_URL：Apps Script「部署 → 網頁應用程式」的網址。留空 = 單機模式（沒有登入和排行榜）。
 * 班級選單、Google Client ID、學年等都在 Google Sheet 的「Settings」分頁裡改。 */
window.TS_CONFIG = {
  // 多人連線的配對伺服器。null = 使用免費的 PeerJS 公用服務，不用改。
  PEER_SERVER: null,
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxuuPzfCxSNfNMJV_zAo0l0nMp_jErzyQqOqlTvUL-VD24tfhWK7oEzF1QxBR0p1pGe7g/exec",
};
window.APP_VERSION = "0.3.0";
