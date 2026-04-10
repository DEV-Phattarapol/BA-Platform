// ─────────────────────────────────────────────────────
// sheets.js — StockTrack v2
// ⚠️  แก้แค่บรรทัดนี้หลัง Deploy Apps Script ใหม่
// ─────────────────────────────────────────────────────
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyqVWLoZ_b6mlnyJioJlO4U_CwxALVOrfulrmJlqoOR7wKdi3Z9owc0oOpIAsC038ziXA/exec";

const toDateStr = (d) => d ? String(d).substring(0, 10) : "";

async function post(body) {
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Network error " + res.status);
  const data = await res.json();
  if (data.status !== "ok") throw new Error(data.message ?? "Error");
  return data;
}

async function get(params = {}) {
  if (params.date) params.date = toDateStr(params.date);
  const qs  = new URLSearchParams(params).toString();
  const res = await fetch(`${SCRIPT_URL}?${qs}`);
  if (!res.ok) throw new Error("Network error " + res.status);
  const data = await res.json();
  if (data.status !== "ok") throw new Error(data.message ?? "Error");
  return data;
}

export const sheetsAPI = {
  // ── Auth ─────────────────────────────────────────────
  // คืน { branchId, branchName } หรือ throw error
  login: (username, password) =>
    post({ type: "login", username, password }),

  // เปลี่ยนรหัสผ่าน
  changePassword: (username, oldPassword, newPassword) =>
    post({ type: "changePassword", username, oldPassword, newPassword }),

  // ── Master ───────────────────────────────────────────
  getMaster: () => get({ type: "master" }),

  // ── Opening ──────────────────────────────────────────
  saveOpening: (rows) => post({ type: "opening", rows }),
  getOpening:  (date, branch) => get({ type: "opening", date, branch: branch ?? "ALL" }),

  // ── Replenishment ─────────────────────────────────────
  saveReplenishment: (rows) => post({ type: "replenishment", rows }),
  getReplenishment:  (date, branch) => get({ type: "replenishment", date, branch: branch ?? "ALL" }),

  // ── Closing ──────────────────────────────────────────
  saveClosing: (rows) => post({ type: "closing", rows }),
  getClosing:  (date, branch) => get({ type: "closing", date, branch: branch ?? "ALL" }),

  // ── Engagement ───────────────────────────────────────
  saveEngagement: (summaryRow, detailRows) =>
    post({ type: "engagement", summaryRow, detailRows }),
  getEngDaily:  (date, branch) => get({ type: "engDaily",  date, branch: branch ?? "ALL" }),
  getEngDetail: (date, branch) => get({ type: "engDetail", date, branch: branch ?? "ALL" }),
};