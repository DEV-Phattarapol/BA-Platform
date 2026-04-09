// ─────────────────────────────────────────────────────
// sheets.js — StockTrack v2
// ⚠️  แก้แค่บรรทัดนี้หลัง Deploy Apps Script
// ─────────────────────────────────────────────────────
const URL = "https://script.google.com/macros/s/AKfycbxz1P3UbmkAvNtsXw8CF4iQAYsBH1CDM-TT0-NiJvzIUpbK-3i5veHuXUyHnIki84Eyew/exec";

async function post(body) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Network error");
  const data = await res.json();
  if (data.status !== "ok") throw new Error(data.message ?? "Error");
  return data;
}

async function get(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${URL}?${qs}`);
  if (!res.ok) throw new Error("Network error");
  const data = await res.json();
  if (data.status !== "ok") throw new Error(data.message ?? "Error");
  return data.data ?? [];
}

export const sheetsAPI = {
  appendStock: (stockRows) => post({ type: "stock", stockRows }),
  appendEngagement: (summaryRow, detailRows) => post({ type: "engagement", summaryRow, detailRows }),
  getStock: (date, branch) => get({ type: "stock", date, branch: branch ?? "ALL" }),
  getEngDaily: (date, branch) => get({ type: "engDaily", date, branch: branch ?? "ALL" }),
  getEngDetail: (date, branch) => get({ type: "engDetail", date, branch: branch ?? "ALL" }),
};