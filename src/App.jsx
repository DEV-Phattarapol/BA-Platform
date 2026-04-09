import { useState, useEffect, useMemo } from "react";
import { sheetsAPI } from "./sheets";

// ─── Helpers ──────────────────────────────────────────
const TODAY      = new Date().toISOString().slice(0, 10);
const toDateStr  = (d) => d ? String(d).slice(0, 10) : "";
const nowTime    = () => new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
const uid        = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const blankEng   = () => ({ id: uid(), time: nowTime(), approach: "", engagement: "", convert: "", products: "", note: "" });
const initRows   = (products) => products.map((p) => ({ ...p, opening: "" }));

// ─── LocalStorage ─────────────────────────────────────
const LS = {
  k:    (b, d, t) => `st4_${b}_${d}_${t}`,
  set:  (b, d, t, v) => { try { localStorage.setItem(`st4_${b}_${d}_${t}`, JSON.stringify(v)); } catch (_) {} },
  get:  (b, d, t) => { try { const v = localStorage.getItem(`st4_${b}_${d}_${t}`); return v ? JSON.parse(v) : null; } catch (_) { return null; } },
};

// ─── CSS ──────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Noto Sans Thai',sans-serif;background:#07090f;color:#e2e8f0;-webkit-tap-highlight-color:transparent}
  input,select,textarea,button{font-family:'Noto Sans Thai',sans-serif}
  input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
  .mono{font-family:'JetBrains Mono',monospace}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .fade-up{animation:fadeUp .2s ease forwards}
  .spin{animation:spin 1s linear infinite;display:inline-block}
  .pulse{animation:pulse 1.5s ease-in-out infinite}
  input:focus,textarea:focus,select:focus{outline:none}
`;

const C = {
  bg:"#07090f",surface:"#0f172a",elevated:"#141d2e",
  border:"#1e293b",muted:"#64748b",faint:"#1e293b",
  green:"#10b981",blue:"#0ea5e9",purple:"#8b5cf6",
  indigo:"#6366f1",yellow:"#f59e0b",red:"#ef4444",
  greenBg:"#052e16",blueBg:"#0c1a2e",purpleBg:"#1e1b4b",
};

// ─── Primitives ───────────────────────────────────────
const Tag = ({ c = C.indigo, bg = C.purpleBg, children }) => (
  <span className="mono" style={{ fontSize:10, color:c, background:bg, padding:"2px 8px", borderRadius:4, fontWeight:600, whiteSpace:"nowrap" }}>{children}</span>
);
const Num = ({ value, onChange, accent = C.indigo }) => (
  <input type="number" inputMode="numeric" placeholder="0" value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{ width:"100%", padding:"11px 8px", background:"#0a0f1e", border:`1.5px solid ${value!==""?accent+"90":C.border}`, borderRadius:10, color:"#fff", fontSize:16, fontFamily:"'JetBrains Mono',monospace", textAlign:"center", transition:"border-color .18s" }}/>
);
const GradBtn = ({ children, onClick, disabled, grad, style={} }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ border:"none", borderRadius:12, color:disabled?"#334155":"#fff", background:disabled?C.faint:grad, fontSize:14, fontWeight:700, cursor:disabled?"not-allowed":"pointer", padding:"13px 16px", ...style }}>
    {children}
  </button>
);
const StatusMsg = ({ status, okMsg="บันทึกสำเร็จ" }) => !status ? null : (
  <div style={{ textAlign:"center", fontSize:12, marginBottom:8, color:status==="success"?C.green:C.red }}>
    {status==="success"?`✅ ${okMsg}`:"❌ เกิดข้อผิดพลาด กรุณาลองใหม่"}
  </div>
);

// ════════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen]       = useState("login");
  const [branch, setBranch]       = useState("");
  const [date, setDate]           = useState(TODAY);
  const [mainTab, setMainTab]     = useState("stock");
  const [stockPhase, setPhase]    = useState("opening");

  // Master
  const [products, setProducts]   = useState([]);
  const [branches, setBranches]   = useState([]);
  const [masterLoading, setML]    = useState(false);
  const [masterError, setME]      = useState(null);

  // Opening
  const [openRows, setOpenRows]   = useState([]);
  const [openLocked, setOL]       = useState(false);
  const [openSaving, setOS]       = useState(false);
  const [openStatus, setOStatus]  = useState(null);
  const [openSearch, setOSearch]  = useState("");

  // Replenishment
  const [replenLogs, setRL]       = useState([]);
  const [replenSaving, setRS]     = useState(false);
  const [replenStatus, setRStatus]= useState(null);

  // Closing
  const [closeRows, setCloseRows] = useState([]);
  const [closingOpen, setCO]      = useState(false);
  const [closeSaving, setCS]      = useState(false);
  const [closeStatus, setCStatus] = useState(null);

  // Engagement
  const [engLog, setEngLog]       = useState([]);
  const [engForm, setEngForm]     = useState(blankEng());
  const [editingId, setEditId]    = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [engSaving, setEngS]      = useState(false);
  const [engStatus, setEngStatus] = useState(null);

  const branchName = branches.find((b) => b.id === branch)?.name ?? "";
  const filledOpen  = openRows.filter((r) => r.opening !== "").length;
  const filledClose = closeRows.filter((r) => r.closing !== "").length;

  // ── Load master on mount ──────────────────────────
  useEffect(() => {
    setML(true);
    sheetsAPI.getMaster()
      .then((d) => { setProducts(d.products ?? []); setBranches(d.branches ?? []); setME(null); })
      .catch((e) => setME(e.message))
      .finally(() => setML(false));
  }, []);

  // ── Login ─────────────────────────────────────────
  const handleLogin = async () => {
    if (!branch || products.length === 0) return;
    const d = toDateStr(date);

    // Opening
    let oRows = initRows(products);
    let locked = false;
    try {
      const res = await sheetsAPI.getOpening(d, branch);
      if (res.data?.length > 0) {
        const map = {};
        res.data.forEach((r) => { map[String(r[3])] = r; });
        oRows = products.map((p) => {
          const r = map[p.code];
          return { ...p, opening: r ? String(r[7]) : "" };
        });
        locked = oRows.some((r) => r.opening !== "");
      }
    } catch (_) {}
    const lsO = LS.get(branch, d, "open");
    if (lsO) { oRows = lsO; locked = lsO.some((r) => r.opening !== ""); }
    const lsOL = LS.get(branch, d, "openLocked");
    if (lsOL !== null) locked = lsOL;

    // Replenishment
    let replen = [];
    try {
      const res = await sheetsAPI.getReplenishment(d, branch);
      if (res.data?.length > 0) {
        replen = res.data.map((r) => ({
          id: String(r[9]), time: String(r[8]).slice(11, 16),
          productCode: String(r[3]), productName: String(r[4]),
          unit: String(r[5]), qty: parseFloat(r[7]) || 0,
        }));
      }
    } catch (_) {}
    const lsR = LS.get(branch, d, "replen");
    if (lsR?.length > 0) replen = lsR;

    // Closing
    let cRows = products.map((p) => ({ ...p, saleReturn: "", closing: "" }));
    let closingStarted = false;
    try {
      const res = await sheetsAPI.getClosing(d, branch);
      if (res.data?.length > 0) {
        const map = {};
        res.data.forEach((r) => { map[String(r[3])] = r; });
        cRows = products.map((p) => {
          const r = map[p.code];
          return { ...p, saleReturn: r ? String(r[7]) : "", closing: r ? String(r[8]) : "" };
        });
        closingStarted = cRows.some((r) => r.closing !== "");
      }
    } catch (_) {}
    const lsC = LS.get(branch, d, "close");
    if (lsC) { cRows = lsC; closingStarted = lsC.some((r) => r.closing !== ""); }
    const lsCO = LS.get(branch, d, "closingOpen");
    if (lsCO !== null) closingStarted = lsCO;

    // Engagement
    let eng = [];
    try {
      const res = await sheetsAPI.getEngDetail(d, branch);
      if (res.data?.length > 0) {
        eng = res.data.map((r) => ({
          id: String(r[9]), time: String(r[3]),
          approach: String(r[4]), engagement: String(r[5]), convert: String(r[6]),
          products: String(r[7]), note: String(r[8]),
        }));
      }
    } catch (_) {}
    const lsE = LS.get(branch, d, "eng");
    if (lsE?.length > 0) eng = lsE;

    setOpenRows(oRows); setOL(locked);
    setRL(replen);
    setCloseRows(cRows); setCO(closingStarted);
    setEngLog(eng);
    setOStatus(null); setRStatus(null); setCStatus(null); setEngStatus(null);
    setScreen("main");
  };

  // ── Auto-save draft ───────────────────────────────
  const d = toDateStr(date);
  useEffect(() => { if (screen==="main") LS.set(branch, d, "open", openRows); },       [openRows]);
  useEffect(() => { if (screen==="main") LS.set(branch, d, "openLocked", openLocked); },[openLocked]);
  useEffect(() => { if (screen==="main") LS.set(branch, d, "replen", replenLogs); },    [replenLogs]);
  useEffect(() => { if (screen==="main") LS.set(branch, d, "close", closeRows); },      [closeRows]);
  useEffect(() => { if (screen==="main") LS.set(branch, d, "closingOpen", closingOpen); },[closingOpen]);
  useEffect(() => { if (screen==="main") LS.set(branch, d, "eng", engLog); },           [engLog]);

  // ── Opening helpers ───────────────────────────────
  const updateOpen  = (code, val) => setOpenRows((r) => r.map((x) => x.code===code ? {...x, opening:val} : x));

  const handleSaveOpening = async () => {
    setOS(true); setOStatus(null);
    try {
      const rows = openRows
        .filter((r) => r.opening !== "")
        .map((r) => [d, branch, branchName, r.code, r.name, r.unit, r.mrp??0, parseFloat(r.opening)||0, new Date().toISOString()]);
      await sheetsAPI.saveOpening(rows);
      setOL(true);
      setOStatus("success");
    } catch { setOStatus("error"); }
    finally { setOS(false); }
  };

  // ── Replenishment helpers ─────────────────────────
  const addReplen = (productCode, qty) => {
    const p = products.find((x) => x.code === productCode);
    const entry = { id: uid(), time: nowTime(), productCode, productName: p?.name??"", unit: p?.unit??"ชิ้น", qty: parseFloat(qty)||0 };
    setRL((l) => [...l, entry]);
  };

  const editReplen = (id, newQty) => setRL((l) => l.map((x) => x.id===id ? {...x, qty:parseFloat(newQty)||0} : x));
  const delReplen  = (id) => setRL((l) => l.filter((x) => x.id !== id));

  const handleSaveReplen = async () => {
    setRS(true); setRStatus(null);
    try {
      const rows = replenLogs.map((r) => [
        d, branch, branchName, r.productCode, r.productName, r.unit,
        products.find((p) => p.code===r.productCode)?.mrp ?? 0,
        r.qty, r.time, r.id,
      ]);
      await sheetsAPI.saveReplenishment(rows);
      setRStatus("success");
    } catch { setRStatus("error"); }
    finally { setRS(false); }
  };

  // ── Closing helpers ───────────────────────────────
  const updateClose = (code, field, val) => setCloseRows((r) => r.map((x) => x.code===code ? {...x, [field]:val} : x));

  const handleSaveClosing = async () => {
    setCS(true); setCStatus(null);
    try {
      const rows = closeRows
        .filter((r) => r.closing !== "")
        .map((r) => [d, branch, branchName, r.code, r.name, r.unit, r.mrp??0, parseFloat(r.saleReturn)||0, parseFloat(r.closing)||0, new Date().toISOString()]);
      await sheetsAPI.saveClosing(rows);
      setCStatus("success");
    } catch { setCStatus("error"); }
    finally { setCS(false); }
  };

  // ── Engagement helpers ────────────────────────────
  const saveEng = () => {
    if (!engForm.approach && !engForm.engagement && !engForm.convert) return;
    if (editingId) { setEngLog((l) => l.map((e) => e.id===editingId ? {...engForm} : e)); setEditId(null); }
    else setEngLog((l) => [...l, {...engForm}]);
    setEngForm(blankEng()); setShowForm(false);
  };

  const handleSaveEng = async () => {
    setEngS(true); setEngStatus(null);
    try {
      const summary = [d, branch, branchName,
        engLog.reduce((a,e)=>a+(parseInt(e.approach)||0),0),
        engLog.reduce((a,e)=>a+(parseInt(e.engagement)||0),0),
        engLog.reduce((a,e)=>a+(parseInt(e.convert)||0),0),
        engLog.length, new Date().toISOString(),
      ];
      const details = engLog.map((e) => [d, branch, branchName, e.time, parseInt(e.approach)||0, parseInt(e.engagement)||0, parseInt(e.convert)||0, e.products, e.note, e.id]);
      await sheetsAPI.saveEngagement(summary, details);
      setEngStatus("success");
    } catch { setEngStatus("error"); }
    finally { setEngS(false); }
  };

  const engSum = useMemo(() => {
    const ap = engLog.reduce((a,e)=>a+(parseInt(e.approach)||0),0);
    const cv = engLog.reduce((a,e)=>a+(parseInt(e.convert)||0),0);
    return { ap, en: engLog.reduce((a,e)=>a+(parseInt(e.engagement)||0),0), cv, rate: ap>0?((cv/ap)*100).toFixed(1):"0.0" };
  }, [engLog]);

  const filteredOpen = useMemo(() =>
    openRows.filter((r) => r.name?.toLowerCase().includes(openSearch.toLowerCase()) || r.code?.includes(openSearch))
  , [openRows, openSearch]);

  // ════════════════ LOGIN ════════════════
  if (screen === "login") return (
    <>
      <style>{css}</style>
      <div style={{ minHeight:"100dvh", display:"flex", alignItems:"center", justifyContent:"center", padding:20, background:`radial-gradient(ellipse 80% 50% at 50% 0%,#0d1f3c,${C.bg})` }}>
        <div className="fade-up" style={{ width:"100%", maxWidth:400 }}>
          <div style={{ textAlign:"center", marginBottom:28 }}>
            <div style={{ width:62, height:62, margin:"0 auto 14px", background:"linear-gradient(135deg,#0ea5e9,#6366f1)", borderRadius:18, display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, boxShadow:"0 0 48px #6366f128" }}>📦</div>
            <div style={{ fontSize:24, fontWeight:700, color:"#fff" }}>StockTrack</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>Stock · Engagement · Dashboard</div>
          </div>
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, padding:26 }}>
            {masterLoading && <div className="pulse" style={{ textAlign:"center", padding:"16px 0", fontSize:13, color:C.muted }}>⟳ กำลังโหลด Products & Branches...</div>}
            {masterError && <div style={{ background:"#1a0a0a", border:`1px solid ${C.red}30`, borderRadius:10, padding:12, marginBottom:14, fontSize:12, color:C.red }}>⚠️ {masterError}</div>}

            <div style={{ fontSize:11, fontWeight:600, color:C.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:7 }}>สาขาของคุณ</div>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} disabled={masterLoading}
              style={{ width:"100%", padding:"13px 14px", background:C.bg, border:`1.5px solid ${branch?C.indigo:C.border}`, borderRadius:11, color:branch?"#fff":C.muted, fontSize:14, marginBottom:16, cursor:"pointer" }}>
              <option value="">{masterLoading?"กำลังโหลด...":"เลือกสาขา..."}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
            </select>

            <div style={{ fontSize:11, fontWeight:600, color:C.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:7 }}>วันที่</div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              style={{ width:"100%", padding:"13px 14px", background:C.bg, border:`1.5px solid ${C.border}`, borderRadius:11, color:"#fff", fontSize:14, marginBottom:20 }}/>

            <GradBtn onClick={handleLogin} disabled={!branch||masterLoading||products.length===0}
              grad="linear-gradient(135deg,#0ea5e9,#6366f1)" style={{ width:"100%", boxShadow:branch?"0 0 28px #6366f128":"none" }}>
              เข้าสู่ระบบ →
            </GradBtn>
            <div style={{ height:1, background:C.border, margin:"16px 0" }}/>
            <button onClick={() => setScreen("dashboard")}
              style={{ width:"100%", padding:12, background:"transparent", border:`1px solid ${C.border}`, borderRadius:11, color:C.muted, fontSize:13, cursor:"pointer" }}>
              📊 ดู Dashboard
            </button>
          </div>
          <div style={{ textAlign:"center", marginTop:12, fontSize:11, color:C.faint }}>
            ✦ {products.length} products · {branches.length} branches · auto-saved
          </div>
        </div>
      </div>
    </>
  );

  if (screen === "dashboard") return (
    <>
      <style>{css}</style>
      <div style={{ minHeight:"100dvh", background:C.bg }}>
        <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"14px 18px", display:"flex", gap:10, alignItems:"center" }}>
          <button onClick={() => setScreen("login")} style={{ background:C.elevated, border:`1px solid ${C.border}`, borderRadius:8, color:C.muted, padding:"8px 13px", cursor:"pointer", fontSize:13 }}>←</button>
          <div style={{ fontSize:15, fontWeight:700, color:"#fff" }}>Dashboard</div>
        </div>
        <div style={{ padding:24, textAlign:"center", color:C.muted, paddingTop:60 }}>
          <div style={{ fontSize:40, marginBottom:14 }}>📊</div>
          <div style={{ fontSize:14 }}>Dashboard — coming soon</div>
        </div>
      </div>
    </>
  );

  // ════════════════ MAIN ════════════════
  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight:"100dvh", background:C.bg }}>
        {/* Header */}
        <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"11px 16px", position:"sticky", top:0, zIndex:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <button onClick={() => setScreen("login")} style={{ background:C.elevated, border:`1px solid ${C.border}`, borderRadius:8, color:C.muted, padding:"7px 11px", cursor:"pointer", fontSize:12 }}>←</button>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>{branchName}</div>
              <div className="mono" style={{ fontSize:10, color:C.muted }}>{branch} · {d} · <span style={{ color:C.green }}>✦ auto-saved</span></div>
            </div>
            <button onClick={() => setScreen("dashboard")} style={{ background:C.elevated, border:`1px solid ${C.border}`, borderRadius:8, color:C.muted, padding:"7px 11px", cursor:"pointer", fontSize:12 }}>📊</button>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            {[{id:"stock",l:"📦 Stock"},{id:"engagement",l:"👥 Engagement"}].map((t) => (
              <button key={t.id} onClick={() => setMainTab(t.id)}
                style={{ flex:1, padding:"9px 0", borderRadius:9, border:"none", cursor:"pointer", fontSize:13, fontWeight:600, background:mainTab===t.id?"linear-gradient(135deg,#0ea5e9,#6366f1)":C.bg, color:mainTab===t.id?"#fff":C.muted, transition:"all .18s" }}>
                {t.l}
              </button>
            ))}
          </div>
        </div>

        {/* ══ STOCK ══ */}
        {mainTab === "stock" && <>
          <div style={{ display:"flex", background:"#0a0f1e", borderBottom:`1px solid ${C.border}` }}>
            {[
              { id:"opening",       l:"🌅 Opening",  count:filledOpen,       c:C.green  },
              { id:"replenishment", l:"🔄 Replenish", count:replenLogs.length, c:C.blue   },
              { id:"closing",       l:"🌙 Closing",   count:filledClose,      c:C.purple },
            ].map((p) => (
              <button key={p.id} onClick={() => setPhase(p.id)}
                style={{ flex:1, padding:"11px 4px", border:"none", borderBottom:stockPhase===p.id?`2px solid ${p.c}`:"2px solid transparent", background:"transparent", cursor:"pointer", fontSize:11, fontWeight:600, color:stockPhase===p.id?p.c:C.muted, transition:"all .18s" }}>
                {p.l}
                {p.count>0 && <span className="mono" style={{ marginLeft:4, fontSize:9, background:p.c+"20", color:p.c, padding:"1px 5px", borderRadius:8 }}>{p.count}</span>}
              </button>
            ))}
          </div>

          <div style={{ padding:"14px 16px 120px" }}>

            {/* ── OPENING ── */}
            {stockPhase === "opening" && <>
              {openLocked ? (
                <div style={{ background:C.greenBg, border:`1px solid ${C.green}30`, borderRadius:12, padding:"12px 16px", marginBottom:12, display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:13, color:C.green, flex:1 }}>✅ Opening ล็อคแล้ว ({filledOpen} รายการ)</span>
                  <button onClick={() => setOL(false)} style={{ background:"transparent", border:`1px solid ${C.green}40`, borderRadius:8, color:C.green, padding:"5px 12px", fontSize:12, cursor:"pointer" }}>แก้ไข</button>
                </div>
              ) : (
                <>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <span style={{ fontSize:12, color:C.muted }}>กรอก Opening Stock เช้าวันนี้</span>
                    <span className="mono" style={{ fontSize:12, color:filledOpen>0?C.green:C.muted }}>{filledOpen}/{products.length}</span>
                  </div>
                  <div style={{ height:3, background:C.faint, borderRadius:2, overflow:"hidden", marginBottom:10 }}>
                    <div style={{ height:"100%", width:`${products.length>0?(filledOpen/products.length)*100:0}%`, background:`linear-gradient(90deg,${C.green},${C.blue})`, transition:"width .3s" }}/>
                  </div>
                  <input value={openSearch} onChange={(e) => setOSearch(e.target.value)} placeholder="🔍 ค้นหา..."
                    style={{ width:"100%", padding:"10px 14px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, color:"#fff", fontSize:13, marginBottom:10 }}/>
                  {filteredOpen.map((row) => (
                    <div key={row.code} style={{ background:C.surface, border:`1px solid ${row.opening!==""?C.green+"30":C.border}`, borderRadius:11, padding:"11px 13px", display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
                      <Tag c={C.green} bg={C.greenBg}>{row.code}</Tag>
                      <span style={{ flex:1, fontSize:12, color:"#64748b" }}>{row.name}</span>
                      <div style={{ width:80 }}><Num value={row.opening} accent={C.green} onChange={(v) => updateOpen(row.code, v)}/></div>
                      {row.opening !== "" && <span style={{ fontSize:10, color:C.green }}>✓</span>}
                    </div>
                  ))}
                  {filledOpen > 0 && (
                    <div style={{ marginTop:14 }}>
                      <StatusMsg status={openStatus} okMsg="บันทึก Opening ลง Google Sheets แล้ว"/>
                      <GradBtn onClick={handleSaveOpening} disabled={openSaving}
                        grad={`linear-gradient(135deg,${C.green},${C.blue})`} style={{ width:"100%", boxShadow:`0 0 24px ${C.green}28` }}>
                        {openSaving ? <span className="spin">⟳</span> : `✅ ยืนยัน Opening (${filledOpen} รายการ)`}
                      </GradBtn>
                    </div>
                  )}
                </>
              )}
            </>}

            {/* ── REPLENISHMENT ── */}
            {stockPhase === "replenishment" && <>
              <ReplenForm products={products} onAdd={addReplen}/>
              {replenLogs.length > 0 && <>
                <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:.8, marginBottom:8, marginTop:14 }}>
                  ประวัติการเติม ({replenLogs.length} รายการ)
                </div>
                {replenLogs.map((log) => (
                  <ReplenCard key={log.id} log={log} onEdit={editReplen} onDelete={delReplen}/>
                ))}
              </>}
            </>}

            {/* ── CLOSING ── */}
            {stockPhase === "closing" && <>
              {!closingOpen ? (
                <div style={{ textAlign:"center", padding:"48px 20px" }}>
                  <div style={{ fontSize:36, marginBottom:16 }}>🌙</div>
                  <div style={{ fontSize:14, color:C.muted, marginBottom:24 }}>กด "เริ่มปิดงาน" เมื่อพร้อมกรอก Closing Stock</div>
                  <GradBtn onClick={() => setCO(true)} grad={`linear-gradient(135deg,${C.purple},${C.indigo})`} style={{ padding:"14px 40px" }}>
                    เริ่มปิดงาน
                  </GradBtn>
                </div>
              ) : (
                <>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>กรอก Sale Return + Closing Stock · {filledClose}/{products.length}</div>
                  {closeRows.map((p) => {
                    const replenTotal = replenLogs.filter((l) => l.productCode===p.code).reduce((a,l) => a+l.qty, 0);
                    const openVal = openRows.find((r) => r.code===p.code)?.opening ?? "";
                    return (
                      <div key={p.code} style={{ background:C.surface, border:`1px solid ${p.closing!==""?C.purple+"30":C.border}`, borderRadius:12, padding:13, marginBottom:8 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                          <Tag c={C.purple} bg={C.purpleBg}>{p.code}</Tag>
                          <span style={{ flex:1, fontSize:12, color:"#64748b" }}>{p.name}</span>
                          {openVal !== "" && <span className="mono" style={{ fontSize:10, color:C.muted }}>Open {openVal}{replenTotal>0?` +${replenTotal}`:""}</span>}
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                          <div>
                            <div style={{ fontSize:9, color:C.muted, marginBottom:4, textTransform:"uppercase", letterSpacing:.5 }}>Sale Return</div>
                            <Num value={p.saleReturn} accent={C.yellow} onChange={(v) => updateClose(p.code,"saleReturn",v)}/>
                          </div>
                          <div>
                            <div style={{ fontSize:9, color:C.purple, marginBottom:4, textTransform:"uppercase", letterSpacing:.5, fontWeight:700 }}>Closing ★</div>
                            <Num value={p.closing} accent={C.purple} onChange={(v) => updateClose(p.code,"closing",v)}/>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>}
          </div>

          {/* FAB */}
          <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"12px 16px 20px", background:`linear-gradient(to top,${C.bg} 70%,transparent)`, zIndex:10 }}>
            {stockPhase === "replenishment" && <>
              <StatusMsg status={replenStatus} okMsg="บันทึก Replenishment แล้ว"/>
              <GradBtn onClick={handleSaveReplen} disabled={replenSaving||replenLogs.length===0}
                grad={`linear-gradient(135deg,${C.blue},${C.indigo})`} style={{ width:"100%", boxShadow:`0 0 24px ${C.blue}28` }}>
                {replenSaving?<span className="spin">⟳</span>:`💾 บันทึก Replenishment (${replenLogs.length})`}
              </GradBtn>
            </>}
            {stockPhase === "closing" && closingOpen && <>
              <StatusMsg status={closeStatus} okMsg="บันทึก Closing แล้ว"/>
              <GradBtn onClick={handleSaveClosing} disabled={closeSaving||filledClose===0}
                grad={`linear-gradient(135deg,${C.purple},${C.indigo})`} style={{ width:"100%", boxShadow:`0 0 24px ${C.purple}28` }}>
                {closeSaving?<span className="spin">⟳</span>:`💾 บันทึก Closing (${filledClose} รายการ)`}
              </GradBtn>
            </>}
          </div>
        </>}

        {/* ══ ENGAGEMENT ══ */}
        {mainTab === "engagement" && <>
          <div style={{ background:"#0a0f1e", borderBottom:`1px solid ${C.border}`, padding:"12px 16px", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:4 }}>
            {[["Approach",engSum.ap,C.yellow],["Engage",engSum.en,C.blue],["Convert",engSum.cv,C.green],[`${engSum.rate}%`,"Conv%",C.purple]].map(([v,l,c]) => (
              <div key={l} style={{ textAlign:"center" }}>
                <div className="mono" style={{ fontSize:20, fontWeight:700, color:c }}>{v}</div>
                <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase" }}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{ padding:"14px 16px 130px" }}>
            {showForm && (
              <div className="fade-up" style={{ background:C.surface, border:`1px solid ${C.indigo}40`, borderRadius:15, padding:16, marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#fff", marginBottom:12 }}>{editingId?"✏️ แก้ไข":"➕ บันทึก Interaction ใหม่"}</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:10 }}>
                  {[["approach","Approach",C.yellow],["engagement","Engage",C.blue],["convert","Convert",C.green]].map(([k,l,c]) => (
                    <div key={k}>
                      <div style={{ fontSize:9, color:C.muted, marginBottom:4, textTransform:"uppercase", letterSpacing:.5 }}>{l}</div>
                      <Num value={engForm[k]} accent={c} onChange={(v) => setEngForm((f) => ({...f,[k]:v}))}/>
                    </div>
                  ))}
                </div>
                <input value={engForm.products} onChange={(e) => setEngForm((f) => ({...f,products:e.target.value}))}
                  placeholder="🏷 Product code ที่ขายได้"
                  style={{ width:"100%", padding:"10px 12px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:9, color:"#fff", fontSize:13, marginBottom:8 }}/>
                <textarea value={engForm.note} onChange={(e) => setEngForm((f) => ({...f,note:e.target.value}))}
                  placeholder="📝 หมายเหตุ..." rows={2}
                  style={{ width:"100%", padding:"10px 12px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:9, color:"#fff", fontSize:13, resize:"none", marginBottom:12 }}/>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => { setShowForm(false); setEditId(null); setEngForm(blankEng()); }}
                    style={{ flex:1, padding:11, background:"transparent", border:`1px solid ${C.border}`, borderRadius:9, color:C.muted, fontSize:13, cursor:"pointer" }}>ยกเลิก</button>
                  <button onClick={saveEng}
                    style={{ flex:2, padding:11, background:`linear-gradient(135deg,${C.indigo},${C.purple})`, border:"none", borderRadius:9, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                    {editingId?"บันทึกการแก้ไข ✓":"บันทึก"}
                  </button>
                </div>
              </div>
            )}
            {!showForm && (
              <button onClick={() => { setEngForm(blankEng()); setEditId(null); setShowForm(true); }}
                style={{ width:"100%", padding:13, background:C.surface, border:`1.5px dashed ${C.indigo}50`, borderRadius:12, color:C.indigo, fontSize:13, fontWeight:600, cursor:"pointer", marginBottom:14 }}>
                ➕ บันทึก Interaction ใหม่
              </button>
            )}
            {engLog.length === 0 ? (
              <div style={{ textAlign:"center", padding:"48px 20px", color:C.faint }}>
                <div style={{ fontSize:36 }}>👥</div>
                <div style={{ marginTop:10, fontSize:13 }}>ยังไม่มี interaction วันนี้</div>
              </div>
            ) : (
              engLog.map((e, i) => (
                <div key={e.id} className="fade-up" style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:13, padding:14, marginBottom:8 }}>
                  <div style={{ display:"flex", alignItems:"center", marginBottom:10 }}>
                    <span className="mono" style={{ fontSize:10, color:C.muted }}>#{i+1} · {e.time}</span>
                    <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
                      <button onClick={() => { setEngForm({...e}); setEditId(e.id); setShowForm(true); }}
                        style={{ background:C.elevated, border:"none", borderRadius:6, color:"#94a3b8", padding:"4px 10px", fontSize:11, cursor:"pointer" }}>✏️ แก้ไข</button>
                      <button onClick={() => setEngLog((l) => l.filter((x) => x.id!==e.id))}
                        style={{ background:C.elevated, border:"none", borderRadius:6, color:C.red, padding:"4px 10px", fontSize:11, cursor:"pointer" }}>🗑</button>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:(e.products||e.note)?10:0 }}>
                    {[["Approach",e.approach,C.yellow],["Engage",e.engagement,C.blue],["Convert",e.convert,C.green]].map(([l,v,c]) => (
                      <div key={l} style={{ textAlign:"center", background:C.bg, borderRadius:9, padding:"10px 4px" }}>
                        <div className="mono" style={{ fontSize:22, fontWeight:700, color:c }}>{v||"0"}</div>
                        <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase" }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  {e.products && <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>🏷 {e.products}</div>}
                  {e.note && <div style={{ fontSize:11, color:C.muted, fontStyle:"italic" }}>📝 {e.note}</div>}
                </div>
              ))
            )}
          </div>

          <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"12px 16px 20px", background:`linear-gradient(to top,${C.bg} 70%,transparent)`, zIndex:10 }}>
            <StatusMsg status={engStatus} okMsg="บันทึก Engagement ลง Google Sheets แล้ว"/>
            <GradBtn onClick={handleSaveEng} disabled={engSaving||engLog.length===0}
              grad={`linear-gradient(135deg,#7c3aed,${C.indigo})`} style={{ width:"100%", boxShadow:`0 0 24px #6366f128` }}>
              {engSaving?<span className="spin">⟳</span>:`💾 บันทึก Engagement (${engLog.length})`}
            </GradBtn>
          </div>
        </>}
      </div>
    </>
  );
}

// ─── ReplenForm ───────────────────────────────────────
function ReplenForm({ products, onAdd }) {
  const [search, setSearch] = useState("");
  const [code, setCode]     = useState("");
  const [qty, setQty]       = useState("");
  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.code.includes(search));
  const C = { bg:"#07090f", surface:"#0f172a", border:"#1e293b", blue:"#0ea5e9", blueBg:"#0c1a2e", muted:"#64748b", faint:"#1e293b" };
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.blue}40`, borderRadius:13, padding:14, marginBottom:6 }}>
      <div style={{ fontSize:12, fontWeight:600, color:C.blue, marginBottom:10 }}>➕ เพิ่ม Stock ระหว่างวัน</div>
      <input value={search} onChange={(e) => { setSearch(e.target.value); setCode(""); }} placeholder="🔍 ค้นหา product..."
        style={{ width:"100%", padding:"10px 12px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:9, color:"#fff", fontSize:13, marginBottom:6 }}/>
      {search && !code && filtered.length > 0 && (
        <div style={{ maxHeight:150, overflowY:"auto", marginBottom:8, borderRadius:8, border:`1px solid ${C.border}`, background:C.bg }}>
          {filtered.slice(0, 8).map((p) => (
            <div key={p.code} onClick={() => { setCode(p.code); setSearch(p.name); }}
              style={{ padding:"9px 12px", cursor:"pointer", display:"flex", gap:8, alignItems:"center", borderBottom:`1px solid ${C.faint}` }}>
              <span className="mono" style={{ fontSize:10, color:C.blue, background:C.blueBg, padding:"2px 7px", borderRadius:4, fontWeight:600 }}>{p.code}</span>
              <span style={{ fontSize:12, color:"#94a3b8" }}>{p.name}</span>
            </div>
          ))}
        </div>
      )}
      {code && <div style={{ padding:"7px 12px", background:C.blueBg, borderRadius:8, marginBottom:8, fontSize:12, color:C.blue }}>✓ {search}</div>}
      <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:9, color:C.muted, marginBottom:4, textTransform:"uppercase", letterSpacing:.5 }}>จำนวนที่เติม</div>
          <input type="number" inputMode="numeric" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)}
            style={{ width:"100%", padding:"11px 8px", background:"#0a0f1e", border:`1.5px solid ${qty!==""?C.blue+"90":C.border}`, borderRadius:10, color:"#fff", fontSize:16, fontFamily:"'JetBrains Mono',monospace", textAlign:"center" }}/>
        </div>
        <button onClick={() => { if(!code||!qty) return; onAdd(code,qty); setCode(""); setQty(""); setSearch(""); }}
          disabled={!code||!qty}
          style={{ padding:"11px 20px", background:code&&qty?C.blue:"#1e293b", border:"none", borderRadius:10, color:code&&qty?"#fff":"#334155", fontSize:13, fontWeight:700, cursor:code&&qty?"pointer":"not-allowed" }}>
          + เพิ่ม
        </button>
      </div>
    </div>
  );
}

// ─── ReplenCard ───────────────────────────────────────
function ReplenCard({ log, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty]         = useState(String(log.qty));
  const C = { surface:"#0f172a", border:"#1e293b", blue:"#0ea5e9", blueBg:"#0c1a2e", muted:"#64748b", red:"#ef4444", elevated:"#141d2e" };
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.blue}20`, borderRadius:10, padding:"10px 13px", marginBottom:6 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <span className="mono" style={{ fontSize:10, color:C.muted }}>{log.time}</span>
        <span className="mono" style={{ fontSize:10, color:C.blue, background:C.blueBg, padding:"2px 7px", borderRadius:4, fontWeight:600 }}>{log.productCode}</span>
        <span style={{ flex:1, fontSize:12, color:"#64748b" }}>{log.productName}</span>
        {!editing && <span className="mono" style={{ fontSize:15, color:C.blue, fontWeight:700 }}>+{log.qty}</span>}
        {!editing && (
          <div style={{ display:"flex", gap:4 }}>
            <button onClick={() => setEditing(true)} style={{ background:C.elevated, border:"none", borderRadius:6, color:"#94a3b8", padding:"4px 8px", fontSize:11, cursor:"pointer" }}>✏️</button>
            <button onClick={() => onDelete(log.id)} style={{ background:C.elevated, border:"none", borderRadius:6, color:C.red, padding:"4px 8px", fontSize:11, cursor:"pointer" }}>🗑</button>
          </div>
        )}
      </div>
      {editing && (
        <div style={{ display:"flex", gap:8, marginTop:8, alignItems:"center" }}>
          <input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)}
            style={{ flex:1, padding:"9px 8px", background:"#0a0f1e", border:`1.5px solid ${C.blue}90`, borderRadius:9, color:"#fff", fontSize:15, fontFamily:"'JetBrains Mono',monospace", textAlign:"center" }}/>
          <button onClick={() => { onEdit(log.id, qty); setEditing(false); }}
            style={{ padding:"9px 14px", background:C.blue, border:"none", borderRadius:9, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>บันทึก</button>
          <button onClick={() => { setQty(String(log.qty)); setEditing(false); }}
            style={{ padding:"9px 14px", background:C.elevated, border:"none", borderRadius:9, color:C.muted, fontSize:13, cursor:"pointer" }}>ยกเลิก</button>
        </div>
      )}
    </div>
  );
}