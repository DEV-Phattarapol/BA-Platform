// ─────────────────────────────────────────────────────
// sheets.js — StockTrack v4
// ⚠️  แก้แค่บรรทัดนี้หลัง Re-deploy Apps Script
// ─────────────────────────────────────────────────────
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyWmHbgo_rJwFoj-ebjZDyzV0nMMoP1x0f68WGHxvGNLcoaPTok5RH32Ni8_mOECQbYgQ/exec";

// date helper: ส่งแค่ YYYY-MM-DD เสมอ
const toDateStr = (d) => {
  if (!d) return "";
  return String(d).substring(0, 10);
};

async function post(body) {
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Network error " + res.status);
  const data = await res.json();
  if (data.status !== "ok") throw new Error(data.message ?? "Unknown error");
  return data;
}

async function get(params = {}) {
  // normalize date ก่อนส่ง
  if (params.date) params.date = toDateStr(params.date);
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${SCRIPT_URL}?${qs}`);
  if (!res.ok) throw new Error("Network error " + res.status);
  const data = await res.json();
  if (data.status !== "ok") throw new Error(data.message ?? "Unknown error");
  return data;
}

export const sheetsAPI = {

  // ── Master ───────────────────────────────────────────
  getMaster: () => get({ type: "master" }),

  // ── Opening (upsert: Date + BranchID + ProductCode) ──
  // rows: [[date, branchId, branchName, code, name, unit, mrp, opening, timestamp], ...]
  saveOpening: (rows) => post({ type: "opening", rows }),
  getOpening:  (date, branch) => get({ type: "opening", date, branch: branch ?? "ALL" }),

  // ── Replenishment (upsert by EntryID) ────────────────
  // rows: [[date, branchId, branchName, code, name, unit, mrp, qty, txTime, entryId], ...]
  saveReplenishment: (rows) => post({ type: "replenishment", rows }),
  getReplenishment:  (date, branch) => get({ type: "replenishment", date, branch: branch ?? "ALL" }),

  // ── Closing (upsert: Date + BranchID + ProductCode) ──
  // rows: [[date, branchId, branchName, code, name, unit, mrp, saleReturn, closing, timestamp], ...]
  saveClosing: (rows) => post({ type: "closing", rows }),
  getClosing:  (date, branch) => get({ type: "closing", date, branch: branch ?? "ALL" }),

  // ── Engagement ───────────────────────────────────────
  saveEngagement: (summaryRow, detailRows) => post({ type: "engagement", summaryRow, detailRows }),
  getEngDaily:    (date, branch) => get({ type: "engDaily",   date, branch: branch ?? "ALL" }),
  getEngDetail:   (date, branch) => get({ type: "engDetail",  date, branch: branch ?? "ALL" }),
};