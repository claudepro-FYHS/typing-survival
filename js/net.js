/* =====================================================================
 *  Typing Survival — talking to the Apps Script backend, and the session.
 *  Tests can replace the backend with window.__TSV_FAKE_API(action, body).
 * ===================================================================== */
(function () {
  "use strict";
  const CFG = window.TS_CONFIG || {};
  const N = { url: CFG.APPS_SCRIPT_URL || "", token: "", email: "", player: null, config: null };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // offline = the backend did not answer: the game still works, without sign-in and leaderboards
  N.enabled = () => !!(N.url || window.__TSV_FAKE_API) && !N.offline;

  // "busy" = the whole class is saving at once: wait a random moment and ask again.
  N.post = async function (action, body, tries) {
    tries = tries || 4;
    const payload = Object.assign({ action }, body || {});
    for (let i = 0; ; i++) {
      try {
        let j;
        if (window.__TSV_FAKE_API) j = await window.__TSV_FAKE_API(action, payload);
        else {
          const res = await fetch(N.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
          j = await res.json();
        }
        if (j && (j.error === "busy" || j.error === "google_busy")) throw new Error(j.error);
        return j;
      } catch (e) {
        if (i >= tries - 1) return { ok: false, error: "network" };
        await sleep(700 * (i + 1) + Math.random() * 1300);
      }
    }
  };

  function remember() { try { if (N.token) localStorage.setItem("tsv_session", N.token); else localStorage.removeItem("tsv_session"); } catch (e) {} }
  function take(r) { if (r && r.ok && r.player) { N.player = r.player; N.email = r.email || N.email; } return r; }

  N.loadConfig = async function () { const r = await N.post("config", null, 2); if (r && r.ok) N.config = r; else N.offline = true; return r; };
  N.restore = async function () {
    let tok = ""; try { tok = localStorage.getItem("tsv_session") || ""; } catch (e) {}
    if (!tok) return null;
    const r = await N.post("me", { token: tok });
    if (r && r.ok) { N.token = tok; take(r); } else if (r && r.error === "session_expired") { N.token = ""; remember(); }
    return r;
  };
  N.login = async function (idToken) {
    const r = await N.post("login", { idToken });
    if (r && r.ok) { N.token = r.token; remember(); take(r); }
    return r;
  };
  N.logout = function () { N.token = ""; N.email = ""; N.player = null; remember(); };
  N.saveProfile = async (data) => take(await N.post("saveProfile", Object.assign({ token: N.token }, data)));
  N.submitScore = (data) => N.post("submitScore", Object.assign({ token: N.token }, data), 6);
  N.leaderboard = (scope, mode, diff, group) => N.post("leaderboard", { token: N.token, scope, mode, diff, group }, 2);
  N.classes = () => N.post("classes", { token: N.token }, 2);
  N.ready = () => !!(N.token && N.player && !N.player.needsProfile);

  window.TSNet = N;
})();
