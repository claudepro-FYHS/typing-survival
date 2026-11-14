/* =====================================================================
 *  打字求生 Typing Survival — backend
 *  Apps Script web app bound to the game's Google Sheet.
 *  Deploy: Execute as "Me", access "Anyone". Run setup() once.
 *
 *  Sheets: Players (one row per account), Scores (one row per account +
 *  year + mode + difficulty = that year's best), Settings, Teachers,
 *  BannedWords. A new school year starts by itself on 1 January (or set
 *  Settings → SchoolYear); old years stay in Scores.
 * ===================================================================== */

var SHEET_PLAYERS = 'Players', SHEET_SCORES = 'Scores', SHEET_SETTINGS = 'Settings',
    SHEET_TEACHERS = 'Teachers', SHEET_BANNED = 'BannedWords';
var PLAYER_HEADERS = ['Email', 'Name', 'Nickname', 'Class', 'Seat No', 'Class Year', 'First Seen', 'Last Played', 'Games',
                      'Coins', 'Owned', 'Using', 'Coin Day', 'Games That Day', 'Totals', 'Gifts Taken'];
var SCORE_HEADERS = ['Year', 'Email', 'Mode', 'Difficulty', 'Score', 'Wave', 'Kills', 'WPM', 'Accuracy %', 'Max Combo', 'Seconds', 'Time'];
var TEACHER_HEADERS = ['Email', 'Note'];
var DEFAULT_SETTINGS = [
  ['Key', 'Value', '說明'],
  ['GoogleClientId', '', 'Google 登入用的 Client ID'],
  ['SchoolDomain', 'foonyew.edu.my', '學校電郵網域'],
  ['SchoolYear', '', '空白 = 今年。每年排行榜重新開始'],
  ['Grades', 'J1,J2,J3,S1S,S1AC,S2S,S2AC,S3S,S3AC', '學生選班級時的年段／科別選單'],
  ['MaxClassNo', '30', '班號最大值'],
  ['MaxSeatNo', '60', '座號最大值'],
  ['AllowOtherAccounts', 'YES', 'YES = 非學校 Google 帳號可登入（公開榜）'],
  ['LeaderboardSize', '50', '排行榜顯示幾名'],
  ['CoinFullGamesPerDay', '3', '每天前幾場拿全額金幣'],
  ['CoinLaterPercent', '30', '超過之後每場拿幾 % 金幣'],
];
var MODES = ['classic', 'free'], DIFFS = ['easy', 'normal', 'hard'], ALL = 'all';
var STAFF_CLASS = 'STAFF';
var TOKEN_HOURS = 12;
var TZ = 'Asia/Kuala_Lumpur';
var MAX_WPM = 220;

/* ------------------------------------------------------------------ */
/*  Setup and settings                                                 */
/* ------------------------------------------------------------------ */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEET_PLAYERS, PLAYER_HEADERS);
  ensureSheet_(ss, SHEET_SCORES, SCORE_HEADERS);
  ensureSheet_(ss, SHEET_TEACHERS, TEACHER_HEADERS);
  ensureSheet_(ss, SHEET_BANNED, ['Banned nickname words']);
  var st = ensureSheet_(ss, SHEET_SETTINGS, DEFAULT_SETTINGS[0]);
  var have = {};
  st.getDataRange().getValues().forEach(function (r) { have[String(r[0]).trim()] = true; });
  DEFAULT_SETTINGS.slice(1).forEach(function (r) { if (!have[r[0]]) st.appendRow(r); });
  getSecret_();
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var first = sh.getDataRange().getValues()[0] || [];
  if (!String(first[0] || '')) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function getSecret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('TOKEN_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('TOKEN_SECRET', s); }
  return s;
}

function ymd_(d) {
  var t = new Date(d.getTime() + 8 * 3600 * 1000); // Malaysia time, no daylight saving
  return t.getUTCFullYear() + '-' + ('0' + (t.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + t.getUTCDate()).slice(-2);
}

var SETTINGS_MEMO_ = null;
function getSettings_() {
  if (SETTINGS_MEMO_) return SETTINGS_MEMO_;
  var st = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS);
  if (!st) { setup(); st = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS); }
  var out = {};
  st.getDataRange().getValues().forEach(function (r) { out[String(r[0]).trim()] = String(r[1] == null ? '' : r[1]).trim(); });
  out.domain = (out.SchoolDomain || 'foonyew.edu.my').toLowerCase();
  out.year = /^\d{4}$/.test(out.SchoolYear || '') ? out.SchoolYear : ymd_(new Date()).slice(0, 4);
  out.grades = String(out.Grades || '').toUpperCase().split(/[,，、;\s]+/).filter(String);
  out.maxClass = Number(out.MaxClassNo) || 30;
  out.maxSeat = Number(out.MaxSeatNo) || 60;
  out.allowOthers = String(out.AllowOtherAccounts || 'YES').toUpperCase() !== 'NO';
  out.boardSize = Math.max(10, Math.min(200, Number(out.LeaderboardSize) || 50));
  out.coinFull = out.CoinFullGamesPerDay === undefined || out.CoinFullGamesPerDay === '' ? 3 : Math.max(0, Number(out.CoinFullGamesPerDay) || 0);
  out.coinLater = out.CoinLaterPercent === undefined || out.CoinLaterPercent === '' ? 30 : Math.max(0, Math.min(100, Number(out.CoinLaterPercent) || 0));
  SETTINGS_MEMO_ = out;
  return out;
}

// Junior classes use a 2-digit number (J203); senior classes don't (S1S2, S1AC1).
function classCode_(grade, n) { return /^J\d$/.test(grade) ? grade + ('0' + n).slice(-2) : grade + n; }
function gradeOf_(cls) { return /^[JS]\d/.test(cls) ? cls.slice(0, 2) : ''; }
function isSchool_(email, s) { return String(email).toLowerCase().split('@')[1] === s.domain; }

/* ------------------------------------------------------------------ */
/*  Web app                                                            */
/* ------------------------------------------------------------------ */

function doGet(e) {
  SETTINGS_MEMO_ = null; PRICES_MEMO_ = null;
  try {
    if (e && e.parameter && e.parameter.action === 'config') return json_(config_());
    return json_({ ok: true, message: 'Typing Survival backend is running.' });
  } catch (err) { return json_({ ok: false, error: 'server', message: String(err) }); }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return json_({ ok: false, error: 'bad_request' }); }
  SETTINGS_MEMO_ = null; PRICES_MEMO_ = null;
  try {
    switch (body.action) {
      case 'config': return json_(config_());
      case 'login': return json_(login_(body));
      case 'me': return json_(me_(body));
      case 'saveProfile': return json_(withLock_(function () { return saveProfile_(body); }));
      case 'submitScore': return json_(withLock_(function () { return submitScore_(body); }));
      case 'leaderboard': return json_(leaderboard_(body));
      case 'buy': return json_(withLock_(function () { return buy_(body); }));
      case 'equip': return json_(withLock_(function () { return equip_(body); }));
      case 'testInfo': return json_(testInfo_(body));
      case 'testStart': return json_(withLock_(function () { return testStart_(body); }));
      case 'testPing': return json_(testPing_(body));
      case 'testFinish': return json_(withLock_(function () { return testFinish_(body); }));
      case 'selfStart': return json_(selfStart_(body));
      case 'selfFinish': return json_(withLock_(function () { return selfFinish_(body); }));
      case 'myKeys': return json_(myKeys_(body));
      case 'addKeys': return json_(withLock_(function () { return addKeys_(body); }));
      case 'tTests': return json_(tTests_(body));
      case 'tCreate': return json_(withLock_(function () { return tCreate_(body); }));
      case 'tUpdate': return json_(withLock_(function () { return tUpdate_(body); }));
      case 'tExtra': return json_(withLock_(function () { return tExtra_(body); }));
      case 'tEnd': return json_(withLock_(function () { return tEnd_(body); }));
      case 'tMonitor': return json_(tMonitor_(body));
      case 'tKeys': return json_(tKeys_(body));
      case 'classes': return json_(classes_(body));
    }
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) { return json_({ ok: false, error: 'server', message: String(err) }); }
}

function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

// A whole class saves at once: requests queue for the lock. If the queue is too long, answer
// "busy" (the page waits a moment and tries again) instead of failing.
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(28000)) return { ok: false, error: 'busy' };
  try { return fn(); } finally { lock.releaseLock(); }
}

function config_() {
  var s = getSettings_();
  return { ok: true, clientId: s.GoogleClientId || '', domain: s.domain, year: s.year, grades: s.grades,
           maxClass: s.maxClass, maxSeat: s.maxSeat, allowOthers: s.allowOthers,
           prices: prices_(), coinFull: s.coinFull, coinLater: s.coinLater, testActive: testActive_() };
}

/* ------------------------------------------------------------------ */
/*  Sign-in                                                            */
/* ------------------------------------------------------------------ */

function login_(body) {
  var s = getSettings_();
  if (!s.GoogleClientId) return { ok: false, error: 'no_client_id' };
  var res = null, code = 0;
  for (var attempt = 0; attempt < 4; attempt++) { // Google can answer "busy" when a class signs in together
    if (attempt) Utilities.sleep(400 * attempt + Math.floor(Math.random() * 400));
    try {
      res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(String(body.idToken || '')), { muteHttpExceptions: true });
      code = res.getResponseCode();
    } catch (e) { code = 0; }
    if (code === 200 || code === 400 || code === 401) break;
  }
  if (code === 400 || code === 401) return { ok: false, error: 'bad_token' };
  if (code !== 200) return { ok: false, error: 'google_busy' };
  var info = JSON.parse(res.getContentText());
  if (info.aud !== s.GoogleClientId || String(info.email_verified) !== 'true') return { ok: false, error: 'bad_token' };
  var email = String(info.email || '').toLowerCase();
  if (!isSchool_(email, s) && !s.allowOthers) return { ok: false, error: 'not_school', email: email };
  var out = account_(email, String(info.name || ''));
  out.token = makeToken_(email, String(info.name || ''));
  return out;
}

function me_(body) {
  var t = checkToken_(body.token);
  if (!t) return { ok: false, error: 'session_expired' };
  return account_(t.e, t.n || '');
}

function makeToken_(email, name) {
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({ e: email, n: name, x: Date.now() + TOKEN_HOURS * 3600 * 1000 }));
  return payload + '.' + sign_(payload);
}
function sign_(payload) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, getSecret_())); }
function checkToken_(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 2 || sign_(parts[0]) !== parts[1]) return null;
  var data;
  try { data = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); } catch (e) { return null; }
  if (!data || !data.e || Date.now() > data.x) return null;
  return data;
}

/* ------------------------------------------------------------------ */
/*  Players                                                            */
/* ------------------------------------------------------------------ */

function teacherMap_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TEACHERS), map = {};
  if (sh) sh.getDataRange().getValues().slice(1).forEach(function (r) { var e = String(r[0]).trim().toLowerCase(); if (e) map[e] = true; });
  return map;
}
function rowToPlayer_(r) {
  var st = parse_(r[14], {});
  return { email: String(r[0]).trim().toLowerCase(), name: String(r[1] || ''), nick: String(r[2] || ''), cls: String(r[3] || '').toUpperCase(),
           seat: Number(r[4]) || 0, classYear: String(r[5] || ''), first: r[6] || '', last: r[7] || '', games: Number(r[8]) || 0,
           coins: Math.max(0, Math.floor(Number(r[9]) || 0)), owned: list_(r[10]), equip: parse_(r[11], {}),
           day: r[12] instanceof Date ? ymd_(r[12]) : String(r[12] || '').replace(/^'/, ''), dayGames: Number(r[13]) || 0,
           stats: { k: Number(st.k) || 0, r: Number(st.r) || 0, c: Number(st.c) || 0, t: Number(st.t) || 0 }, gifts: list_(r[15]) };
}
function playerRow_(p) {
  return [p.email, p.name, p.nick, p.cls, p.seat || '', p.classYear, p.first, p.last, p.games,
          p.coins, p.owned.join(', '), JSON.stringify(p.equip), "'" + p.day, p.dayGames, JSON.stringify(p.stats), p.gifts.join(', ')];
}
function newPlayer_(email, name) {
  return { email: email, name: name || '', nick: '', cls: '', seat: 0, classYear: '', first: new Date(), last: '', games: 0,
           coins: 0, owned: [], equip: {}, day: '', dayGames: 0, stats: { k: 0, r: 0, c: 0, t: 0 }, gifts: [] };
}
function parse_(v, d) { try { var o = JSON.parse(String(v || '')); return o && typeof o === 'object' ? o : d; } catch (e) { return d; } }
function list_(v) { return String(v || '').split(/[,\s]+/).filter(String); }
function findPlayer_(email) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PLAYERS);
  var v = sh.getDataRange().getValues();
  if ((v[0] || []).length < PLAYER_HEADERS.length) sh.getRange(1, 1, 1, PLAYER_HEADERS.length).setValues([PLAYER_HEADERS]); // sheet made before the shop existed
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim().toLowerCase() === email) return { row: i + 1, data: rowToPlayer_(v[i]), sheet: sh };
  return { row: 0, data: null, sheet: sh };
}
function writePlayer_(found, p) {
  if (found.row) found.sheet.getRange(found.row, 1, 1, PLAYER_HEADERS.length).setValues([playerRow_(p)]);
  else found.sheet.appendRow(playerRow_(p));
}

// What the page needs to know about the signed-in account.
function account_(email, googleName) {
  var s = getSettings_(), school = isSchool_(email, s), teacher = !!teacherMap_()[email];
  var p = findPlayer_(email).data, gift = null;
  if (p && pendingGifts_(p, email).length) {          // only then is a write (and the lock) needed
    var got = withLock_(function () {
      var f = findPlayer_(email), list = f.data ? pendingGifts_(f.data, email) : [];
      if (!list.length) return { ok: true, coins: 0, notes: [] };
      var sum = 0, notes = [];
      list.forEach(function (g) { sum += g.coins; f.data.gifts.push(g.key); if (g.note) notes.push(g.note); });
      f.data.coins += sum;
      writePlayer_(f, f.data);
      return { ok: true, coins: sum, notes: notes, p: f.data };
    });
    if (got && got.ok && got.coins) { p = got.p; gift = { coins: got.coins, notes: got.notes }; }
  }
  var out = { ok: true, email: email, year: s.year, player: describe_(p, email, googleName, school, teacher, s) };
  if (gift) out.gift = gift;
  return out;
}
function describe_(p, email, googleName, school, teacher, s) {
  var d = { school: school, teacher: teacher, name: (p && p.name) || googleName || '', nick: (p && p.nick) || '', cls: '', seat: 0, grade: '' };
  if (teacher) d.cls = STAFF_CLASS;
  else if (school && p && p.cls && p.classYear === s.year) { d.cls = p.cls; d.seat = p.seat; d.grade = gradeOf_(p.cls); }
  d.needsProfile = teacher ? false : school ? !d.cls : !d.nick;
  d.coins = p ? p.coins : 0;
  d.all = teacher;                                     // teachers have everything in the shop
  d.owned = teacher ? Object.keys(SHOP) : (p ? p.owned.filter(function (id) { return !!SHOP[id]; }) : []);
  d.equip = cleanEquip_(p ? p.equip : {}, hasFn_(p, teacher));
  return d;
}

function saveProfile_(body) {
  var t = checkToken_(body.token);
  if (!t) return { ok: false, error: 'session_expired' };
  var s = getSettings_(), email = t.e, school = isSchool_(email, s), teacher = !!teacherMap_()[email];
  var found = findPlayer_(email);
  var p = found.data || newPlayer_(email, t.n);
  if (teacher) return { ok: false, error: 'not_needed' };
  if (school) {
    if (p.cls && p.classYear === s.year) return { ok: false, error: 'locked' }; // only a teacher can change it, in the sheet
    var name = String(body.name || '').replace(/\s+/g, ' ').trim();
    var grade = String(body.grade || '').toUpperCase(), n = Number(body.classNo), seat = Number(body.seat);
    if (name.length < 1 || name.length > 30) return { ok: false, error: 'bad_name' };
    if (s.grades.indexOf(grade) === -1) return { ok: false, error: 'bad_class' };
    if (n !== Math.floor(n) || n < 1 || n > s.maxClass) return { ok: false, error: 'bad_class' };
    if (seat !== Math.floor(seat) || seat < 1 || seat > s.maxSeat) return { ok: false, error: 'bad_seat' };
    p.name = name; p.cls = classCode_(grade, n); p.seat = seat; p.classYear = s.year;
  } else {
    var nick = String(body.nick || '').trim();
    var why = checkNickname_(nick);
    if (why) return { ok: false, error: 'bad_nick', message: why };
    p.nick = nick; p.classYear = s.year;
  }
  writePlayer_(found, p);
  return { ok: true, email: email, year: s.year, player: describe_(p, email, t.n || '', school, teacher, s) };
}

/* ------------------------------------------------------------------ */
/*  Scores                                                             */
/* ------------------------------------------------------------------ */

function int_(v) { v = Number(v); return isFinite(v) ? Math.floor(v) : NaN; }

// The page computes the score, so only obvious fakes can be caught here: impossible typing speed,
// more hits than keys, or more points than those keys could ever earn.
function plausible_(r) {
  if (!(r.time >= 5 && r.time <= 4 * 3600)) return false;
  if (!(r.keys >= 0 && r.hits >= 0 && r.hits <= r.keys && r.keys <= r.time * 20)) return false;
  if (r.hits / 5 / (r.time / 60) > MAX_WPM) return false;
  if (!(r.wave >= 0 && r.wave <= 500 && r.kills >= 0 && r.kills <= r.hits + r.wave * 20)) return false;
  if (r.wave > 1 && r.time < (r.wave - 1) * 4) return false;
  var maxScore = 35 * r.hits + 50 * r.wave * (r.wave + 1) + 100 * r.kills + 100 * (r.revives || 0);
  if (!(r.score >= 0 && r.score <= maxScore)) return false;
  return r.maxCombo >= 0 && r.maxCombo <= r.hits;
}

function submitScore_(body) {
  var t = checkToken_(body.token);
  if (!t) return { ok: false, error: 'session_expired' };
  var s = getSettings_(), email = t.e, school = isSchool_(email, s), teacher = !!teacherMap_()[email];
  if (MODES.indexOf(body.mode) === -1 || DIFFS.indexOf(body.diff) === -1) return { ok: false, error: 'bad_request' };
  var r = { score: int_(body.score), wave: int_(body.wave), kills: int_(body.kills), hits: int_(body.hits), keys: int_(body.keys),
            time: Number(body.time), maxCombo: int_(body.maxCombo) };
  var coop = body.coop === true;                       // a co-op game: coins and totals, but no leaderboard
  r.revives = coop ? Math.max(0, Math.min(200, int_(body.revives) || 0)) : 0;
  if (!plausible_(r)) return { ok: false, error: 'rejected' };
  var found = findPlayer_(email), p = found.data;
  if (describe_(p, email, t.n || '', school, teacher, s).needsProfile) return { ok: false, error: 'no_profile' };
  if (!p) p = newPlayer_(email, t.n);
  p.last = new Date(); p.games++;
  var coin = earn_(p, r, body.diff, s);
  writePlayer_(found, p);
  if (coop) return { ok: true, ranked: false, reason: 'coop', coins: coin };
  if (body.input === 'touch') return { ok: true, ranked: false, reason: 'touch', coins: coin };

  var wpm = Math.round(r.hits / 5 / (r.time / 60) * 10) / 10, acc = r.keys ? Math.round(r.hits / r.keys * 1000) / 10 : 100;
  var row = [s.year, email, body.mode, body.diff, r.score, r.wave, r.kills, wpm, acc, r.maxCombo, Math.round(r.time), new Date()];
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SCORES), v = sh.getDataRange().getValues(), at = 0, old = null;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === s.year && String(v[i][1]).toLowerCase() === email && v[i][2] === body.mode && v[i][3] === body.diff) { at = i + 1; old = Number(v[i][4]) || 0; break; }
  }
  if (at && old >= r.score) return { ok: true, ranked: true, best: false, bestScore: old, coins: coin };
  if (at) sh.getRange(at, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
  var cache = CacheService.getScriptCache();
  ['class', 'grade', 'school', 'public'].forEach(function (scope) {
    var g = groupFor_(scope, p, school, teacher);
    cache.remove(boardKey_(scope, g, body.mode, body.diff, s.year)); cache.remove(boardKey_(scope, g, ALL, ALL, s.year));
  });
  return { ok: true, ranked: true, best: true, bestScore: r.score, prev: old, coins: coin };
}

/* ------------------------------------------------------------------ */
/*  Shop: coins, characters, skins, scenes, weapons                    */
/* ------------------------------------------------------------------ */

var SHEET_SHOP = 'Shop', SHEET_GIFTS = 'CoinGifts';
// id: [type, default price, the character a skin belongs to, what unlocks it (not for sale)]
// Must list the same ids as shop.js. Prices can be changed in the Shop tab.
var SHOP = {
  'student': ['char', 0], 'medic': ['char', 300], 'bomber': ['char', 300], 'froster': ['char', 300], 'guard': ['char', 300], 'lucky': ['char', 300],
  'student.red': ['skin', 80, 'student'], 'student.purple': ['skin', 80, 'student'], 'student.ninja': ['skin', 200, 'student'],
  'student.gold': ['skin', 500, 'student'], 'student.hero': ['skin', 0, 'student', 'revives100'],
  'medic.pink': ['skin', 80, 'medic'], 'medic.green': ['skin', 80, 'medic'], 'medic.doctor': ['skin', 200, 'medic'],
  'medic.master': ['skin', 0, 'medic', 'rank7'],
  'bomber.desert': ['skin', 80, 'bomber'], 'bomber.navy': ['skin', 80, 'bomber'], 'bomber.hardhat': ['skin', 200, 'bomber'],
  'bomber.hunter': ['skin', 0, 'bomber', 'kills5000'],
  'froster.mint': ['skin', 80, 'froster'], 'froster.navy': ['skin', 80, 'froster'], 'froster.penguin': ['skin', 200, 'froster'],
  'froster.aurora': ['skin', 500, 'froster'],
  'guard.bronze': ['skin', 80, 'guard'], 'guard.black': ['skin', 80, 'guard'], 'guard.robot': ['skin', 200, 'guard'], 'guard.knight': ['skin', 500, 'guard'],
  'lucky.orange': ['skin', 80, 'lucky'], 'lucky.pink': ['skin', 80, 'lucky'], 'lucky.bunny': ['skin', 200, 'lucky'],
  'lucky.combo': ['skin', 0, 'lucky', 'combo100'],
  'scene.park': ['scene', 0], 'scene.school': ['scene', 250], 'scene.night': ['scene', 250], 'scene.snow': ['scene', 250],
  'weapon.keyboard': ['weapon', 0], 'weapon.water': ['weapon', 150], 'weapon.laser': ['weapon', 150], 'weapon.wand': ['weapon', 150], 'weapon.sling': ['weapon', 150]
};
// totals: k = zombies knocked down, r = teammates revived, c = best combo in one game, t = best typing-test level
var UNLOCKS = {
  revives100: function (t) { return t.r >= 100; },
  kills5000: function (t) { return t.k >= 5000; },
  combo100: function (t) { return t.c >= 100; },
  rank7: function (t) { return t.t >= 7; }
};
var COIN_DIFF = { easy: 0.8, normal: 1, hard: 1.3 };
var PRICES_MEMO_ = null;

// id -> price. The Shop tab (made on first use) can change a price; unlock-only items are not in it.
function prices_() {
  if (PRICES_MEMO_) return PRICES_MEMO_;
  var cache = CacheService.getScriptCache(), hit = cache.get('prices');
  if (hit) { try { PRICES_MEMO_ = JSON.parse(hit); return PRICES_MEMO_; } catch (e) {} }
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(SHEET_SHOP), out = {}, id;
  for (id in SHOP) out[id] = SHOP[id][1];
  giftSheet_();                                          // so the teacher finds the tab before the first gift
  if (!sh) {
    sh = ensureSheet_(ss, SHEET_SHOP, ['Id', 'Price', 'Type', '說明：只改 Price 這一欄。Id 不要改。']);
    for (id in SHOP) if (!SHOP[id][3] && SHOP[id][1] > 0) sh.appendRow([id, SHOP[id][1], SHOP[id][0], '']);
  } else {
    sh.getDataRange().getValues().slice(1).forEach(function (r) {
      var k = String(r[0]).trim(), v = Number(r[1]);
      if (SHOP[k] && !SHOP[k][3] && SHOP[k][1] > 0 && String(r[1]) !== '' && isFinite(v) && v >= 1) out[k] = Math.floor(v);
    });
  }
  cache.put('prices', JSON.stringify(out), 60);
  PRICES_MEMO_ = out;
  return out;
}

function hasFn_(p, teacher) {
  var set = {};
  if (p) p.owned.forEach(function (id) { set[id] = true; });
  return function (id) { return !!SHOP[id] && (teacher || !!set[id] || (SHOP[id][1] === 0 && !SHOP[id][3])); };
}
// what the player is using, with anything they do not own replaced by the free default
function cleanEquip_(e, has) {
  e = e || {};
  var out = { char: 'student', skin: '', scene: 'park', weapon: 'keyboard' };
  if (SHOP[e.char] && SHOP[e.char][0] === 'char' && has(e.char)) out.char = e.char;
  if (SHOP[e.skin] && SHOP[e.skin][0] === 'skin' && SHOP[e.skin][2] === out.char && has(e.skin)) out.skin = e.skin;
  if (SHOP['scene.' + e.scene] && has('scene.' + e.scene)) out.scene = String(e.scene);
  if (SHOP['weapon.' + e.weapon] && has('weapon.' + e.weapon)) out.weapon = String(e.weapon);
  return out;
}

// Coins for one finished game, the running totals, and anything those totals unlock. Changes p.
function earn_(p, r, diff, s) {
  var today = ymd_(new Date()), earned = 0, full = true;
  if (r.time >= 30) {                                   // very short games earn nothing and do not use up a full-coin game
    if (p.day !== today) { p.day = today; p.dayGames = 0; }
    full = p.dayGames < s.coinFull;
    earned = Math.round((r.wave * 15 + r.hits / 5) * (COIN_DIFF[diff] || 1) * (full ? 1 : s.coinLater / 100));
    p.dayGames++;
  }
  p.coins += earned;
  p.stats.k += r.kills; p.stats.r += r.revives || 0; p.stats.c = Math.max(p.stats.c, r.maxCombo);
  return { earned: earned, total: p.coins, full: full, left: Math.max(0, s.coinFull - p.dayGames), unlocked: unlock_(p) };
}
// adds whatever the running totals now unlock; returns the new ids
function unlock_(p) {
  var unlocked = [];
  for (var id in SHOP) {
    var u = SHOP[id][3];
    if (u && UNLOCKS[u] && UNLOCKS[u](p.stats) && p.owned.indexOf(id) === -1) { p.owned.push(id); unlocked.push(id); }
  }
  return unlocked;
}

function shopReply_(p, t, s) {
  var school = isSchool_(t.e, s), teacher = !!teacherMap_()[t.e];
  return { ok: true, email: t.e, year: s.year, player: describe_(p, t.e, t.n || '', school, teacher, s) };
}
function shopPlayer_(body) {
  var t = checkToken_(body.token);
  if (!t) return { error: 'session_expired' };
  var s = getSettings_(), found = findPlayer_(t.e), teacher = !!teacherMap_()[t.e];
  var p = found.data || newPlayer_(t.e, t.n);
  if (describe_(found.data, t.e, t.n || '', isSchool_(t.e, s), teacher, s).needsProfile) return { error: 'no_profile' };
  return { t: t, s: s, found: found, p: p, teacher: teacher };
}

function buy_(body) {
  var c = shopPlayer_(body);
  if (c.error) return { ok: false, error: c.error };
  var id = String(body.id || ''), item = SHOP[id], p = c.p;
  if (!item) return { ok: false, error: 'bad_item' };
  if (c.teacher) return shopReply_(p, c.t, c.s);        // already has everything
  if (item[3]) return { ok: false, error: 'not_for_sale' };
  if (item[1] === 0 || p.owned.indexOf(id) !== -1) return { ok: false, error: 'already_owned' };
  if (item[0] === 'skin' && !hasFn_(p, false)(item[2])) return { ok: false, error: 'need_char' };
  var price = prices_()[id];
  if (p.coins < price) return { ok: false, error: 'not_enough', price: price, coins: p.coins };
  p.coins -= price; p.owned.push(id);
  writePlayer_(c.found, p);
  return shopReply_(p, c.t, c.s);
}

function equip_(body) {
  var c = shopPlayer_(body);
  if (c.error) return { ok: false, error: c.error };
  c.p.equip = cleanEquip_({ char: body.char, skin: body.skin, scene: body.scene, weapon: body.weapon }, hasFn_(c.p, c.teacher));
  writePlayer_(c.found, c.p);
  return shopReply_(c.p, c.t, c.s);
}

function giftSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_GIFTS) || ensureSheet_(ss, SHEET_GIFTS, ['Target', 'Coins', 'Note', 'Date', '',
    '說明：Target 填 ALL、年段(J2)、科別(S1AC)、班級(J203) 或 email。學生下次登入時收到。同一行只會送一次。']);
}
// CoinGifts tab: Target | Coins | Note | Date. Target = ALL, a grade (J2), a stream (S1AC), a class (J203) or an email.
// Each row is given once per player; a row is recognised by its four cells, so two identical rows count as one.
function hash_(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(36); }
function pendingGifts_(p, email) {
  var sh = giftSheet_();
  var out = [], s = getSettings_(), cls = p.classYear === s.year ? p.cls : '';
  sh.getDataRange().getValues().slice(1).forEach(function (r) {
    var target = String(r[0]).trim(), coins = Math.floor(Number(r[1]) || 0);
    if (!target || coins < 1 || coins > 100000) return;
    var T = target.toUpperCase();
    var match = T === 'ALL' || target.toLowerCase() === email || (cls && (cls === T || gradeOf_(cls) === T || cls.replace(/\d+$/, '') === T));
    if (!match) return;
    var key = hash_([T, coins, String(r[2] || ''), r[3] instanceof Date ? ymd_(r[3]) : String(r[3] || '')].join('|'));
    if (p.gifts.indexOf(key) === -1 && !out.some(function (g) { return g.key === key; })) out.push({ key: key, coins: coins, note: String(r[2] || '') });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/*  Leaderboards: class / grade / school / public                      */
/* ------------------------------------------------------------------ */

function groupFor_(scope, p, school, teacher) {
  if (scope === 'class') return p && !teacher ? p.cls : '';
  if (scope === 'grade') return p && !teacher ? gradeOf_(p.cls) : '';
  return scope;
}
function boardKey_(scope, group, mode, diff, year) { return ['lb', year, scope, group, mode, diff].join('|'); }

function leaderboard_(body) {
  var s = getSettings_(), scope = String(body.scope || 'school');
  // mode 'all' = one row per player: their best score in any mode and difficulty
  if (body.mode === ALL) body.diff = ALL;
  if (body.mode === 'test') body.diff = 'word';
  if (['class', 'grade', 'school', 'public'].indexOf(scope) === -1 || (body.mode !== ALL && body.mode !== 'test' && (MODES.indexOf(body.mode) === -1 || DIFFS.indexOf(body.diff) === -1))) return { ok: false, error: 'bad_request' };
  var t = body.token ? checkToken_(body.token) : null, email = t ? t.e : '';
  var me = null, school = false, teacher = false;
  if (email) { me = findPlayer_(email).data; school = isSchool_(email, s); teacher = !!teacherMap_()[email]; }
  // Class, grade and school boards show real names, so only school accounts may read them.
  if (scope !== 'public' && !school) return { ok: false, error: 'school_only' };
  var group = scope;
  if (scope === 'class' || scope === 'grade') {
    if (teacher) {                       // teachers have no class of their own: they choose which one to look at
      group = String(body.group || '').toUpperCase().replace(/\s/g, '');
      if (!(scope === 'grade' ? /^[JS][1-3]$/ : /^[JS][1-3][A-Z]{0,3}\d{1,2}$/).test(group)) return { ok: false, error: 'bad_group' };
    } else {
      if (!me || !school || me.classYear !== s.year || !me.cls) return { ok: false, error: 'no_class' };
      group = groupFor_(scope, me, school, teacher);
    }
  }
  var cache = CacheService.getScriptCache(), key = boardKey_(scope, group, body.mode, body.diff, s.year), list = null;
  var hit = cache.get(key);
  if (hit) { try { list = JSON.parse(hit); } catch (e) { list = null; } }
  if (!list) {
    list = buildBoard_(scope, group, body.mode, body.diff, s);
    var text = JSON.stringify(list);
    if (text.length < 90000) cache.put(key, text, 30);
  }
  var rows = [], mine = null;
  for (var i = 0; i < list.length; i++) {
    var r = list[i], isMe = r[0] === email;
    var item = { rank: i + 1, name: r[1], cls: r[2], score: r[3], wave: r[4], wpm: r[5], acc: r[6], mode: r[7], diff: r[8], me: isMe };
    if (i < s.boardSize) rows.push(item);
    if (isMe) mine = item;
  }
  return { ok: true, scope: scope, group: group, year: s.year, total: list.length, rows: rows, me: mine };
}

// Teachers only: the classes that have students this year, for the leaderboard's class picker.
function classes_(body) {
  var t = checkToken_(body.token);
  if (!t) return { ok: false, error: 'session_expired' };
  if (!teacherMap_()[t.e]) return { ok: false, error: 'teacher_only' };
  var s = getSettings_(), seen = {}, teachers = teacherMap_();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PLAYERS).getDataRange().getValues().slice(1).forEach(function (r) {
    var p = rowToPlayer_(r);
    if (p.cls && p.classYear === s.year && isSchool_(p.email, s) && !teachers[p.email]) seen[p.cls] = (seen[p.cls] || 0) + 1;
  });
  var list = Object.keys(seen).sort().map(function (c) { return { cls: c, n: seen[c] }; });
  return { ok: true, year: s.year, classes: list };
}

// -> [[email, shown name, class, score, wave, wpm, accuracy, mode, difficulty], ...] best first
function buildBoard_(scope, group, mode, diff, s) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), players = {}, teachers = teacherMap_();
  ss.getSheetByName(SHEET_PLAYERS).getDataRange().getValues().slice(1).forEach(function (r) { var p = rowToPlayer_(r); if (p.email) players[p.email] = p; });
  var out = [], bestAt = {};
  ss.getSheetByName(SHEET_SCORES).getDataRange().getValues().slice(1).forEach(function (r) {
    if (String(r[0]) !== s.year || (mode === ALL ? r[2] === 'test' : r[2] !== mode || r[3] !== diff)) return;
    var email = String(r[1]).toLowerCase(), p = players[email];
    if (!p) return;
    var school = isSchool_(email, s), teacher = !!teachers[email];
    var cls = teacher ? '老師' : school ? (p.classYear === s.year ? p.cls : '') : '';
    if (scope === 'public') { if (school) return; }
    else {
      if (!school) return;
      if (scope === 'class' && (teacher || cls !== group)) return;
      if (scope === 'grade' && (teacher || gradeOf_(cls) !== group)) return;
      if (!teacher && !cls) return; // has not picked this year's class yet
    }
    var row = [email, school ? p.name : p.nick, cls, Number(r[4]) || 0, Number(r[5]) || 0, Number(r[7]) || 0, Number(r[8]) || 0, r[2], r[3]];
    if (mode !== ALL) { out.push(row); return; }
    var at = bestAt[email];
    if (at === undefined) { bestAt[email] = out.length; out.push(row); }
    else if (row[3] > out[at][3]) out[at] = row;
  });
  out.sort(function (a, b) { return b[3] - a[3] || b[5] - a[5]; });
  return out;
}

/* ------------------------------------------------------------------ */
/*  Typing test (graded), self check, weak keys, teacher console        */
/* ------------------------------------------------------------------ */
// A teacher opens a test for some classes on the website and says its code out loud; students type the
// code to start. Kinds: word (single words, same rules and marks as the older typing games),
// sentence (capitals, punctuation), subject (S1 Excel formulas, S2 C lines; other grades get sentences).
// Speed = key presses / 5 / minutes, where a character that needs Shift is 2 presses and only finished
// pieces count. Net WPM = WPM x accuracy. Marks out of 100: net 10 = 40, straight line up to the
// full-marks speed of that kind and grade = 100. Accuracy under TestPassAccuracy halves the attempt.
// The best attempt counts.
var SHEET_TESTS = 'Tests', SHEET_TEST_ATTEMPTS = 'TestAttempts', SHEET_TEST_RESULTS = 'TestResults', SHEET_TEST_EXTRA = 'TestExtra', SHEET_KEYS = 'KeyStats';
var TESTS_HEADERS = ['Code', 'Teacher', 'Classes', 'Kind', 'Minutes', 'Attempts', 'Status', 'Created', 'Closed'];
var TEST_ATTEMPT_HEADERS = ['Time', 'Test Code', 'Attempt ID', 'Email', 'Class', 'Seat No', 'Name', 'Content', 'Attempt No', 'Status',
  'Start (ms)', 'Minutes', 'Seconds', 'WPM', 'Accuracy (%)', 'Net WPM', 'Score', 'Keys', 'Errors', 'Words'];
var TEST_RESULT_HEADERS = ['Test Code', 'Class', 'Seat No', 'Name', 'Email', 'Attempts Used', 'Score (best)', 'Net WPM', 'WPM', 'Accuracy (%)', 'Content', 'Updated'];
var TEST_EXTRA_HEADERS = ['Test Code', 'Email', 'Extra Attempts', 'Updated', 'By'];
var KEYS_HEADERS = ['Email', 'Class', 'Seat No', 'Name', 'Updated', 'Keys (key: [right, wrong, ms, timed])'];
var TEST_SETTINGS = [
  ['TestMinutes', '5', '新測驗的預設時間（分鐘）'],
  ['TestAttempts', '2', '新測驗的預設次數（取最高分）'],
  ['TestFullWPM', 'J1:40, J2:40, J3:45, S1:45, S2:45, S3:45', '單字測驗：各年段淨 WPM 多少拿滿分（最低 40）'],
  ['TestFullWPMSentence', 'J1:35, J2:35, J3:40, S1:40, S2:40, S3:40', '句子測驗：各年段淨 WPM 多少拿滿分'],
  ['TestFullWPMSubject', 'S1:30, S2:30', '專科測驗（高一 Excel 公式、高二 C 程式）：淨 WPM 多少拿滿分'],
  ['TestPassAccuracy', '85', '準確率低於這個 %，該次分數減半'],
  ['Admins', 'edwinchowzihao@foonyew.edu.my', '可以看到所有老師的測驗的人（逗號分隔）'],
];
var TEST_KINDS = ['word', 'sentence', 'subject'];
var TEST_RANKS = [10, 15, 20, 25, 30, 38, 45, 55, 70];   // net WPM where levels 2..10 start (same list as engine.js)
var TEST_CODE_TRIES = 5;                                  // wrong codes in a row before a 10-minute wait
var TEST_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

function clamp_(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round1_(v) { return Math.round(v * 10) / 10; }
function testRank_(net) { var n = 1; TEST_RANKS.forEach(function (x) { if (net >= x) n++; }); return n; }
function testCfgClear_() { CacheService.getScriptCache().remove('testcfg'); }

function fullMap_(text, floor) {
  var out = {};
  String(text || '').split(/[,，、;\n]+/).forEach(function (part) {
    var m = part.trim().match(/^([A-Za-z0-9]+)\s*[:：=]\s*(\d+(?:\.\d+)?)$/);
    if (m) out[m[1].toUpperCase()] = Math.max(floor, Number(m[2]));
  });
  return out;
}

// settings + the open tests (cached 30 s; every teacher change clears it)
function testConfig_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('testcfg');
  if (hit) return JSON.parse(hit);
  var ss = SpreadsheetApp.getActiveSpreadsheet(), raw = getSettings_();
  if (!ss.getSheetByName(SHEET_TESTS)) {                 // first use: make the tabs and show the settings in the sheet
    var st = ss.getSheetByName(SHEET_SETTINGS);
    TEST_SETTINGS.forEach(function (r) { if (raw[r[0]] === undefined) { st.appendRow(r); raw[r[0]] = r[1]; } });
    ensureSheet_(ss, SHEET_TESTS, TESTS_HEADERS); ensureSheet_(ss, SHEET_TEST_ATTEMPTS, TEST_ATTEMPT_HEADERS);
    ensureSheet_(ss, SHEET_TEST_RESULTS, TEST_RESULT_HEADERS); ensureSheet_(ss, SHEET_TEST_EXTRA, TEST_EXTRA_HEADERS);
    ensureSheet_(ss, SHEET_KEYS, KEYS_HEADERS);
  }
  var get = function (k) { var d = TEST_SETTINGS.filter(function (r) { return r[0] === k; })[0][1]; return raw[k] === undefined || raw[k] === '' ? d : raw[k]; };
  var cfg = {
    minutes: clamp_(Number(get('TestMinutes')) || 5, 1, 15),
    attempts: clamp_(Math.round(Number(get('TestAttempts')) || 2), 1, 10),
    full: { word: fullMap_(get('TestFullWPM'), 40), sentence: fullMap_(get('TestFullWPMSentence'), 15), subject: fullMap_(get('TestFullWPMSubject'), 15) },
    passAcc: clamp_(Number(get('TestPassAccuracy')) || 0, 0, 100),
    admins: String(get('Admins')).toLowerCase().split(/[,，、;\s]+/).filter(String),
  };
  cfg.tests = testRows_(ss).filter(function (t) { return t.status === 'open'; });
  cache.put('testcfg', JSON.stringify(cfg), 30);
  return cfg;
}
function testActive_() { try { return testConfig_().tests.length > 0; } catch (e) { return false; } }

// every test in the Tests tab (oldest first)
function testRows_(ss) {
  var sh = ensureSheet_(ss, SHEET_TESTS, TESTS_HEADERS), v = sh.getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i]; if (!String(r[0] || '').trim()) continue;
    out.push({ row: i + 1, code: String(r[0]).trim(), teacher: String(r[1] || '').toLowerCase(), classes: splitClasses_(r[2]),
      kind: TEST_KINDS.indexOf(String(r[3])) === -1 ? 'word' : String(r[3]),
      minutes: clamp_(Number(r[4]) || 5, 1, 15), attempts: clamp_(Math.round(Number(r[5]) || 2), 1, 10),
      status: String(r[6] || '').trim().toLowerCase() === 'open' ? 'open' : 'closed',
      created: r[7] instanceof Date ? r[7].getTime() : Number(r[7]) || 0 });
  }
  return out;
}

// what this class actually types in a test of this kind, and the full-marks speed for it
function testContent_(kind, cls) {
  var g = gradeOf_(String(cls || '').toUpperCase());
  if (kind === 'subject') return g === 'S1' ? 'excel' : g === 'S2' ? 'c' : 'sentence';
  return kind === 'sentence' ? 'sentence' : 'word';
}
function testFullWpm_(content, cls, cfg) {
  var kind = content === 'word' ? 'word' : content === 'sentence' ? 'sentence' : 'subject', map = cfg.full[kind];
  cls = String(cls || '').toUpperCase();
  var best = 0, len = -1;
  for (var k in map) if (cls.indexOf(k) === 0 && k.length > len) { best = map[k]; len = k.length; }
  if (kind === 'word') return Math.max(40, best || 40);
  return best || (kind === 'sentence' ? (/^(J1|J2)/.test(cls) ? 35 : 40) : 30);
}
function testScore_(net, acc, full, passAcc) {
  var sc = net >= full ? 100 : net <= 10 ? net * 4 : 40 + 60 * (net - 10) / (full - 10);
  if (acc < passAcc) sc /= 2;
  return Math.round(Math.max(0, sc));
}

// the test code a student types: case, spaces and the kind of dash don't matter
function normCode_(c) { return String(c == null ? '' : c).toUpperCase().replace(/[\s\-_－—–]+/g, ''); }
function splitClasses_(s) { return String(s || '').toUpperCase().split(/[,，、;；\s]+/).filter(String); }
function classOk_(p, classes) {
  if (!classes.length) return true;
  var c = String(p.cls || '').toUpperCase();
  return classes.some(function (x) { return c === x || c.indexOf(x) === 0; });
}
// the signed-in student with this year's class, or an error
function testStudent_(body) {
  var t = checkToken_(body.token);
  if (!t) return { error: 'session_expired' };
  var s = getSettings_(), found = findPlayer_(t.e), p = found.data;
  if (!p || !isSchool_(t.e, s) || !p.cls || p.classYear !== s.year) return { error: 'no_profile', email: t.e };
  return { email: t.e, p: p, found: found, s: s };
}
function testsFor_(p, cfg) { return cfg.tests.filter(function (t) { return classOk_(p, t.classes); }).reverse(); }

function testAttempts_(ss) {
  var sh = ensureSheet_(ss, SHEET_TEST_ATTEMPTS, TEST_ATTEMPT_HEADERS);
  return { sh: sh, values: sh.getDataRange().getValues() };
}
function testAttemptOf_(r, i, k) {
  return { row: i + 1, id: String(r[2]), n: Number(r[8]) || k + 1, status: String(r[9]), start: Number(r[10]) || 0,
    minutes: Number(r[11]) || 0, wpm: Number(r[13]) || 0, acc: Number(r[14]) || 0, net: Number(r[15]) || 0,
    score: r[16] === '' || r[16] == null ? null : Number(r[16]), content: String(r[7]) };
}
// this student's attempts at this test, oldest first
function testMine_(values, code, email) {
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (String(r[1]) !== code || String(r[3]).toLowerCase() !== email) continue;
    out.push(testAttemptOf_(r, i, out.length));
  }
  return out;
}
function testBestOf_(mine) {
  var best = null;
  mine.forEach(function (a) { if (a.score != null && (!best || a.score > best.score || (a.score === best.score && a.net > best.net))) best = a; });
  return best;
}
// extra attempts a teacher gave (email -> n)
function testExtraMap_(ss, code) {
  var sh = ensureSheet_(ss, SHEET_TEST_EXTRA, TEST_EXTRA_HEADERS), v = sh.getDataRange().getValues(), map = {};
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === code) map[String(v[i][1]).toLowerCase()] = { n: Number(v[i][2]) || 0, row: i + 1 };
  return map;
}
function testAllowed_(test, extraMap, email) { var e = extraMap[email]; return Math.max(0, test.attempts + (e ? e.n : 0)); }

// one row per student and test in TestResults (written whenever an attempt starts or ends): the marks to copy out
function testUpsertResult_(ss, code, email, p, mine) {
  var sh = ensureSheet_(ss, SHEET_TEST_RESULTS, TEST_RESULT_HEADERS);
  var values = sh.getDataRange().getValues(), row = 0;
  for (var i = 1; i < values.length; i++) if (String(values[i][0]) === code && String(values[i][4]).toLowerCase() === email) { row = i + 1; break; }
  var b = testBestOf_(mine);
  var vals = [code, p.cls, p.seat, p.name, email, mine.length, b ? b.score : 0, b ? b.net : '', b ? b.wpm : '', b ? b.acc : '', mine.length ? mine[0].content : '', new Date()];
  if (row) sh.getRange(row, 1, 1, vals.length).setValues([vals]); else sh.appendRow(vals);
}
function testPublic_(mine) {
  return mine.map(function (a) { return { n: a.n, status: a.status, score: a.score, net: a.net, wpm: a.wpm, acc: a.acc }; });
}

/* ---------- students ---------- */
// The code itself is never sent: students must type it (from the teacher) to start.
function testInfo_(body) {
  var t = checkToken_(body.token);
  if (!t) return { ok: false, error: 'session_expired' };
  var cfg = testConfig_(), teacher = !!teacherMap_()[t.e] || cfg.admins.indexOf(t.e) !== -1;
  var out = { ok: true, active: cfg.tests.length > 0, passAcc: cfg.passAcc, teacher: teacher, allowed: false, history: [] };
  var S = testStudent_(body);
  if (S.error) { out.reason = 'no_profile'; return out; }
  var mineTests = testsFor_(S.p, cfg);
  out.allowed = mineTests.length > 0;
  if (mineTests.length) {
    var test = mineTests[0], ss = SpreadsheetApp.getActiveSpreadsheet();
    var mine = testMine_(testAttempts_(ss).values, test.code, S.email);
    out.minutes = test.minutes; out.attempts = testAllowed_(test, testExtraMap_(ss, test.code), S.email);
    out.kind = test.kind; out.content = testContent_(test.kind, S.p.cls); out.full = testFullWpm_(out.content, S.p.cls, cfg);
    out.used = mine.length; out.history = testPublic_(mine);
    var b = testBestOf_(mine); out.best = b ? b.score : null;
  }
  return out;
}

function testStart_(body) {
  var S = testStudent_(body);
  if (S.error) return { ok: false, error: S.error };
  var cfg = testConfig_(), email = S.email, p = S.p;
  if (!cfg.tests.length) return { ok: false, error: 'no_test' };
  var cache = CacheService.getScriptCache(), triesKey = 'codetries:' + email, tries = Number(cache.get(triesKey)) || 0;
  if (tries >= TEST_CODE_TRIES) return { ok: false, error: 'too_many_codes' };
  var typed = normCode_(body.code), test = cfg.tests.filter(function (x) { return normCode_(x.code) === typed; })[0];
  if (!typed || !test) { cache.put(triesKey, String(tries + 1), 600); return { ok: false, error: 'wrong_code' }; }   // costs no attempt
  if (!classOk_(p, test.classes)) return { ok: false, error: 'not_your_class' };
  var code = test.code, ss = SpreadsheetApp.getActiveSpreadsheet(), t = testAttempts_(ss), mine = testMine_(t.values, code, email);
  var allowed = testAllowed_(test, testExtraMap_(ss, code), email);
  if (mine.length >= allowed) return { ok: false, error: 'no_attempts', used: mine.length };
  var id = Utilities.getUuid(), n = mine.length + 1, now = Date.now(), content = testContent_(test.kind, p.cls);
  t.sh.appendRow([new Date(now), code, id, email, p.cls, p.seat, p.name, content, n, 'started', now, test.minutes, '', '', '', '', '', '', '', '']);
  mine.push({ id: id, n: n, status: 'started', start: now, minutes: test.minutes, score: null, net: 0, wpm: 0, acc: 0, content: content });
  testUpsertResult_(ss, code, email, p, mine);
  return { ok: true, attemptId: id, attemptNo: n, attempts: allowed, minutes: test.minutes, kind: test.kind, content: content, code: code,
    grade: gradeOf_(p.cls), full: testFullWpm_(content, p.cls, cfg), passAcc: cfg.passAcc };
}

// every ~10 s during a test: live progress for the teacher's screen (cache only, no lock, no sheet write)
function testPing_(body) {
  var t = checkToken_(body.token);
  if (!t) return { ok: false, error: 'session_expired' };
  var id = String(body.attemptId || ''); if (!id) return { ok: false, error: 'no_attempt' };
  var cache = CacheService.getScriptCache();
  var keys = Math.max(0, Number(body.keys) || 0);
  cache.put('live:' + id, JSON.stringify({ c: clamp_(Number(body.correct) || 0, 0, keys), g: clamp_(Number(body.good) || 0, 0, keys), k: keys,
    w: Math.max(0, Number(body.words) || 0), t: Date.now() }), 1800);
  return { ok: true, kicked: !!cache.get('kick:' + id) };
}

// scores an attempt over `minutes` and writes it (used by testFinish_ and by the teacher ending an attempt)
function testScoreRow_(ss, t, ri, r, cfg, minutes, secs, n, status) {
  var email = String(r[3]).toLowerCase(), content = String(r[7]) || 'word', full = testFullWpm_(content, r[4], cfg);
  var wpm = n.correct / 5 / minutes, acc = n.keys ? n.good / n.keys * 100 : 0;
  if (wpm > MAX_WPM) { status = 'rejected (too fast)'; wpm = 0; acc = 0; }
  var net = wpm * acc / 100, score = testScore_(net, acc, full, cfg.passAcc);
  wpm = round1_(wpm); acc = round1_(acc); net = round1_(net);
  t.sh.getRange(ri + 1, 10, 1, 11).setValues([[status, Number(r[10]), round1_(minutes), secs, wpm, acc, net, score, n.keys, n.keys - n.good, n.words]]);
  var mine = testMine_(t.values, String(r[1]), email), id = String(r[2]);
  mine.forEach(function (a) { if (a.id === id) { a.status = status; a.wpm = wpm; a.acc = acc; a.net = net; a.score = score; } });
  var p = findPlayer_(email).data || { cls: r[4], seat: r[5], name: r[6] };
  testUpsertResult_(ss, String(r[1]), email, p, mine);
  return { wpm: wpm, acc: acc, net: net, score: score, status: status, full: full, mine: mine, content: content };
}
function testCounts_(body) {
  var keys = clamp_(Math.round(Number(body.keys) || 0), 0, 200000);
  var good = clamp_(Math.round(Number(body.good) || 0), 0, keys);
  return { keys: keys, good: good, correct: clamp_(Math.round(Number(body.correct) || 0), 0, good), words: clamp_(Math.round(Number(body.words) || 0), 0, 20000) };
}

function testFinish_(body) {
  var tk = checkToken_(body.token);
  if (!tk) return { ok: false, error: 'session_expired' };
  var email = tk.e, ss = SpreadsheetApp.getActiveSpreadsheet(), t = testAttempts_(ss), id = String(body.attemptId || ''), r = null, ri = 0;
  for (var i = 1; i < t.values.length; i++) if (String(t.values[i][2]) === id && String(t.values[i][3]).toLowerCase() === email) { r = t.values[i]; ri = i; break; }
  if (!r) return { ok: false, error: 'no_attempt' };
  var code = String(r[1]), cfg = testConfig_(), minutes = Number(r[11]) || cfg.minutes;
  var test = testRows_(ss).filter(function (x) { return x.code === code; })[0];
  var allowed = test ? testAllowed_(test, testExtraMap_(ss, code), email) : Number(r[8]) || 1;
  if (String(r[9]) !== 'started') { // sent twice (network retry) or ended by the teacher: answer with what is saved
    var mine0 = testMine_(t.values, code, email), b0 = testBestOf_(mine0);
    return { ok: true, already: true, status: String(r[9]), attemptNo: Number(r[8]), attempts: allowed, wpm: Number(r[13]) || 0, accuracy: Number(r[14]) || 0,
      net: Number(r[15]) || 0, score: Number(r[16]) || 0, best: b0 ? b0.score : null, full: testFullWpm_(String(r[7]), r[4], cfg), passAcc: cfg.passAcc, history: testPublic_(mine0) };
  }
  var secs = Math.round((Date.now() - Number(r[10])) / 1000), left = !!body.left;
  if (!left && secs < minutes * 60 - 20) return { ok: false, error: 'too_early' };
  var s = testScoreRow_(ss, t, ri, r, cfg, minutes, secs, testCounts_(body), left ? 'left page' : 'finished');   // leaving = the whole time counts
  var b = testBestOf_(s.mine), extra = afterTest_(email, body.stats, s.content === 'word' && s.status === 'finished' && minutes >= 3 ? s.net : null);
  return { ok: true, attemptNo: Number(r[8]), attempts: allowed, wpm: s.wpm, accuracy: s.acc, net: s.net, score: s.score, status: s.status,
    best: b ? b.score : null, full: s.full, passAcc: cfg.passAcc, history: testPublic_(s.mine), rank: extra.rank, unlocked: extra.unlocked };
}

// after any test: add the per-key numbers to the student's KeyStats row; a word test also sets the level
function afterTest_(email, stats, wordNet) {
  var out = { rank: wordNet == null ? null : testRank_(wordNet), unlocked: [] };
  var found = findPlayer_(email), p = found.data;
  if (!p) return out;
  mergeKeys_(p, stats);
  if (out.rank != null && out.rank > (p.stats.t || 0)) {
    p.stats.t = out.rank;
    out.unlocked = unlock_(p);
    writePlayer_(found, p);
  }
  return out;
}
function cleanKeys_(stats) {
  var out = {}, n = 0;
  if (!stats || typeof stats !== 'object') return out;
  for (var k in stats) {
    if (k.length !== 1 || k < '!' || k > '~' || ++n > 100) continue;
    var v = stats[k] || {}, f = function (x, max) { return clamp_(Math.round(Number(x) || 0), 0, max); };
    out[k] = [f(v.h, 50000), f(v.m, 50000), f(v.ms, 100000000), f(v.n, 50000)];
  }
  return out;
}
function keysRow_(email) {
  var sh = ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_KEYS, KEYS_HEADERS), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).toLowerCase() === email) return { sh: sh, row: i + 1, keys: parse_(v[i][5], {}) };
  return { sh: sh, row: 0, keys: {} };
}
function mergeKeys_(p, stats) {
  var add = cleanKeys_(stats), any = false, k;
  for (k in add) { any = true; break; }
  if (!any) return;
  var at = keysRow_(p.email), cur = at.keys;
  for (k in add) { var c = cur[k] || [0, 0, 0, 0]; cur[k] = [c[0] + add[k][0], c[1] + add[k][1], c[2] + add[k][2], c[3] + add[k][3]]; }
  var row = [p.email, p.cls, p.seat || '', p.name, new Date(), JSON.stringify(cur)];
  if (at.row) at.sh.getRange(at.row, 1, 1, row.length).setValues([row]); else at.sh.appendRow(row);
}
// weak-key practice: nothing is scored, only the per-key numbers are added
function addKeys_(body) {
  var t = checkToken_(body.token);
  if (!t) return { ok: false, error: 'session_expired' };
  var p = findPlayer_(t.e).data;
  if (p) mergeKeys_(p, body.stats);
  return { ok: true };
}
function myKeys_(body) {
  var t = checkToken_(body.token);
  if (!t) return { ok: false, error: 'session_expired' };
  return { ok: true, keys: keysRow_(t.e).keys };
}

/* ---------- self check: no code, any time; the 5-minute word check is ranked ---------- */
function selfStart_(body) {
  var t = checkToken_(body.token);
  if (!t) return { ok: false, error: 'session_expired' };
  var kind = TEST_KINDS.indexOf(String(body.kind)) === -1 ? 'word' : String(body.kind), cfg = testConfig_(), now = Date.now();
  var p = findPlayer_(t.e).data, cls = p ? p.cls : '', content = testContent_(kind, cls);
  var payload = [t.e, now, cfg.minutes, content].join('|');
  return { ok: true, st: Utilities.base64EncodeWebSafe(payload) + '.' + sign_('self|' + payload), minutes: cfg.minutes, content: content,
    grade: gradeOf_(cls), full: testFullWpm_(content, cls, cfg), passAcc: cfg.passAcc };
}
function selfFinish_(body) {
  var t = checkToken_(body.token);
  if (!t) return { ok: false, error: 'session_expired' };
  var parts = String(body.st || '').split('.'), payload = '';
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString(); } catch (e) { return { ok: false, error: 'bad_request' }; }
  if (parts.length !== 2 || sign_('self|' + payload) !== parts[1]) return { ok: false, error: 'bad_request' };
  var f = payload.split('|'), minutes = Number(f[2]), content = f[3], secs = Math.round((Date.now() - Number(f[1])) / 1000);
  if (f[0] !== t.e) return { ok: false, error: 'bad_request' };
  if (secs < minutes * 60 - 20) return { ok: false, error: 'too_early' };
  if (secs > minutes * 60 + 300) return { ok: false, error: 'too_late' };
  var cfg = testConfig_(), s = getSettings_(), n = testCounts_(body), found = findPlayer_(t.e), p = found.data;
  var wpm = n.correct / 5 / minutes, acc = n.keys ? n.good / n.keys * 100 : 0;
  if (wpm > MAX_WPM) return { ok: false, error: 'rejected' };
  var net = round1_(wpm * acc / 100), cls = p ? p.cls : '', full = testFullWpm_(content, cls, cfg);
  var out = { ok: true, content: content, wpm: round1_(wpm), accuracy: round1_(acc), net: net, score: testScore_(net, acc, full, cfg.passAcc), full: full, passAcc: cfg.passAcc,
    rank: content === 'word' ? testRank_(net) : null, ranked: false, unlocked: [] };
  if (!p) return out;
  var school = isSchool_(t.e, s), teacher = !!teacherMap_()[t.e];
  var ready = !describe_(p, t.e, t.n || '', school, teacher, s).needsProfile;
  var extra = afterTest_(t.e, body.stats, content === 'word' ? net : null);
  out.unlocked = extra.unlocked;
  if (content !== 'word' || !ready || body.input === 'touch') return out;
  // the leaderboard row: Mode test / Difficulty word; "Score" holds the net WPM, "Wave" the level
  var row = [s.year, t.e, 'test', 'word', net, out.rank, 0, out.wpm, out.accuracy, 0, Math.round(minutes * 60), new Date()];
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SCORES), v = sh.getDataRange().getValues(), at = 0, old = null;
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === s.year && String(v[i][1]).toLowerCase() === t.e && v[i][2] === 'test') { at = i + 1; old = Number(v[i][4]) || 0; break; }
  out.ranked = true; out.best = !at || net > old; out.bestNet = out.best ? net : old;
  if (out.best) {
    if (at) sh.getRange(at, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
    var cache = CacheService.getScriptCache();
    ['class', 'grade', 'school', 'public'].forEach(function (scope) { cache.remove(boardKey_(scope, groupFor_(scope, findPlayer_(t.e).data, school, teacher), 'test', 'word', s.year)); });
  }
  return out;
}

/* ---------- teachers (老師後台 on the website) ---------- */
// the signed-in teacher, or an error. Admins (Settings: Admins) see every teacher's tests.
function testTeacher_(body) {
  var t = checkToken_(body.token);
  if (!t) return { error: 'session_expired' };
  var admin = testConfig_().admins.indexOf(t.e) !== -1;
  if (!admin && !teacherMap_()[t.e]) return { error: 'not_teacher' };
  return { email: t.e, admin: admin };
}
function teacherNames_() {
  var map = {};
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PLAYERS).getDataRange().getValues().slice(1).forEach(function (r) { var e = String(r[0] || '').trim().toLowerCase(); if (e && r[1]) map[e] = String(r[1]); });
  return map;
}
function testPublicTest_(t, names) {
  return { code: t.code, teacher: t.teacher, teacherName: (names && names[t.teacher]) || t.teacher, classes: t.classes.join(', '),
    kind: t.kind, minutes: t.minutes, attempts: t.attempts, status: t.status, created: t.created };
}
// a test this teacher may manage (own tests; admins: all)
function testOwned_(ss, T, code) {
  var test = testRows_(ss).filter(function (x) { return x.code === String(code || ''); })[0];
  if (!test) return { error: 'no_such_test' };
  if (!T.admin && test.teacher !== T.email) return { error: 'not_your_test' };
  return { test: test };
}
function testNewCode_(ss) {
  var used = {}; testRows_(ss).forEach(function (t) { used[normCode_(t.code)] = true; });
  for (var k = 0; k < 50; k++) {
    var c = ''; for (var i = 0; i < 5; i++) c += TEST_CODE_CHARS.charAt(Math.floor(Math.random() * TEST_CODE_CHARS.length));
    c = c.slice(0, 2) + '-' + c.slice(2);
    if (!used[normCode_(c)] && /[A-Z]/.test(c)) return c;
  }
  return 'T-' + Date.now().toString(36).toUpperCase();
}

function tTests_(body) {
  var T = testTeacher_(body); if (T.error) return { ok: false, error: T.error };
  var ss = SpreadsheetApp.getActiveSpreadsheet(), cfg = testConfig_(), names = teacherNames_();
  var list = testRows_(ss).filter(function (t) { return T.admin || t.teacher === T.email; }).reverse().map(function (t) { return testPublicTest_(t, names); });
  return { ok: true, admin: T.admin, email: T.email, tests: list, suggest: testNewCode_(ss),
    defaults: { minutes: cfg.minutes, attempts: cfg.attempts }, full: cfg.full, passAcc: cfg.passAcc };
}
function badClasses_(classes) { return classes.some(function (c) { return !/^[JS][1-6][A-Z0-9]*$/.test(c); }); }

function tCreate_(body) {
  var T = testTeacher_(body); if (T.error) return { ok: false, error: T.error };
  var ss = SpreadsheetApp.getActiveSpreadsheet(), cfg = testConfig_();
  var classes = splitClasses_(body.classes);
  if (!classes.length) return { ok: false, error: 'need_classes' };
  if (badClasses_(classes)) return { ok: false, error: 'bad_classes' };
  var code = String(body.code || '').trim().toUpperCase().slice(0, 20) || testNewCode_(ss);
  if (!/[A-Z]/.test(code) || normCode_(code).length < 3) return { ok: false, error: 'bad_code' };
  if (testRows_(ss).some(function (t) { return normCode_(t.code) === normCode_(code); })) return { ok: false, error: 'code_used' };
  var minutes = clamp_(Math.round(Number(body.minutes) || cfg.minutes), 1, 15), attempts = clamp_(Math.round(Number(body.attempts) || cfg.attempts), 1, 10);
  var kind = TEST_KINDS.indexOf(String(body.kind)) === -1 ? 'word' : String(body.kind);
  ensureSheet_(ss, SHEET_TESTS, TESTS_HEADERS).appendRow([code, T.email, classes.join(', '), kind, minutes, attempts, 'open', new Date(), '']);
  testCfgClear_();
  var test = testRows_(ss).filter(function (x) { return x.code === code; })[0];
  return { ok: true, test: testPublicTest_(test, teacherNames_()) };
}

// change a test: status (open / closed), attempts, minutes (new attempts only), classes
function tUpdate_(body) {
  var T = testTeacher_(body); if (T.error) return { ok: false, error: T.error };
  var ss = SpreadsheetApp.getActiveSpreadsheet(), o = testOwned_(ss, T, body.code); if (o.error) return { ok: false, error: o.error };
  var test = o.test, sh = ss.getSheetByName(SHEET_TESTS);
  if (body.status === 'open' || body.status === 'closed') {
    sh.getRange(test.row, 7, 1, 3).setValues([[body.status, new Date(test.created || Date.now()), body.status === 'closed' ? new Date() : '']]);
  }
  if (body.attempts != null) sh.getRange(test.row, 6).setValues([[clamp_(Math.round(Number(body.attempts) || 1), 1, 10)]]);
  if (body.minutes != null) sh.getRange(test.row, 5).setValues([[clamp_(Math.round(Number(body.minutes) || 5), 1, 15)]]);
  if (body.classes != null) {
    var classes = splitClasses_(body.classes);
    if (!classes.length) return { ok: false, error: 'need_classes' };
    if (badClasses_(classes)) return { ok: false, error: 'bad_classes' };
    sh.getRange(test.row, 3).setValues([[classes.join(', ')]]);
  }
  testCfgClear_();
  var fresh = testRows_(ss).filter(function (x) { return x.code === test.code; })[0];
  return { ok: true, test: testPublicTest_(fresh, teacherNames_()) };
}

// give one student more (or fewer) attempts than the test's number
function tExtra_(body) {
  var T = testTeacher_(body); if (T.error) return { ok: false, error: T.error };
  var ss = SpreadsheetApp.getActiveSpreadsheet(), o = testOwned_(ss, T, body.code); if (o.error) return { ok: false, error: o.error };
  var email = String(body.email || '').trim().toLowerCase(); if (!email) return { ok: false, error: 'no_student' };
  var delta = clamp_(Math.round(Number(body.delta) || 0), -5, 5);
  var map = testExtraMap_(ss, o.test.code), cur = map[email] ? map[email].n : 0;
  var n = clamp_(cur + delta, -o.test.attempts, 10), sh = ss.getSheetByName(SHEET_TEST_EXTRA);
  if (map[email]) sh.getRange(map[email].row, 3, 1, 3).setValues([[n, new Date(), T.email]]);
  else sh.appendRow([o.test.code, email, n, new Date(), T.email]);
  return { ok: true, extra: n, allowed: Math.max(0, o.test.attempts + n) };
}

// the teacher ends a student's attempt: scored with what was typed so far, over the time used; it counts as used
function tEnd_(body) {
  var T = testTeacher_(body); if (T.error) return { ok: false, error: T.error };
  var ss = SpreadsheetApp.getActiveSpreadsheet(), o = testOwned_(ss, T, body.code); if (o.error) return { ok: false, error: o.error };
  var t = testAttempts_(ss), id = String(body.attemptId || ''), r = null, ri = 0;
  for (var i = 1; i < t.values.length; i++) if (String(t.values[i][2]) === id && String(t.values[i][1]) === o.test.code) { r = t.values[i]; ri = i; break; }
  if (!r) return { ok: false, error: 'no_attempt' };
  if (String(r[9]) !== 'started') return { ok: false, error: 'not_running' };
  var cache = CacheService.getScriptCache(), live = JSON.parse(cache.get('live:' + id) || '{}');
  var minutesSet = Number(r[11]) || o.test.minutes, secs = Math.round((Date.now() - Number(r[10])) / 1000);
  var used = Math.max(0.1, Math.min(minutesSet, secs / 60));
  var s = testScoreRow_(ss, t, ri, r, testConfig_(), used, secs, testCounts_({ keys: live.k, good: live.g, correct: live.c, words: live.w }), 'ended by teacher');
  cache.put('kick:' + id, '1', 3600);
  return { ok: true, score: s.score, net: s.net };
}

// everyone who joined this test, with their attempts and live progress
function tMonitor_(body) {
  var T = testTeacher_(body); if (T.error) return { ok: false, error: T.error };
  var ss = SpreadsheetApp.getActiveSpreadsheet(), o = testOwned_(ss, T, body.code); if (o.error) return { ok: false, error: o.error };
  var test = o.test, v = testAttempts_(ss).values, extra = testExtraMap_(ss, test.code), byEmail = {}, order = [], liveKeys = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i]; if (String(r[1]) !== test.code) continue;
    var email = String(r[3]).toLowerCase();
    if (!byEmail[email]) { byEmail[email] = { email: email, attempts: [] }; order.push(email); }
    var a = testAttemptOf_(r, i, byEmail[email].attempts.length);
    byEmail[email].cls = String(r[4]); byEmail[email].seat = String(r[5]); byEmail[email].name = String(r[6]);
    byEmail[email].attempts.push(a);
    if (a.status === 'started') liveKeys.push('live:' + a.id);
  }
  var live = liveKeys.length ? CacheService.getScriptCache().getAll(liveKeys) : {}, now = Date.now();
  var students = order.map(function (e) {
    var s = byEmail[e], b = testBestOf_(s.attempts);
    s.allowed = testAllowed_(test, extra, e); s.extra = extra[e] ? extra[e].n : 0;
    s.best = b ? { score: b.score, net: b.net, wpm: b.wpm, acc: b.acc } : null;
    s.attempts = s.attempts.map(function (a) {
      var out = { id: a.id, n: a.n, status: a.status, score: a.score, net: a.net, wpm: a.wpm, acc: a.acc, content: a.content };
      if (a.status === 'started') {
        var L = live['live:' + a.id] ? JSON.parse(live['live:' + a.id]) : null, secs = (now - a.start) / 1000;
        out.secsLeft = Math.max(0, Math.round(a.minutes * 60 - secs));
        out.lost = secs > a.minutes * 60 + 60; // never finished (page closed / crashed)
        if (L) { out.words = L.w; out.liveWpm = round1_(L.c / 5 / Math.max(0.1, secs / 60)); out.liveAcc = L.k ? round1_(L.g / L.k * 100) : 0; }
      }
      return out;
    });
    return s;
  });
  students.sort(function (a, b) { return a.cls < b.cls ? -1 : a.cls > b.cls ? 1 : (Number(a.seat) || 0) - (Number(b.seat) || 0); });
  return { ok: true, test: testPublicTest_(test, teacherNames_()), students: students, now: now };
}

// the keys a class gets wrong most (all tests and practice so far)
function tKeys_(body) {
  var T = testTeacher_(body); if (T.error) return { ok: false, error: T.error };
  var want = String(body.cls || '').toUpperCase().replace(/\s/g, '');
  if (!/^[JS][1-6][A-Z0-9]*$/.test(want)) return { ok: false, error: 'bad_classes' };
  var sh = ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_KEYS, KEYS_HEADERS), sum = {}, students = 0;
  sh.getDataRange().getValues().slice(1).forEach(function (r) {
    if (String(r[1]).toUpperCase().indexOf(want) !== 0) return;
    students++;
    var k = parse_(r[5], {});
    for (var ch in k) { var c = sum[ch] || (sum[ch] = [0, 0, 0, 0]), a = k[ch]; for (var i = 0; i < 4; i++) c[i] += Number(a[i]) || 0; }
  });
  return { ok: true, cls: want, students: students, keys: sum };
}

/* ------------------------------------------------------------------ */
/*  Nickname filter (English, Malay, Chinese, dialects, Tamil)         */
/* ------------------------------------------------------------------ */

// 只要花名「包含」这些字就不接受
var BANNED_CONTAINS = [
  // English
  'fuck', 'fck', 'fuk', 'fvck', 'shit', 'bitch', 'bastard', 'cunt', 'pussy', 'whore', 'slut', 'nigger', 'nigga',
  'faggot', 'retard', 'asshole', 'arsehole', 'dickhead', 'motherf', 'penis', 'vagina', 'dildo', 'porn', 'horny',
  'wanker', 'bollock', 'boob', 'nazi', 'hitler', 'killyourself', 'suicide', 'jackass', 'dumbass', 'bullshit',
  'sexy', 'blowjob', 'handjob', 'orgasm', 'masturbat', 'testicle', 'scrotum', 'nipple', 'hentai', 'milf',
  // Malay
  'bodoh', 'bangang', 'puki', 'pukimak', 'kimak', 'pantat', 'lancau', 'butoh', 'burit', 'pepek', 'sundal',
  'jalang', 'celaka', 'keparat', 'bangsat', 'pundek', 'lahanat', 'haramjadah', 'mampus', 'bahlul', 'goblok',
  'kepalabapak', 'anakharam', 'tetek', 'konek', 'pelacur', 'sial',
  // Hokkien / Cantonese / Singlish (romanised)
  'kanina', 'kannina', 'cibai', 'chibai', 'cheebye', 'cheebai', 'lanjiao', 'lanjiu', 'kaninabu', 'nabeh',
  'diulei', 'diuneilomo', 'dllm', 'pukai', 'pokgai', 'hamkachan', 'hamgachan', 'kaisai', 'sohai', 'sorhai',
  'lampa', 'kukujiao',
  // Tamil (romanised)
  'punda', 'thevidiya', 'koothi', 'oombu',
  // 华文（简体 / 繁体 / 粤语）
  '操你', '肏', '屌', '屄', '傻逼', '傻b', '煞笔', '沙比', '他妈', '他媽', '你妈', '你媽', '妈的', '媽的', '草泥马',
  '草泥馬', '尼玛', '尼瑪', '卧槽', '臥槽', '我操', '干你', '幹你', '鸡巴', '雞巴', '鸡掰', '雞掰', '机掰', '機掰', '靠北',
  '靠杯', '贱人', '賤人', '婊', '妓女', '白痴', '白癡', '智障', '脑残', '腦殘', '废物', '廢物', '滚蛋', '滾蛋', '去死',
  '王八蛋', '混蛋', '狗娘', '杂种', '雜種', '屁眼', '阴道', '陰道', '阴茎', '陰莖', '色情', '做爱', '做愛', '性交',
  '淫', '撚', '閪', '仆街', '扑街', '冚家', '戇鳩', '戆鸠', '賤', '贱', '死全家', '操', '妈逼', '媽逼',
];
// 花名「整个等于」这些字才不接受（因为它们常出现在正常英文字里，例如 class 里有 ass）
var BANNED_EXACT = [
  'ass', 'arse', 'dick', 'cock', 'cum', 'tit', 'tits', 'fag', 'sex', 'rape', 'kys', 'wtf', 'stfu', 'piss',
  'twat', 'babi', 'bodo', 'kote', 'knn', 'diu', 'otha', 'hell', 'damn', 'crap', 'gay', 'homo', 'anal', 'anus',
  'pimp', 'lj', 'cb', 'mf', 'bj', 'sb', '幹', '干', '逼', '死',
];

function normalizeNick_(s) {
  var leet = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i' };
  s = String(s).toLowerCase().replace(/[01345789@$!]/g, function (c) { return leet[c] || c; });
  s = s.replace(/[^a-z㐀-鿿]/g, '');
  return s.replace(/(.)\1+/g, '$1');
}

function extraBanned_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BANNED);
  if (!sh) return [];
  return sh.getDataRange().getValues().slice(1).map(function (r) { return String(r[0]).trim(); }).filter(String);
}

function checkNickname_(nick) {
  if (nick.length < 2 || nick.length > 12) return 'Nickname must be 2–12 characters.';
  if (!/^[A-Za-z0-9_\-㐀-鿿]+$/.test(nick)) return 'Use only letters, numbers, Chinese characters, _ or - (no spaces).';
  var n = normalizeNick_(nick);
  // 也检查「只去掉符号、不做数字转换」的版本，避免误判
  var plain = String(nick).toLowerCase().replace(/[^a-z㐀-鿿]/g, '');
  var candidates = [n, plain, plain.replace(/(.)\1+/g, '$1')];
  var contains = BANNED_CONTAINS.concat(extraBanned_());
  for (var i = 0; i < contains.length; i++) {
    var w = normalizeNick_(contains[i]);
    if (!w) continue;
    for (var j = 0; j < candidates.length; j++) {
      if (candidates[j].indexOf(w) !== -1) return 'That nickname is not allowed. Please choose a friendly one.';
    }
  }
  for (var k = 0; k < BANNED_EXACT.length; k++) {
    var x = normalizeNick_(BANNED_EXACT[k]);
    if (candidates.indexOf(x) !== -1) return 'That nickname is not allowed. Please choose a friendly one.';
  }
  return '';
}
