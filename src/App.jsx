import { useState, useEffect, useMemo } from "react";
import { sheetsAPI } from "./sheets";

const BRANCHES = Array.from({ length: 30 }, (_, i) => ({
  id: `BR${String(i + 1).padStart(2, "0")}`,
  name: `สาขา ${String(i + 1).padStart(2, "0")}`,
}));
const PRODUCTS = Array.from({ length: 80 }, (_, i) => ({
  code: `P${String(i + 1).padStart(3, "0")}`,
  name: `Product ${String(i + 1).padStart(3, "0")}`,
  unit: ["ชิ้น", "กล่อง", "แพ็ค"][i % 3],
}));
const TODAY = new Date().toISOString().split("T")[0];
const nowTime = () => new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const initStockRows = () => PRODUCTS.map((p) => ({ ...p, opening: "", replenishment: "", saleReturn: "", closing: "" }));
const blankEng = () => ({ id: uid(), time: nowTime(), approach: "", engagement: "", convert: "", products: "", note: "" });

const LS = {
  save: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  load: (k) => { try { const d = localStorage.getItem(k); return d ? JSON.parse(d) : null; } catch (_) { return null; } },
  key: (b, d, t) => `st2_${b}_${d}_${t}`,
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Noto Sans Thai',sans-serif;background:#07090f;color:#e2e8f0;-webkit-tap-highlight-color:transparent}
  input,select,textarea,button{font-family:'Noto Sans Thai',sans-serif}
  input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
  .mono{font-family:'JetBrains Mono',monospace}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  .fade-up{animation:fadeUp 0.22s ease forwards}
  .spin{animation:spin 1s linear infinite;display:inline-block}
`;

const Num = ({ value, onChange, accent = "#6366f1" }) => (
  <input type="number" inputMode="numeric" placeholder="0" value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{ width: "100%", padding: "10px 6px", background: "#0a0f1e", border: `1px solid ${value !== "" ? accent + "80" : "#1e293b"}`, borderRadius: 9, color: "#fff", fontSize: 16, fontFamily: "'JetBrains Mono',monospace", textAlign: "center", transition: "border-color 0.18s" }} />
);

const Tag = ({ children, color = "#6366f1", bg = "#1e1b4b" }) => (
  <span className="mono" style={{ fontSize: 10, color, background: bg, padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>{children}</span>
);

const StatusMsg = ({ status }) => {
  if (!status) return null;
  return (
    <div style={{ textAlign: "center", fontSize: 12, marginBottom: 7, color: status === "success" ? "#10b981" : "#ef4444" }}>
      {status === "success" ? "✅ บันทึกลง Google Sheets แล้ว" : "❌ เกิดข้อผิดพลาด กรุณาลองใหม่"}
    </div>
  );
};

export default function App() {
  const [screen, setScreen] = useState("login");
  const [branch, setBranch] = useState("");
  const [date, setDate] = useState(TODAY);
  const [mainTab, setMainTab] = useState("stock");
  const [stockPhase, setStockPhase] = useState("opening");

  const [stockRows, setStockRows] = useState(initStockRows());
  const [replenLogs, setReplenLogs] = useState([]);
  const [stockSaving, setStockSaving] = useState(false);
  const [stockStatus, setStockStatus] = useState(null);

  const [engLog, setEngLog] = useState([]);
  const [engForm, setEngForm] = useState(blankEng());
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [engSaving, setEngSaving] = useState(false);
  const [engStatus, setEngStatus] = useState(null);

  const branchName = BRANCHES.find((b) => b.id === branch)?.name ?? "";

  const handleLogin = () => {
    if (!branch) return;
    const sk = LS.key(branch, date, "stock");
    const rk = LS.key(branch, date, "replen");
    const ek = LS.key(branch, date, "eng");
    setStockRows(LS.load(sk) ?? initStockRows());
    setReplenLogs(LS.load(rk) ?? []);
    setEngLog(LS.load(ek) ?? []);
    setStockStatus(null); setEngStatus(null);
    setScreen("main");
  };

  useEffect(() => { if (screen === "main") LS.save(LS.key(branch, date, "stock"), stockRows); }, [stockRows]);
  useEffect(() => { if (screen === "main") LS.save(LS.key(branch, date, "replen"), replenLogs); }, [replenLogs]);
  useEffect(() => { if (screen === "main") LS.save(LS.key(branch, date, "eng"), engLog); }, [engLog]);

  const updateStock = (code, field, val) =>
    setStockRows((rows) => rows.map((r) => r.code === code ? { ...r, [field]: val } : r));

  const addReplen = (productCode, qty) => {
    const p = PRODUCTS.find((x) => x.code === productCode);
    setReplenLogs((l) => [...l, { id: uid(), time: nowTime(), productCode, productName: p?.name ?? "", qty: parseFloat(qty) || 0 }]);
    setStockRows((rows) => rows.map((r) =>
      r.code === productCode
        ? { ...r, replenishment: String((parseFloat(r.replenishment) || 0) + (parseFloat(qty) || 0)) }
        : r
    ));
  };

  const handleSaveStock = async () => {
    setStockSaving(true); setStockStatus(null);
    try {
      const rows = stockRows
        .filter((r) => r.opening !== "" || r.replenishment !== "" || r.closing !== "")
        .map((r) => [
          date, branch, branchName, r.code, r.name, r.unit,
          parseFloat(r.opening) || 0, parseFloat(r.replenishment) || 0,
          parseFloat(r.saleReturn) || 0, parseFloat(r.closing) || 0,
          new Date().toISOString(),
        ]);
      await sheetsAPI.appendStock(rows);
      setStockStatus("success");
    } catch { setStockStatus("error"); }
    finally { setStockSaving(false); }
  };

  const saveEngEntry = () => {
    if (!engForm.approach && !engForm.engagement && !engForm.convert) return;
    if (editingId) {
      setEngLog((l) => l.map((e) => e.id === editingId ? { ...engForm } : e));
      setEditingId(null);
    } else {
      setEngLog((l) => [...l, { ...engForm }]);
    }
    setEngForm(blankEng()); setShowForm(false);
  };

  const editEng = (entry) => { setEngForm({ ...entry }); setEditingId(entry.id); setShowForm(true); };
  const deleteEng = (id) => setEngLog((l) => l.filter((e) => e.id !== id));

  const handleSaveEng = async () => {
    setEngSaving(true); setEngStatus(null);
    try {
      const summary = [
        date, branch, branchName,
        engLog.reduce((a, e) => a + (parseInt(e.approach) || 0), 0),
        engLog.reduce((a, e) => a + (parseInt(e.engagement) || 0), 0),
        engLog.reduce((a, e) => a + (parseInt(e.convert) || 0), 0),
        engLog.length, new Date().toISOString(),
      ];
      const details = engLog.map((e) => [
        date, branch, branchName, e.time,
        parseInt(e.approach) || 0, parseInt(e.engagement) || 0, parseInt(e.convert) || 0,
        e.products, e.note, e.id,
      ]);
      await sheetsAPI.appendEngagement(summary, details);
      setEngStatus("success");
    } catch { setEngStatus("error"); }
    finally { setEngSaving(false); }
  };

  const engSum = useMemo(() => {
    const ap = engLog.reduce((a, e) => a + (parseInt(e.approach) || 0), 0);
    const en = engLog.reduce((a, e) => a + (parseInt(e.engagement) || 0), 0);
    const cv = engLog.reduce((a, e) => a + (parseInt(e.convert) || 0), 0);
    return { ap, en, cv, rate: ap > 0 ? ((cv / ap) * 100).toFixed(1) : "0.0" };
  }, [engLog]);

  const filledOpen = stockRows.filter((r) => r.opening !== "").length;
  const filledClose = stockRows.filter((r) => r.closing !== "").length;

  // ── LOGIN ──
  if (screen === "login") return (
    <>
      <style>{css}</style>
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "radial-gradient(ellipse 80% 50% at 50% 0%,#0d1f3c,#07090f)" }}>
        <div className="fade-up" style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ textAlign: "center", marginBottom: 26 }}>
            <div style={{ width: 58, height: 58, margin: "0 auto 12px", background: "linear-gradient(135deg,#0ea5e9,#6366f1)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, boxShadow: "0 0 40px #6366f130" }}>📦</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>StockTrack</div>
            <div style={{ fontSize: 11, color: "#334155", marginTop: 3 }}>Stock · Engagement · Dashboard</div>
          </div>
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 18, padding: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: 1, textTransform: "uppercase", marginBottom: 7 }}>สาขาของคุณ</div>
            <select value={branch} onChange={(e) => setBranch(e.target.value)}
              style={{ width: "100%", padding: "12px 14px", background: "#07090f", border: `1px solid ${branch ? "#6366f1" : "#1e293b"}`, borderRadius: 10, color: branch ? "#fff" : "#475569", fontSize: 14, marginBottom: 14, cursor: "pointer" }}>
              <option value="">เลือกสาขา...</option>
              {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
            </select>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: 1, textTransform: "uppercase", marginBottom: 7 }}>วันที่</div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              style={{ width: "100%", padding: "12px 14px", background: "#07090f", border: "1px solid #1e293b", borderRadius: 10, color: "#fff", fontSize: 14, marginBottom: 18 }} />
            <button onClick={handleLogin} disabled={!branch}
              style={{ width: "100%", padding: 14, background: branch ? "linear-gradient(135deg,#0ea5e9,#6366f1)" : "#1e293b", border: "none", borderRadius: 10, color: branch ? "#fff" : "#334155", fontSize: 15, fontWeight: 700, cursor: branch ? "pointer" : "not-allowed" }}>
              เข้าสู่ระบบ →
            </button>
            <div style={{ height: 1, background: "#1e293b", margin: "16px 0" }} />
            <button onClick={() => setScreen("dashboard")}
              style={{ width: "100%", padding: 11, background: "transparent", border: "1px solid #1e293b", borderRadius: 10, color: "#475569", fontSize: 13, cursor: "pointer" }}>
              📊 ดู Dashboard
            </button>
          </div>
          <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "#1e293b" }}>✦ Draft บันทึกอัตโนมัติในเครื่องทุกครั้งที่กรอก</div>
        </div>
      </div>
    </>
  );

  // ── DASHBOARD (placeholder) ──
  if (screen === "dashboard") return (
    <>
      <style>{css}</style>
      <div style={{ minHeight: "100dvh", background: "#07090f" }}>
        <div style={{ background: "#0f172a", borderBottom: "1px solid #1e293b", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setScreen("login")} style={{ background: "#07090f", border: "1px solid #1e293b", borderRadius: 8, color: "#475569", padding: "8px 13px", cursor: "pointer", fontSize: 13 }}>←</button>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Dashboard</div>
        </div>
        <div style={{ padding: 24, textAlign: "center", color: "#334155", paddingTop: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>📊</div>
          <div style={{ fontSize: 14, color: "#475569" }}>Dashboard ดึงข้อมูลจาก Google Sheets</div>
          <div style={{ fontSize: 12, color: "#334155", marginTop: 6 }}>เชื่อม Apps Script URL ใน sheets.js ก่อนใช้งาน</div>
        </div>
      </div>
    </>
  );

  // ── MAIN ──
  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight: "100dvh", background: "#07090f" }}>

        {/* Header */}
        <div style={{ background: "#0f172a", borderBottom: "1px solid #1e293b", padding: "11px 16px", position: "sticky", top: 0, zIndex: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <button onClick={() => setScreen("login")} style={{ background: "#07090f", border: "1px solid #1e293b", borderRadius: 8, color: "#475569", padding: "7px 11px", cursor: "pointer", fontSize: 12 }}>←</button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{branchName}</div>
              <div className="mono" style={{ fontSize: 10, color: "#334155" }}>{branch} · {date}</div>
            </div>
            <button onClick={() => setScreen("dashboard")} style={{ background: "transparent", border: "1px solid #1e293b", borderRadius: 8, color: "#475569", padding: "7px 11px", cursor: "pointer", fontSize: 12 }}>📊</button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {[{ id: "stock", label: "📦 Stock" }, { id: "engagement", label: "👥 Engagement" }].map((t) => (
              <button key={t.id} onClick={() => setMainTab(t.id)}
                style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: mainTab === t.id ? "linear-gradient(135deg,#0ea5e9,#6366f1)" : "#07090f", color: mainTab === t.id ? "#fff" : "#334155", transition: "all 0.18s" }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ══ STOCK ══ */}
        {mainTab === "stock" && <>
          <div style={{ display: "flex", background: "#0a0f1e", borderBottom: "1px solid #1e293b" }}>
            {[
              { id: "opening", label: "🌅 Opening", count: filledOpen, color: "#10b981" },
              { id: "replenishment", label: "🔄 Replenish", count: replenLogs.length, color: "#0ea5e9" },
              { id: "closing", label: "🌙 Closing", count: filledClose, color: "#8b5cf6" },
            ].map((p) => (
              <button key={p.id} onClick={() => setStockPhase(p.id)}
                style={{ flex: 1, padding: "11px 4px", border: "none", borderBottom: stockPhase === p.id ? `2px solid ${p.color}` : "2px solid transparent", background: "transparent", cursor: "pointer", fontSize: 11, fontWeight: 600, color: stockPhase === p.id ? p.color : "#334155", transition: "all 0.18s" }}>
                {p.label}
                {p.count > 0 && <span className="mono" style={{ marginLeft: 4, fontSize: 9, background: p.color + "20", color: p.color, padding: "1px 5px", borderRadius: 8 }}>{p.count}</span>}
              </button>
            ))}
          </div>

          <div style={{ padding: "14px 16px 120px" }}>

            {/* OPENING */}
            {stockPhase === "opening" && <>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>นับ Opening Stock เช้าวันนี้ · {filledOpen}/80</div>
                <div style={{ height: 3, background: "#0f172a", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(filledOpen / 80) * 100}%`, background: "linear-gradient(90deg,#10b981,#0ea5e9)", transition: "width 0.3s" }} />
                </div>
              </div>
              {PRODUCTS.map((p) => {
                const row = stockRows.find((r) => r.code === p.code);
                return (
                  <div key={p.code} style={{ background: "#0f172a", border: `1px solid ${row?.opening !== "" ? "#10b98130" : "#1e293b"}`, borderRadius: 11, padding: "11px 13px", display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                    <Tag color="#10b981" bg="#052e16">{p.code}</Tag>
                    <span style={{ flex: 1, fontSize: 12, color: "#64748b" }}>{p.name}</span>
                    <div style={{ width: 76 }}><Num value={row?.opening ?? ""} accent="#10b981" onChange={(v) => updateStock(p.code, "opening", v)} /></div>
                    <span style={{ fontSize: 10, color: "#1e293b", width: 24 }}>{p.unit}</span>
                  </div>
                );
              })}
            </>}

            {/* REPLENISHMENT */}
            {stockPhase === "replenishment" && <>
              <ReplenForm products={PRODUCTS} onAdd={addReplen} />
              {replenLogs.length > 0 && <>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#334155", marginTop: 16, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>ประวัติการเติม ({replenLogs.length} รายการ)</div>
                {replenLogs.map((log) => (
                  <div key={log.id} style={{ background: "#0f172a", border: "1px solid #0ea5e920", borderRadius: 10, padding: "10px 13px", display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span className="mono" style={{ fontSize: 10, color: "#334155" }}>{log.time}</span>
                    <Tag color="#0ea5e9" bg="#0c1a2e">{log.productCode}</Tag>
                    <span style={{ flex: 1, fontSize: 12, color: "#64748b" }}>{log.productName}</span>
                    <span className="mono" style={{ fontSize: 15, color: "#0ea5e9", fontWeight: 600 }}>+{log.qty}</span>
                  </div>
                ))}
              </>}
            </>}

            {/* CLOSING */}
            {stockPhase === "closing" && <>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>กรอก Closing Stock + Sale Return ก่อนปิดงาน</div>
              {PRODUCTS.map((p) => {
                const row = stockRows.find((r) => r.code === p.code);
                const rTotal = replenLogs.filter((l) => l.productCode === p.code).reduce((a, l) => a + l.qty, 0);
                return (
                  <div key={p.code} style={{ background: "#0f172a", border: `1px solid ${row?.closing !== "" ? "#8b5cf620" : "#1e293b"}`, borderRadius: 12, padding: 13, marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <Tag color="#8b5cf6" bg="#1e1b4b">{p.code}</Tag>
                      <span style={{ flex: 1, fontSize: 12, color: "#64748b" }}>{p.name}</span>
                      {row?.opening !== "" && <span className="mono" style={{ fontSize: 10, color: "#334155" }}>Open {row.opening}{rTotal > 0 ? ` +${rTotal}` : ""}</span>}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 9, color: "#475569", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Sale Return</div>
                        <Num value={row?.saleReturn ?? ""} accent="#f59e0b" onChange={(v) => updateStock(p.code, "saleReturn", v)} />
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: "#8b5cf6", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Closing Stock ★</div>
                        <Num value={row?.closing ?? ""} accent="#8b5cf6" onChange={(v) => updateStock(p.code, "closing", v)} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </>}
          </div>

          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px 20px", background: "linear-gradient(to top,#07090f 70%,transparent)", zIndex: 10 }}>
            <StatusMsg status={stockStatus} />
            <button onClick={handleSaveStock} disabled={stockSaving || filledOpen === 0}
              style={{ width: "100%", padding: 15, background: filledOpen > 0 ? "linear-gradient(135deg,#059669,#0ea5e9)" : "#1e293b", border: "none", borderRadius: 13, color: filledOpen > 0 ? "#fff" : "#334155", fontSize: 14, fontWeight: 700, cursor: filledOpen > 0 ? "pointer" : "not-allowed" }}>
              {stockSaving ? <span className="spin">⟳</span> : `💾 บันทึก Stock ลง Google Sheets`}
            </button>
          </div>
        </>}

        {/* ══ ENGAGEMENT ══ */}
        {mainTab === "engagement" && <>
          {/* KPI bar */}
          <div style={{ background: "#0a0f1e", borderBottom: "1px solid #1e293b", padding: "12px 16px", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4 }}>
            {[["Approach", engSum.ap, "#f59e0b"], ["Engage", engSum.en, "#0ea5e9"], ["Convert", engSum.cv, "#10b981"], ["Conv%", `${engSum.rate}%`, "#8b5cf6"]].map(([l, v, c]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
                <div style={{ fontSize: 9, color: "#334155", textTransform: "uppercase" }}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: "14px 16px 130px" }}>
            {/* Form */}
            {showForm && (
              <div className="fade-up" style={{ background: "#0f172a", border: "1px solid #6366f140", borderRadius: 15, padding: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 12 }}>{editingId ? "✏️ แก้ไข" : "➕ บันทึก Interaction ใหม่"}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 10 }}>
                  {[["approach", "Approach", "#f59e0b"], ["engagement", "Engage", "#0ea5e9"], ["convert", "Convert", "#10b981"]].map(([k, l, c]) => (
                    <div key={k}>
                      <div style={{ fontSize: 9, color: "#475569", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{l}</div>
                      <Num value={engForm[k]} accent={c} onChange={(v) => setEngForm((f) => ({ ...f, [k]: v }))} />
                    </div>
                  ))}
                </div>
                <input value={engForm.products} onChange={(e) => setEngForm((f) => ({ ...f, products: e.target.value }))}
                  placeholder="🏷 Product ที่ขายได้ เช่น P001, P003"
                  style={{ width: "100%", padding: "10px 12px", background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 9, color: "#fff", fontSize: 13, marginBottom: 8 }} />
                <textarea value={engForm.note} onChange={(e) => setEngForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="📝 หมายเหตุ / Note" rows={2}
                  style={{ width: "100%", padding: "10px 12px", background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 9, color: "#fff", fontSize: 13, resize: "none", marginBottom: 12 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setShowForm(false); setEditingId(null); setEngForm(blankEng()); }}
                    style={{ flex: 1, padding: 11, background: "transparent", border: "1px solid #1e293b", borderRadius: 9, color: "#475569", fontSize: 13, cursor: "pointer" }}>ยกเลิก</button>
                  <button onClick={saveEngEntry}
                    style={{ flex: 2, padding: 11, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 9, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {editingId ? "บันทึกการแก้ไข ✓" : "บันทึก"}
                  </button>
                </div>
              </div>
            )}

            {!showForm && (
              <button onClick={() => { setEngForm(blankEng()); setEditingId(null); setShowForm(true); }}
                style={{ width: "100%", padding: 13, background: "#0f172a", border: "1px dashed #6366f150", borderRadius: 12, color: "#6366f1", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>
                ➕ บันทึก Interaction ใหม่
              </button>
            )}

            {engLog.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px", color: "#1e293b" }}>
                <div style={{ fontSize: 36 }}>👥</div>
                <div style={{ marginTop: 10, fontSize: 13 }}>ยังไม่มี interaction วันนี้</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {engLog.map((e, i) => (
                  <div key={e.id} className="fade-up" style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 13, padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                      <span className="mono" style={{ fontSize: 10, color: "#334155" }}>#{i + 1} · {e.time}</span>
                      <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                        <button onClick={() => editEng(e)} style={{ background: "#1e293b", border: "none", borderRadius: 6, color: "#94a3b8", padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>✏️ แก้ไข</button>
                        <button onClick={() => deleteEng(e.id)} style={{ background: "#1e293b", border: "none", borderRadius: 6, color: "#ef4444", padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>🗑</button>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: (e.products || e.note) ? 10 : 0 }}>
                      {[["Approach", e.approach, "#f59e0b"], ["Engage", e.engagement, "#0ea5e9"], ["Convert", e.convert, "#10b981"]].map(([l, v, c]) => (
                        <div key={l} style={{ textAlign: "center", background: "#07090f", borderRadius: 8, padding: "8px 4px" }}>
                          <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: c }}>{v || "0"}</div>
                          <div style={{ fontSize: 9, color: "#334155", textTransform: "uppercase" }}>{l}</div>
                        </div>
                      ))}
                    </div>
                    {e.products && <div style={{ fontSize: 11, color: "#475569", marginBottom: 3 }}>🏷 {e.products}</div>}
                    {e.note && <div style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>📝 {e.note}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px 20px", background: "linear-gradient(to top,#07090f 70%,transparent)", zIndex: 10 }}>
            <StatusMsg status={engStatus} />
            <button onClick={handleSaveEng} disabled={engSaving || engLog.length === 0}
              style={{ width: "100%", padding: 15, background: engLog.length > 0 ? "linear-gradient(135deg,#7c3aed,#6366f1)" : "#1e293b", border: "none", borderRadius: 13, color: engLog.length > 0 ? "#fff" : "#334155", fontSize: 14, fontWeight: 700, cursor: engLog.length > 0 ? "pointer" : "not-allowed" }}>
              {engSaving ? <span className="spin">⟳</span> : `💾 บันทึก Engagement (${engLog.length} interactions)`}
            </button>
          </div>
        </>}
      </div>
    </>
  );
}

function ReplenForm({ products, onAdd }) {
  const [productCode, setProductCode] = useState("");
  const [qty, setQty] = useState("");
  const [search, setSearch] = useState("");
  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.code.includes(search));
  const handleAdd = () => { if (!productCode || !qty) return; onAdd(productCode, qty); setProductCode(""); setQty(""); setSearch(""); };
  return (
    <div style={{ background: "#0f172a", border: "1px solid #0ea5e940", borderRadius: 13, padding: 14, marginBottom: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#0ea5e9", marginBottom: 10 }}>เพิ่ม Stock ระหว่างวัน</div>
      <input value={search} onChange={(e) => { setSearch(e.target.value); setProductCode(""); }}
        placeholder="🔍 ค้นหา product..."
        style={{ width: "100%", padding: "10px 12px", background: "#07090f", border: "1px solid #1e293b", borderRadius: 9, color: "#fff", fontSize: 13, marginBottom: 6 }} />
      {search && !productCode && filtered.length > 0 && (
        <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: 8, borderRadius: 8, border: "1px solid #1e293b", background: "#07090f" }}>
          {filtered.slice(0, 8).map((p) => (
            <div key={p.code} onClick={() => { setProductCode(p.code); setSearch(p.name); }}
              style={{ padding: "9px 12px", cursor: "pointer", display: "flex", gap: 8, alignItems: "center", borderBottom: "1px solid #0f172a" }}>
              <Tag>{p.code}</Tag>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>{p.name}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: "#475569", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>จำนวนที่เติม</div>
          <Num value={qty} accent="#0ea5e9" onChange={setQty} />
        </div>
        <button onClick={handleAdd} disabled={!productCode || !qty}
          style={{ padding: "10px 18px", background: productCode && qty ? "#0ea5e9" : "#1e293b", border: "none", borderRadius: 9, color: productCode && qty ? "#fff" : "#334155", fontSize: 13, fontWeight: 700, cursor: productCode && qty ? "pointer" : "not-allowed" }}>
          + เพิ่ม
        </button>
      </div>
    </div>
  );
}