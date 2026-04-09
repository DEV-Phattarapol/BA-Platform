import { useState, useEffect, useMemo } from "react";
import { sheetsAPI } from "./sheets";

// ─── Constants ────────────────────────────────────────
const TODAY = new Date().toISOString().split("T")[0];
const nowTime = () => new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const initStockRows = (products) => products.map((p) => ({ ...p, opening: "", replenishment: "", saleReturn: "", closing: "" }));
const blankEng = () => ({ id: uid(), time: nowTime(), approach: "", engagement: "", convert: "", products: "", note: "" });

// ─── LocalStorage ─────────────────────────────────────
const LS = {
  key: (b, d, t) => `st3_${b}_${d}_${t}`,
  save: (b, d, t, v) => { try { localStorage.setItem(`st3_${b}_${d}_${t}`, JSON.stringify(v)); } catch (_) {} },
  load: (b, d, t) => { try { const v = localStorage.getItem(`st3_${b}_${d}_${t}`); return v ? JSON.parse(v) : null; } catch (_) { return null; } },
};

// ─── CSS ──────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Noto Sans Thai',sans-serif;background:#07090f;color:#e2e8f0;-webkit-tap-highlight-color:transparent}
  input,select,textarea,button{font-family:'Noto Sans Thai',sans-serif}
  input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
  ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
  .mono{font-family:'JetBrains Mono',monospace}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  .fade-up{animation:fadeUp .22s ease forwards}
  .spin{animation:spin 1s linear infinite;display:inline-block}
  .pulse{animation:pulse 1.5s ease-in-out infinite}
  input:focus,textarea:focus,select:focus{outline:none}
`;

const C = {
  bg:"#07090f", surface:"#0f172a", elevated:"#141d2e",
  border:"#1e293b", text:"#e2e8f0", muted:"#64748b", faint:"#1e293b",
  green:"#10b981", blue:"#0ea5e9", purple:"#8b5cf6",
  indigo:"#6366f1", yellow:"#f59e0b", red:"#ef4444",
  greenBg:"#052e16", blueBg:"#0c1a2e", purpleBg:"#1e1b4b",
};

// ─── Primitives ───────────────────────────────────────
const Tag = ({ children, color=C.indigo, bg=C.purpleBg }) => (
  <span className="mono" style={{fontSize:10,color,background:bg,padding:"2px 8px",borderRadius:4,fontWeight:600,whiteSpace:"nowrap"}}>{children}</span>
);
const Num = ({ value, onChange, accent=C.indigo }) => (
  <input type="number" inputMode="numeric" placeholder="0" value={value}
    onChange={(e)=>onChange(e.target.value)}
    style={{width:"100%",padding:"11px 8px",background:"#0a0f1e",border:`1.5px solid ${value!==""?accent+"90":C.border}`,borderRadius:10,color:"#fff",fontSize:16,fontFamily:"'JetBrains Mono',monospace",textAlign:"center",transition:"border-color .18s"}}/>
);
const Btn = ({ children, onClick, disabled, color="#fff", bg, style={} }) => (
  <button onClick={onClick} disabled={disabled}
    style={{padding:"13px 0",border:"none",borderRadius:12,color:disabled?"#334155":color,background:disabled?C.faint:(bg||C.indigo),fontSize:14,fontWeight:700,cursor:disabled?"not-allowed":"pointer",...style}}>
    {children}
  </button>
);
const StatusMsg = ({ status, okMsg="บันทึกสำเร็จ" }) => !status ? null : (
  <div style={{textAlign:"center",fontSize:12,marginBottom:8,color:status==="success"?C.green:C.red}}>
    {status==="success"?`✅ ${okMsg}`:"❌ เกิดข้อผิดพลาด กรุณาลองใหม่"}
  </div>
);

// ════════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen] = useState("login");
  const [branch, setBranch] = useState("");
  const [date, setDate] = useState(TODAY);
  const [mainTab, setMainTab] = useState("stock");
  const [stockPhase, setStockPhase] = useState("opening");

  // Master data from Sheet
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterError, setMasterError] = useState(null);

  // Stock state
  const [stockRows, setStockRows] = useState([]);
  const [openingLocked, setOpeningLocked] = useState(false);
  const [replenLogs, setReplenLogs] = useState([]);
  const [closingOpen, setClosingOpen] = useState(false);
  const [stockSaving, setStockSaving] = useState(false);
  const [stockStatus, setStockStatus] = useState(null);
  const [stockSearch, setStockSearch] = useState("");

  // Engagement state
  const [engLog, setEngLog] = useState([]);
  const [engForm, setEngForm] = useState(blankEng());
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [engSaving, setEngSaving] = useState(false);
  const [engStatus, setEngStatus] = useState(null);

  const branchName = branches.find((b)=>b.id===branch)?.name ?? "";

  // ── Load Master on mount ──────────────────────────
  useEffect(()=>{
    setMasterLoading(true);
    sheetsAPI.getMaster()
      .then((data)=>{
        setProducts(data.products ?? []);
        setBranches(data.branches ?? []);
        setMasterError(null);
      })
      .catch((e)=>setMasterError(e.message))
      .finally(()=>setMasterLoading(false));
  },[]);

  // ── Login: โหลดข้อมูลเดิมจาก Sheet + localStorage ──
  const handleLogin = async () => {
    if (!branch || products.length===0) return;

    // โหลด stock เดิมจาก Sheet
    let baseRows = initStockRows(products);
    let locked = false;
    let replen = [];
    let closing = false;

    try {
      const res = await sheetsAPI.getStock(date, branch);
      if (res.data && res.data.length > 0) {
        // มีข้อมูลเดิมใน Sheet → map กลับเข้า stockRows
        // col: 0=Date,1=BranchID,2=BranchName,3=ProductCode,4=ProductName,5=Unit,6=MRP,7=Opening,8=Replenishment,9=SaleReturn,10=Closing
        const sheetMap = {};
        res.data.forEach((r)=>{ sheetMap[String(r[3])] = r; });
        baseRows = products.map((p)=>{
          const r = sheetMap[p.code];
          if (!r) return { ...p, opening:"", replenishment:"", saleReturn:"", closing:"" };
          return {
            ...p,
            opening      : r[7]!==undefined && r[7]!=="" ? String(r[7]) : "",
            replenishment: r[8]!==undefined && r[8]!=="" ? String(r[8]) : "",
            saleReturn   : r[9]!==undefined && r[9]!=="" ? String(r[9]) : "",
            closing      : r[10]!==undefined && r[10]!=="" ? String(r[10]) : "",
          };
        });
        locked = baseRows.some((r)=>r.opening!=="");
        closing = baseRows.some((r)=>r.closing!=="");
      }
    } catch(_) {}

    // merge กับ localStorage draft (ถ้ามี)
    const lsDraft = LS.load(branch, date, "stock");
    if (lsDraft) baseRows = lsDraft;
    const lsReplen = LS.load(branch, date, "replen");
    if (lsReplen) replen = lsReplen;
    const lsLocked = LS.load(branch, date, "locked");
    if (lsLocked!==null) locked = lsLocked;
    const lsClosing = LS.load(branch, date, "closing");
    if (lsClosing!==null) closing = lsClosing;

    // Engagement
    let eng = [];
    try {
      const res = await sheetsAPI.getEngDetail(date, branch);
      if (res.data && res.data.length > 0) {
        eng = res.data.map((r)=>({
          id:String(r[9]), time:String(r[3]),
          approach:String(r[4]), engagement:String(r[5]), convert:String(r[6]),
          products:String(r[7]), note:String(r[8]),
        }));
      }
    } catch(_) {}
    const lsEng = LS.load(branch, date, "eng");
    if (lsEng && lsEng.length > 0) eng = lsEng;

    setStockRows(baseRows);
    setOpeningLocked(locked);
    setReplenLogs(replen);
    setClosingOpen(closing);
    setEngLog(eng);
    setStockStatus(null); setEngStatus(null);
    setScreen("main");
  };

  // ── Auto-save draft ───────────────────────────────
  useEffect(()=>{ if(screen==="main"){ LS.save(branch,date,"stock",stockRows); }}, [stockRows]);
  useEffect(()=>{ if(screen==="main"){ LS.save(branch,date,"replen",replenLogs); }}, [replenLogs]);
  useEffect(()=>{ if(screen==="main"){ LS.save(branch,date,"locked",openingLocked); }}, [openingLocked]);
  useEffect(()=>{ if(screen==="main"){ LS.save(branch,date,"closing",closingOpen); }}, [closingOpen]);
  useEffect(()=>{ if(screen==="main"){ LS.save(branch,date,"eng",engLog); }}, [engLog]);

  // ── Stock helpers ─────────────────────────────────
  const updateStock = (code,field,val) =>
    setStockRows((r)=>r.map((x)=>x.code===code?{...x,[field]:val}:x));

  const filledOpen  = stockRows.filter((r)=>r.opening!=="").length;
  const filledClose = stockRows.filter((r)=>r.closing!=="").length;

  const addReplen = (productCode, qty) => {
    const p = products.find((x)=>x.code===productCode);
    const newLog = { id:uid(), time:nowTime(), productCode, productName:p?.name??"", qty:parseFloat(qty)||0 };
    setReplenLogs((l)=>[...l, newLog]);
    setStockRows((rows)=>rows.map((r)=>
      r.code===productCode
        ? {...r, replenishment:String((parseFloat(r.replenishment)||0)+(parseFloat(qty)||0))}
        : r
    ));
  };

  const editReplen = (id, newQty) => {
    setReplenLogs((logs)=>{
      const old = logs.find((l)=>l.id===id);
      if (!old) return logs;
      const diff = (parseFloat(newQty)||0) - old.qty;
      setStockRows((rows)=>rows.map((r)=>
        r.code===old.productCode
          ? {...r, replenishment:String((parseFloat(r.replenishment)||0)+diff)}
          : r
      ));
      return logs.map((l)=>l.id===id?{...l,qty:parseFloat(newQty)||0}:l);
    });
  };

  const deleteReplen = (id) => {
    setReplenLogs((logs)=>{
      const old = logs.find((l)=>l.id===id);
      if (!old) return logs;
      setStockRows((rows)=>rows.map((r)=>
        r.code===old.productCode
          ? {...r, replenishment:String(Math.max(0,(parseFloat(r.replenishment)||0)-old.qty))}
          : r
      ));
      return logs.filter((l)=>l.id!==id);
    });
  };

  // ── Save Stock (upsert) ───────────────────────────
  const handleSaveStock = async () => {
    setStockSaving(true); setStockStatus(null);
    try {
      const rows = stockRows
        .filter((r)=>r.opening!==""||r.replenishment!==""||r.closing!=="")
        .map((r)=>[
          date, branch, branchName,
          r.code, r.name, r.unit, r.mrp??0,
          parseFloat(r.opening)||0,
          parseFloat(r.replenishment)||0,
          parseFloat(r.saleReturn)||0,
          parseFloat(r.closing)||0,
          new Date().toISOString(),
        ]);
      await sheetsAPI.appendStock(rows);
      setStockStatus("success");
    } catch { setStockStatus("error"); }
    finally { setStockSaving(false); }
  };

  // ── Engagement helpers ────────────────────────────
  const saveEng = () => {
    if (!engForm.approach && !engForm.engagement && !engForm.convert) return;
    if (editingId) {
      setEngLog((l)=>l.map((e)=>e.id===editingId?{...engForm}:e));
      setEditingId(null);
    } else {
      setEngLog((l)=>[...l,{...engForm}]);
    }
    setEngForm(blankEng()); setShowForm(false);
  };

  const handleSaveEng = async () => {
    setEngSaving(true); setEngStatus(null);
    try {
      const summary=[
        date, branch, branchName,
        engLog.reduce((a,e)=>a+(parseInt(e.approach)||0),0),
        engLog.reduce((a,e)=>a+(parseInt(e.engagement)||0),0),
        engLog.reduce((a,e)=>a+(parseInt(e.convert)||0),0),
        engLog.length, new Date().toISOString(),
      ];
      const details = engLog.map((e)=>[
        date, branch, branchName, e.time,
        parseInt(e.approach)||0, parseInt(e.engagement)||0, parseInt(e.convert)||0,
        e.products, e.note, e.id,
      ]);
      await sheetsAPI.appendEngagement(summary, details);
      setEngStatus("success");
    } catch { setEngStatus("error"); }
    finally { setEngSaving(false); }
  };

  const engSum = useMemo(()=>{
    const ap=engLog.reduce((a,e)=>a+(parseInt(e.approach)||0),0);
    const en=engLog.reduce((a,e)=>a+(parseInt(e.engagement)||0),0);
    const cv=engLog.reduce((a,e)=>a+(parseInt(e.convert)||0),0);
    return { ap, en, cv, rate:ap>0?((cv/ap)*100).toFixed(1):"0.0" };
  },[engLog]);

  const filteredStock = useMemo(()=>
    stockRows.filter((r)=>
      r.name?.toLowerCase().includes(stockSearch.toLowerCase())||
      r.code?.includes(stockSearch)
    ), [stockRows, stockSearch]);

  // ════════════════ LOGIN ════════════════
  if (screen==="login") return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:`radial-gradient(ellipse 80% 50% at 50% 0%,#0d1f3c,${C.bg})`}}>
        <div className="fade-up" style={{width:"100%",maxWidth:400}}>
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{width:62,height:62,margin:"0 auto 14px",background:"linear-gradient(135deg,#0ea5e9,#6366f1)",borderRadius:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,boxShadow:"0 0 48px #6366f128"}}>📦</div>
            <div style={{fontSize:24,fontWeight:700,color:"#fff"}}>StockTrack</div>
            <div style={{fontSize:12,color:C.muted,marginTop:4}}>Stock · Engagement · Dashboard</div>
          </div>

          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:26}}>
            {masterLoading && (
              <div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontSize:13}} className="pulse">
                ⟳ กำลังโหลดข้อมูล Products & Branches...
              </div>
            )}
            {masterError && (
              <div style={{background:"#1a0a0a",border:`1px solid ${C.red}30`,borderRadius:10,padding:12,marginBottom:16,fontSize:12,color:C.red}}>
                ⚠️ โหลด Master Data ไม่ได้: {masterError}
                <br/><span style={{color:C.muted}}>ตรวจสอบ Apps Script URL และ Sheet ชื่อ Product_Master, Branch_Master</span>
              </div>
            )}

            <div style={{fontSize:11,fontWeight:600,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:7}}>สาขาของคุณ</div>
            <select value={branch} onChange={(e)=>setBranch(e.target.value)} disabled={masterLoading||branches.length===0}
              style={{width:"100%",padding:"13px 14px",background:C.bg,border:`1.5px solid ${branch?C.indigo:C.border}`,borderRadius:11,color:branch?"#fff":C.muted,fontSize:14,marginBottom:16,cursor:"pointer"}}>
              <option value="">{branches.length===0?"กำลังโหลด...":"เลือกสาขา..."}</option>
              {branches.map((b)=><option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
            </select>

            <div style={{fontSize:11,fontWeight:600,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:7}}>วันที่</div>
            <input type="date" value={date} onChange={(e)=>setDate(e.target.value)}
              style={{width:"100%",padding:"13px 14px",background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:11,color:"#fff",fontSize:14,marginBottom:20}}/>

            <Btn onClick={handleLogin} disabled={!branch||masterLoading||products.length===0}
              bg="linear-gradient(135deg,#0ea5e9,#6366f1)" style={{width:"100%",boxShadow:branch?"0 0 28px #6366f130":"none"}}>
              เข้าสู่ระบบ →
            </Btn>

            <div style={{height:1,background:C.border,margin:"18px 0"}}/>
            <button onClick={()=>setScreen("dashboard")}
              style={{width:"100%",padding:12,background:"transparent",border:`1px solid ${C.border}`,borderRadius:11,color:C.muted,fontSize:13,cursor:"pointer"}}>
              📊 ดู Dashboard
            </button>
          </div>
          <div style={{textAlign:"center",marginTop:14,fontSize:11,color:C.faint}}>
            ✦ Products: {products.length} รายการ · Branches: {branches.length} สาขา
          </div>
        </div>
      </div>
    </>
  );

  // ════════════════ DASHBOARD placeholder ════════════════
  if (screen==="dashboard") return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100dvh",background:C.bg}}>
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"14px 18px",display:"flex",gap:10,alignItems:"center"}}>
          <button onClick={()=>setScreen("login")} style={{background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,padding:"8px 13px",cursor:"pointer",fontSize:13}}>←</button>
          <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>Dashboard</div>
        </div>
        <div style={{padding:24,textAlign:"center",color:C.muted,paddingTop:60}}>
          <div style={{fontSize:40,marginBottom:14}}>📊</div>
          <div style={{fontSize:14}}>Dashboard — coming soon</div>
        </div>
      </div>
    </>
  );

  // ════════════════ MAIN APP ════════════════
  return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100dvh",background:C.bg}}>

        {/* Header */}
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"11px 16px",position:"sticky",top:0,zIndex:20}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <button onClick={()=>setScreen("login")} style={{background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,padding:"7px 11px",cursor:"pointer",fontSize:12}}>←</button>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{branchName}</div>
              <div className="mono" style={{fontSize:10,color:C.muted}}>{branch} · {date} · <span style={{color:C.green}}>✦ auto-saved</span></div>
            </div>
            <button onClick={()=>setScreen("dashboard")} style={{background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,padding:"7px 11px",cursor:"pointer",fontSize:12}}>📊</button>
          </div>
          <div style={{display:"flex",gap:6}}>
            {[{id:"stock",l:"📦 Stock"},{id:"engagement",l:"👥 Engagement"}].map((t)=>(
              <button key={t.id} onClick={()=>setMainTab(t.id)}
                style={{flex:1,padding:"9px 0",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:mainTab===t.id?"linear-gradient(135deg,#0ea5e9,#6366f1)":C.bg,color:mainTab===t.id?"#fff":C.muted,transition:"all .18s"}}>
                {t.l}
              </button>
            ))}
          </div>
        </div>

        {/* ══ STOCK ══ */}
        {mainTab==="stock" && <>
          <div style={{display:"flex",background:"#0a0f1e",borderBottom:`1px solid ${C.border}`}}>
            {[
              {id:"opening", l:"🌅 Opening", count:filledOpen,  c:C.green},
              {id:"replenishment", l:"🔄 Replenish", count:replenLogs.length, c:C.blue},
              {id:"closing", l:"🌙 Closing", count:filledClose, c:C.purple},
            ].map((p)=>(
              <button key={p.id} onClick={()=>setStockPhase(p.id)}
                style={{flex:1,padding:"11px 4px",border:"none",borderBottom:stockPhase===p.id?`2px solid ${p.c}`:"2px solid transparent",background:"transparent",cursor:"pointer",fontSize:11,fontWeight:600,color:stockPhase===p.id?p.c:C.muted,transition:"all .18s"}}>
                {p.l}
                {p.count>0&&<span className="mono" style={{marginLeft:4,fontSize:9,background:p.c+"20",color:p.c,padding:"1px 5px",borderRadius:8}}>{p.count}</span>}
              </button>
            ))}
          </div>

          <div style={{padding:"14px 16px 120px"}}>

            {/* ── OPENING ── */}
            {stockPhase==="opening" && <>
              {/* Lock banner */}
              {openingLocked && (
                <div style={{background:"#052e16",border:`1px solid ${C.green}30`,borderRadius:12,padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:13,color:C.green,flex:1}}>✅ Opening Stock ถูกล็อคแล้ว ({filledOpen} รายการ)</span>
                  <button onClick={()=>setOpeningLocked(false)}
                    style={{background:"transparent",border:`1px solid ${C.green}40`,borderRadius:8,color:C.green,padding:"5px 12px",fontSize:12,cursor:"pointer"}}>
                    แก้ไข
                  </button>
                </div>
              )}

              {!openingLocked && (
                <>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontSize:12,color:C.muted}}>กรอก Opening Stock เช้าวันนี้</span>
                    <span className="mono" style={{fontSize:12,color:filledOpen>0?C.green:C.muted}}>{filledOpen}/{products.length}</span>
                  </div>
                  <div style={{height:3,background:C.faint,borderRadius:2,overflow:"hidden",marginBottom:12}}>
                    <div style={{height:"100%",width:`${products.length>0?(filledOpen/products.length)*100:0}%`,background:`linear-gradient(90deg,${C.green},${C.blue})`,transition:"width .3s"}}/>
                  </div>
                  <input value={stockSearch} onChange={(e)=>setStockSearch(e.target.value)} placeholder="🔍 ค้นหา..."
                    style={{width:"100%",padding:"10px 14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:"#fff",fontSize:13,marginBottom:10}}/>
                </>
              )}

              {!openingLocked && filteredStock.map((row)=>(
                <div key={row.code} style={{background:C.surface,border:`1px solid ${row.opening!==""?C.green+"30":C.border}`,borderRadius:11,padding:"11px 13px",display:"flex",alignItems:"center",gap:10,marginBottom:7,transition:"border-color .2s"}}>
                  <Tag color={C.green} bg={C.greenBg}>{row.code}</Tag>
                  <span style={{flex:1,fontSize:12,color:"#64748b"}}>{row.name}</span>
                  <div style={{width:80}}><Num value={row.opening} accent={C.green} onChange={(v)=>updateStock(row.code,"opening",v)}/></div>
                  {row.opening!==""&&<span style={{fontSize:10,color:C.green}}>✓</span>}
                </div>
              ))}

              {/* Confirm Opening button */}
              {!openingLocked && filledOpen>0 && (
                <div style={{marginTop:16}}>
                  <Btn onClick={()=>{setOpeningLocked(true);handleSaveStock();}}
                    bg={`linear-gradient(135deg,${C.green},${C.blue})`} style={{width:"100%",boxShadow:`0 0 24px ${C.green}30`}}>
                    ✅ ยืนยัน Opening Stock ({filledOpen} รายการ)
                  </Btn>
                </div>
              )}
            </>}

            {/* ── REPLENISHMENT ── */}
            {stockPhase==="replenishment" && <>
              <ReplenForm products={products} onAdd={addReplen}/>
              {replenLogs.length>0&&<>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.8,marginBottom:8,marginTop:16}}>
                  ประวัติการเติม ({replenLogs.length} รายการ)
                </div>
                {replenLogs.map((log)=>(
                  <ReplenCard key={log.id} log={log} onEdit={editReplen} onDelete={deleteReplen}/>
                ))}
              </>}
            </>}

            {/* ── CLOSING ── */}
            {stockPhase==="closing" && <>
              {!closingOpen ? (
                <div style={{textAlign:"center",padding:"40px 20px"}}>
                  <div style={{fontSize:36,marginBottom:16}}>🌙</div>
                  <div style={{fontSize:14,color:C.muted,marginBottom:24}}>กด "เริ่มปิดงาน" เมื่อพร้อมกรอก Closing Stock</div>
                  <Btn onClick={()=>setClosingOpen(true)} bg={`linear-gradient(135deg,${C.purple},${C.indigo})`} style={{padding:"14px 32px"}}>
                    เริ่มปิดงาน
                  </Btn>
                </div>
              ) : (
                <>
                  <div style={{fontSize:12,color:C.muted,marginBottom:12}}>กรอก Sale Return + Closing Stock · {filledClose}/{products.length}</div>
                  {stockRows.map((p)=>{
                    const rTotal = replenLogs.filter((l)=>l.productCode===p.code).reduce((a,l)=>a+l.qty,0);
                    return (
                      <div key={p.code} style={{background:C.surface,border:`1px solid ${p.closing!==""?C.purple+"30":C.border}`,borderRadius:12,padding:13,marginBottom:8,transition:"border-color .2s"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                          <Tag color={C.purple} bg={C.purpleBg}>{p.code}</Tag>
                          <span style={{flex:1,fontSize:12,color:"#64748b"}}>{p.name}</span>
                          {p.opening!==""&&<span className="mono" style={{fontSize:10,color:C.muted}}>Open {p.opening}{rTotal>0?` +${rTotal}`:""}</span>}
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          <div>
                            <div style={{fontSize:9,color:C.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:.5}}>Sale Return</div>
                            <Num value={p.saleReturn} accent={C.yellow} onChange={(v)=>updateStock(p.code,"saleReturn",v)}/>
                          </div>
                          <div>
                            <div style={{fontSize:9,color:C.purple,marginBottom:4,textTransform:"uppercase",letterSpacing:.5,fontWeight:700}}>Closing Stock ★</div>
                            <Num value={p.closing} accent={C.purple} onChange={(v)=>updateStock(p.code,"closing",v)}/>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>}
          </div>

          {/* Stock FAB */}
          <div style={{position:"fixed",bottom:0,left:0,right:0,padding:"12px 16px 20px",background:`linear-gradient(to top,${C.bg} 70%,transparent)`,zIndex:10}}>
            <StatusMsg status={stockStatus} okMsg="บันทึก Stock ลง Google Sheets แล้ว"/>
            <Btn onClick={handleSaveStock} disabled={stockSaving||filledOpen===0}
              bg="linear-gradient(135deg,#059669,#0ea5e9)" style={{width:"100%",boxShadow:`0 0 24px #05966930`}}>
              {stockSaving?<span className="spin">⟳</span>:"💾 บันทึก Stock (upsert)"}
            </Btn>
          </div>
        </>}

        {/* ══ ENGAGEMENT ══ */}
        {mainTab==="engagement" && <>
          <div style={{background:"#0a0f1e",borderBottom:`1px solid ${C.border}`,padding:"12px 16px",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4}}>
            {[["Approach",engSum.ap,C.yellow],["Engage",engSum.en,C.blue],["Convert",engSum.cv,C.green],[`${engSum.rate}%`,"Conv%",C.purple]].map(([v,l,c])=>(
              <div key={l} style={{textAlign:"center"}}>
                <div className="mono" style={{fontSize:20,fontWeight:700,color:c}}>{v}</div>
                <div style={{fontSize:9,color:C.muted,textTransform:"uppercase"}}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{padding:"14px 16px 130px"}}>
            {showForm&&(
              <div className="fade-up" style={{background:C.surface,border:`1px solid ${C.indigo}40`,borderRadius:15,padding:16,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:700,color:"#fff",marginBottom:12}}>{editingId?"✏️ แก้ไข":"➕ บันทึก Interaction ใหม่"}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
                  {[["approach","Approach",C.yellow],["engagement","Engage",C.blue],["convert","Convert",C.green]].map(([k,l,c])=>(
                    <div key={k}>
                      <div style={{fontSize:9,color:C.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:.5}}>{l}</div>
                      <Num value={engForm[k]} accent={c} onChange={(v)=>setEngForm((f)=>({...f,[k]:v}))}/>
                    </div>
                  ))}
                </div>
                <input value={engForm.products} onChange={(e)=>setEngForm((f)=>({...f,products:e.target.value}))}
                  placeholder="🏷 Product ที่ขายได้ เช่น 2537770, 2538033"
                  style={{width:"100%",padding:"10px 12px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,color:"#fff",fontSize:13,marginBottom:8}}/>
                <textarea value={engForm.note} onChange={(e)=>setEngForm((f)=>({...f,note:e.target.value}))}
                  placeholder="📝 หมายเหตุ..." rows={2}
                  style={{width:"100%",padding:"10px 12px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,color:"#fff",fontSize:13,resize:"none",marginBottom:12}}/>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{setShowForm(false);setEditingId(null);setEngForm(blankEng());}}
                    style={{flex:1,padding:11,background:"transparent",border:`1px solid ${C.border}`,borderRadius:9,color:C.muted,fontSize:13,cursor:"pointer"}}>ยกเลิก</button>
                  <button onClick={saveEng}
                    style={{flex:2,padding:11,background:`linear-gradient(135deg,${C.indigo},${C.purple})`,border:"none",borderRadius:9,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    {editingId?"บันทึกการแก้ไข ✓":"บันทึก"}
                  </button>
                </div>
              </div>
            )}

            {!showForm&&(
              <button onClick={()=>{setEngForm(blankEng());setEditingId(null);setShowForm(true);}}
                style={{width:"100%",padding:13,background:C.surface,border:`1.5px dashed ${C.indigo}50`,borderRadius:12,color:C.indigo,fontSize:13,fontWeight:600,cursor:"pointer",marginBottom:14}}>
                ➕ บันทึก Interaction ใหม่
              </button>
            )}

            {engLog.length===0?(
              <div style={{textAlign:"center",padding:"48px 20px",color:C.faint}}>
                <div style={{fontSize:36}}>👥</div>
                <div style={{marginTop:10,fontSize:13}}>ยังไม่มี interaction วันนี้</div>
              </div>
            ):(
              engLog.map((e,i)=>(
                <div key={e.id} className="fade-up" style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:13,padding:14,marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",marginBottom:10}}>
                    <span className="mono" style={{fontSize:10,color:C.muted}}>#{i+1} · {e.time}</span>
                    <div style={{marginLeft:"auto",display:"flex",gap:6}}>
                      <button onClick={()=>{setEngForm({...e});setEditingId(e.id);setShowForm(true);}}
                        style={{background:C.elevated,border:"none",borderRadius:6,color:"#94a3b8",padding:"4px 10px",fontSize:11,cursor:"pointer"}}>✏️ แก้ไข</button>
                      <button onClick={()=>setEngLog((l)=>l.filter((x)=>x.id!==e.id))}
                        style={{background:C.elevated,border:"none",borderRadius:6,color:C.red,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>🗑</button>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:(e.products||e.note)?10:0}}>
                    {[["Approach",e.approach,C.yellow],["Engage",e.engagement,C.blue],["Convert",e.convert,C.green]].map(([l,v,c])=>(
                      <div key={l} style={{textAlign:"center",background:C.bg,borderRadius:9,padding:"10px 4px"}}>
                        <div className="mono" style={{fontSize:22,fontWeight:700,color:c}}>{v||"0"}</div>
                        <div style={{fontSize:9,color:C.muted,textTransform:"uppercase"}}>{l}</div>
                      </div>
                    ))}
                  </div>
                  {e.products&&<div style={{fontSize:11,color:C.muted,marginBottom:3}}>🏷 {e.products}</div>}
                  {e.note&&<div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>📝 {e.note}</div>}
                </div>
              ))
            )}
          </div>

          <div style={{position:"fixed",bottom:0,left:0,right:0,padding:"12px 16px 20px",background:`linear-gradient(to top,${C.bg} 70%,transparent)`,zIndex:10}}>
            <StatusMsg status={engStatus} okMsg="บันทึก Engagement ลง Google Sheets แล้ว"/>
            <Btn onClick={handleSaveEng} disabled={engSaving||engLog.length===0}
              bg="linear-gradient(135deg,#7c3aed,#6366f1)" style={{width:"100%",boxShadow:`0 0 24px #6366f128`}}>
              {engSaving?<span className="spin">⟳</span>:`💾 บันทึก Engagement (${engLog.length} interactions)`}
            </Btn>
          </div>
        </>}
      </div>
    </>
  );
}

// ─── ReplenForm Component ─────────────────────────────
function ReplenForm({ products, onAdd }) {
  const [search, setSearch] = useState("");
  const [code, setCode] = useState("");
  const [qty, setQty] = useState("");
  const filtered = products.filter((p)=>p.name.toLowerCase().includes(search.toLowerCase())||p.code.includes(search));
  const C = { bg:"#07090f", surface:"#0f172a", border:"#1e293b", blue:"#0ea5e9", blueBg:"#0c1a2e", muted:"#64748b", faint:"#1e293b" };
  return (
    <div style={{background:C.surface,border:`1px solid ${C.blue}40`,borderRadius:13,padding:14,marginBottom:6}}>
      <div style={{fontSize:12,fontWeight:600,color:C.blue,marginBottom:10}}>➕ เพิ่ม Stock ระหว่างวัน</div>
      <input value={search} onChange={(e)=>{setSearch(e.target.value);setCode("");}}
        placeholder="🔍 ค้นหา product..."
        style={{width:"100%",padding:"10px 12px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,color:"#fff",fontSize:13,marginBottom:6}}/>
      {search&&!code&&filtered.length>0&&(
        <div style={{maxHeight:150,overflowY:"auto",marginBottom:8,borderRadius:8,border:`1px solid ${C.border}`,background:C.bg}}>
          {filtered.slice(0,8).map((p)=>(
            <div key={p.code} onClick={()=>{setCode(p.code);setSearch(p.name);}}
              style={{padding:"9px 12px",cursor:"pointer",display:"flex",gap:8,alignItems:"center",borderBottom:`1px solid ${C.faint}`}}>
              <span className="mono" style={{fontSize:10,color:C.blue,background:C.blueBg,padding:"2px 7px",borderRadius:4,fontWeight:600}}>{p.code}</span>
              <span style={{fontSize:12,color:"#94a3b8"}}>{p.name}</span>
            </div>
          ))}
        </div>
      )}
      {code&&<div style={{padding:"7px 12px",background:C.blueBg,borderRadius:8,marginBottom:8,fontSize:12,color:C.blue}}>✓ {search}</div>}
      <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
        <div style={{flex:1}}>
          <div style={{fontSize:9,color:C.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:.5}}>จำนวนที่เติม</div>
          <input type="number" inputMode="numeric" placeholder="0" value={qty} onChange={(e)=>setQty(e.target.value)}
            style={{width:"100%",padding:"11px 8px",background:"#0a0f1e",border:`1.5px solid ${qty!==""?C.blue+"90":C.border}`,borderRadius:10,color:"#fff",fontSize:16,fontFamily:"'JetBrains Mono',monospace",textAlign:"center"}}/>
        </div>
        <button onClick={()=>{if(!code||!qty)return;onAdd(code,qty);setCode("");setQty("");setSearch("");}}
          disabled={!code||!qty}
          style={{padding:"11px 20px",background:code&&qty?C.blue:C.faint,border:"none",borderRadius:10,color:code&&qty?"#fff":"#334155",fontSize:13,fontWeight:700,cursor:code&&qty?"pointer":"not-allowed"}}>
          + เพิ่ม
        </button>
      </div>
    </div>
  );
}

// ─── ReplenCard Component (แก้ไข/ลบได้) ──────────────
function ReplenCard({ log, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(log.qty));
  const C = { surface:"#0f172a", border:"#1e293b", blue:"#0ea5e9", blueBg:"#0c1a2e", muted:"#64748b", red:"#ef4444", elevated:"#141d2e" };
  return (
    <div style={{background:C.surface,border:`1px solid ${C.blue}20`,borderRadius:10,padding:"10px 13px",marginBottom:6}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span className="mono" style={{fontSize:10,color:C.muted}}>{log.time}</span>
        <span className="mono" style={{fontSize:10,color:C.blue,background:C.blueBg,padding:"2px 7px",borderRadius:4,fontWeight:600}}>{log.productCode}</span>
        <span style={{flex:1,fontSize:12,color:"#64748b"}}>{log.productName}</span>
        {!editing&&<span className="mono" style={{fontSize:15,color:C.blue,fontWeight:700}}>+{log.qty}</span>}
        {!editing&&(
          <div style={{display:"flex",gap:4}}>
            <button onClick={()=>setEditing(true)} style={{background:C.elevated,border:"none",borderRadius:6,color:"#94a3b8",padding:"4px 8px",fontSize:11,cursor:"pointer"}}>✏️</button>
            <button onClick={()=>onDelete(log.id)} style={{background:C.elevated,border:"none",borderRadius:6,color:C.red,padding:"4px 8px",fontSize:11,cursor:"pointer"}}>🗑</button>
          </div>
        )}
      </div>
      {editing&&(
        <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}>
          <input type="number" inputMode="numeric" value={qty} onChange={(e)=>setQty(e.target.value)}
            style={{flex:1,padding:"9px 8px",background:"#0a0f1e",border:`1.5px solid ${C.blue}90`,borderRadius:9,color:"#fff",fontSize:15,fontFamily:"'JetBrains Mono',monospace",textAlign:"center"}}/>
          <button onClick={()=>{onEdit(log.id,qty);setEditing(false);}}
            style={{padding:"9px 14px",background:C.blue,border:"none",borderRadius:9,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>บันทึก</button>
          <button onClick={()=>{setQty(String(log.qty));setEditing(false);}}
            style={{padding:"9px 14px",background:C.elevated,border:"none",borderRadius:9,color:C.muted,fontSize:13,cursor:"pointer"}}>ยกเลิก</button>
        </div>
      )}
    </div>
  );
}