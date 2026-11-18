/**
 * MAB اسکرپٹ — کنٹرول بیک اینڈ (Google Apps Script)
 * اس کوڈ کو اس Google Sheet کے Apps Script میں چسپاں کریں جو صرف اسی کام کے لیے بنائی ہو۔
 * Deploy ← New deployment ← Web app
 *   Execute as: Me      Who has access: Anyone
 */

// ⚠️ یہاں اپنا خفیہ ایڈمن کوڈ لکھیں (لمبا اور مشکل، کم از کم 16 حروف)۔ اسے کسی کو نہ دیں۔
const ADMIN_KEY = "CHANGE-ME-TO-A-LONG-SECRET";

const SHEET = "Users";
const HEAD = ["ID", "Name", "Status", "FirstSeen", "LastSeen", "Visits", "Version", "Device", "Message"];
const MSG_OFF = "یہ اسکرپٹ فی الحال بند کر دیا گیا ہے۔";
const MSG_PENDING = "آپ کی منظوری کا انتظار ہے۔ اپنا ID ایڈمن کو بھیجیں۔";
const MSG_BLOCKED = "آپ کا اسکرپٹ بند کر دیا گیا ہے۔ ایڈمن سے رابطہ کریں۔";
const MSG_OLD = "آپ کا اسکرپٹ پرانا ہے۔ نیا ورژن انسٹال کریں، پھر دوبارہ چلائیں۔";

// ورژن کا موازنہ: a < b ہو تو true (مثلاً 10.9 < 10.10)
function verLt_(a, b) {
  const A = String(a || "0").split(".").map(Number), B = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const d = (A[i] || 0) - (B[i] || 0);
    if (d) return d < 0;
  }
  return false;
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.getRange("A:A").setNumberFormat("@"); // ID متن رہے (Sheets اسے عدد نہ بنائے)
    sh.getRange("D:E").setNumberFormat("yyyy-mm-dd hh:mm");
  } else if (String(sh.getRange(1, 9).getValue() || "") === "") {
    sh.getRange(1, 9).setValue("Message").setFontWeight("bold"); // پرانی شیٹ میں نیا کالم
  }
  return sh;
}

function cfg_() {
  const p = PropertiesService.getScriptProperties();
  return {
    enabled: p.getProperty("ENABLED") !== "false",
    message: p.getProperty("MESSAGE") || MSG_OFF,
    messagePending: p.getProperty("MESSAGE_PENDING") || MSG_PENDING,
    messageBlocked: p.getProperty("MESSAGE_BLOCKED") || MSG_BLOCKED,
    messageOld: p.getProperty("MESSAGE_OLD") || MSG_OLD,
    minVersion: p.getProperty("MIN_VERSION") || "",
    requireApproval: p.getProperty("REQUIRE_APPROVAL") === "true",
  };
}

function cleanId_(s) {
  s = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length >= 4 && s.length <= 12 ? s : "";
}

function rows_(sh) {
  const n = sh.getLastRow();
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, HEAD.length).getValues();
}

function ts_(d) {
  return d instanceof Date ? d.getTime() : 0;
}

/** صارف کا اسکرپٹ ہر بار کھلنے پر یہ سوال پوچھتا ہے */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action !== "check") return out_({ ok: true, hello: "MAB control" });
  const id = cleanId_(p.id);
  if (!id) return out_({ run: true, status: "unknown" }); // خراب درخواست پر کام نہ روکیں

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const c = cfg_();
    const sh = sheet_();
    const idx = rows_(sh).map((r) => String(r[0])).indexOf(id);
    const now = new Date();
    const ver = String(p.v || "").slice(0, 12);
    const dev = String(p.ua || "").slice(0, 140);
    let status, umsg = "";
    if (idx < 0) {
      status = c.requireApproval ? "pending" : "approved";
      sh.appendRow([id, "", status, now, now, 1, ver, dev]);
    } else {
      const r = idx + 2;
      status = String(sh.getRange(r, 3).getValue());
      umsg = String(sh.getRange(r, 9).getValue() || "");
      const visits = Number(sh.getRange(r, 6).getValue()) || 0;
      sh.getRange(r, 5, 1, 4).setValues([[now, visits + 1, ver, dev]]);
    }
    let run = true, message = "";
    if (!c.enabled) { run = false; message = c.message; }
    else if (status === "blocked") { run = false; message = umsg || c.messageBlocked; }
    else if (status === "pending") { run = false; message = umsg || c.messagePending; }
    else if (c.minVersion && verLt_(ver, c.minVersion)) { run = false; message = c.messageOld; } // پرانا ورژن: اپڈیٹ تک بند
    return out_({ run: run, status: status, message: message });
  } finally {
    lock.releaseLock();
  }
}

/** صرف ڈیش بورڈ (ایڈمن کوڈ کے ساتھ) */
function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: "bad request" }); }
  if (!b || b.key !== ADMIN_KEY || ADMIN_KEY === "CHANGE-ME-TO-A-LONG-SECRET") return out_({ ok: false, error: "auth" });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const props = PropertiesService.getScriptProperties();
    const sh = sheet_();

    if (b.action === "setConfig") {
      if (typeof b.enabled === "boolean") props.setProperty("ENABLED", String(b.enabled));
      if (typeof b.requireApproval === "boolean") props.setProperty("REQUIRE_APPROVAL", String(b.requireApproval));
      if (typeof b.message === "string") props.setProperty("MESSAGE", b.message.trim() || MSG_OFF);
      if (typeof b.messagePending === "string") props.setProperty("MESSAGE_PENDING", b.messagePending.trim() || MSG_PENDING);
      if (typeof b.minVersion === "string") props.setProperty("MIN_VERSION", b.minVersion.trim().replace(/[^0-9.]/g, ""));
      if (typeof b.messageOld === "string") props.setProperty("MESSAGE_OLD", b.messageOld.trim() || MSG_OLD);
      if (typeof b.messageBlocked === "string") props.setProperty("MESSAGE_BLOCKED", b.messageBlocked.trim() || MSG_BLOCKED);
    } else if (b.action === "setUser") {
      const id = cleanId_(b.id);
      if (!id) return out_({ ok: false, error: "bad id" });
      const ids = rows_(sh).map((r) => String(r[0]));
      let idx = ids.indexOf(id);
      let r;
      if (idx < 0) {
        const now = new Date();
        sh.appendRow([id, "", "approved", now, now, 0, "", "", ""]);
        r = sh.getLastRow();
      } else r = idx + 2;
      if (typeof b.name === "string") sh.getRange(r, 2).setValue(b.name.trim());
      if (typeof b.message === "string") sh.getRange(r, 9).setValue(b.message.trim()); // اس صارف کا خاص پیغام (خالی = ڈیفالٹ)
      if (["approved", "blocked", "pending"].indexOf(b.status) >= 0) sh.getRange(r, 3).setValue(b.status);
    } else if (b.action === "deleteUser") {
      const idx = rows_(sh).map((r) => String(r[0])).indexOf(cleanId_(b.id));
      if (idx >= 0) sh.deleteRow(idx + 2);
    } else if (b.action !== "list") {
      return out_({ ok: false, error: "unknown action" });
    }

    const users = rows_(sh).map((r) => ({
      id: String(r[0]), name: String(r[1] || ""), status: String(r[2]),
      first: ts_(r[3]), last: ts_(r[4]), visits: Number(r[5]) || 0,
      version: String(r[6] || ""), device: String(r[7] || ""), message: String(r[8] || ""),
    }));
    return out_({ ok: true, config: cfg_(), users: users });
  } finally {
    lock.releaseLock();
  }
}
