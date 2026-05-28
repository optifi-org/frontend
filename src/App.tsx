import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Zap, Activity, Wifi, Battery, ChevronRight, ChevronDown, ChevronUp,
  Route, ShieldCheck, Radio, Globe2, Cpu, Clock
} from "lucide-react";
import {
  LineChart, Line, AreaChart, Area, ResponsiveContainer,
  XAxis, YAxis, Tooltip, ReferenceDot, CartesianGrid
} from "recharts";
import { motion, useSpring, useTransform, AnimatePresence } from "framer-motion";
import "./App.css";

interface TelemetryData {
  bytes: number;
  usec: number;
}

interface BridgeStats {
  tx: number;
  rx: number;
  credits: number;
}

type Preset = "PERFORMANCE" | "BALANCED" | "BATTERY";

interface Toast {
  id: number;
  message: string;
  type: "info" | "success" | "warning";
}

const SHORTCUT_KEYS: Record<string, Preset> = { "1": "PERFORMANCE", "2": "BALANCED", "3": "BATTERY" };

/* ── helpers ───────────────────────────────────────────── */
function formatVal(v: number, unit: string): { display: string; color: string } {
  if (unit === "μs") {
    if (v >= 1000) return { display: `${(v / 1000).toFixed(1)} ms`, color: v > 5000 ? "text-cyber-alert" : "text-amber-400" };
    return { display: `${v.toFixed(0)} μs`, color: v < 200 ? "text-cyber-emerald" : "text-white" };
  }
  if (unit === "TX" || unit === "RX") {
    if (v >= 1_048_576) return { display: `${(v / 1_048_576).toFixed(1)} MB`, color: "text-cyber-violet" };
    if (v >= 1024) return { display: `${(v / 1024).toFixed(1)} KB`, color: "text-white" };
    return { display: `${v.toFixed(0)} B`, color: v > 0 ? "text-cyber-400" : "text-cyber-600" };
  }
  return { display: `${v.toFixed(0)} ${unit}`, color: "text-white" };
}

/* ── sub-components ────────────────────────────────────── */

function AnimatedNumber({ value }: { value: number }) {
  const spring = useSpring(value, { mass: 0.5, stiffness: 100, damping: 20 });
  useEffect(() => { spring.set(value); }, [value, spring]);
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString());
  return <motion.span>{display}</motion.span>;
}

function RealtimeClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-1.5 text-xs text-cyber-400 font-mono">
      <Clock size={12} />
      <span>{now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
      <span className="text-cyber-500">|</span>
      <span>{now.toLocaleTimeString("en-US", { hour12: false })}</span>
    </div>
  );
}

function UptimeCounter({ connectedAt }: { connectedAt: number | null }) {
  const [elapsed, setElapsed] = useState("00:00:00");
  useEffect(() => {
    if (!connectedAt) { setElapsed("00:00:00"); return; }
    const id = setInterval(() => {
      const diff = Math.floor((Date.now() - connectedAt) / 1000);
      const h = String(Math.floor(diff / 3600)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
      const s = String(diff % 60).padStart(2, "0");
      setElapsed(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(id);
  }, [connectedAt]);
  return (
    <span className="text-[10px] font-mono text-cyber-500 tabular-nums">
      ▲ {elapsed}
    </span>
  );
}

function ConnectionScreen() {
  return (
    <motion.div
      key="conn-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: "blur(12px)" }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-cyber-950"
    >
      <div className="grid-bg absolute inset-0 opacity-30" />
      <div className="relative">
        {/* radar sweep */}
        <div className="radar-sweep w-48 h-48 rounded-full border border-cyber-neon/20 flex items-center justify-center">
          <div className="w-32 h-32 rounded-full border border-cyber-neon/10 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full border border-cyber-neon/30 flex items-center justify-center">
              <Radio size={24} className="text-cyber-neon animate-pulse" />
            </div>
          </div>
        </div>
        {/* animated dots */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <motion.div
            key={i}
            className="absolute w-1.5 h-1.5 bg-cyber-neon/60 rounded-full"
            style={{
              top: `${50 + 42 * Math.sin((i * Math.PI * 2) / 6)}%`,
              left: `${50 + 42 * Math.cos((i * Math.PI * 2) / 6)}%`,
            }}
            animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
          />
        ))}
      </div>
      <motion.p
        className="mt-8 text-sm text-cyber-400 tracking-widest uppercase"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        Searching for Engine…
      </motion.p>
    </motion.div>
  );
}

function ArcGauge({ value, max = 32 }: { value: number; max?: number }) {
  const pct = Math.min(value / max, 1);
  const r = 40, cx = 50, cy = 50;
  const startAngle = 135, endAngle = 405;
  const sweep = endAngle - startAngle;
  const activeAngle = startAngle + sweep * pct;

  const polarToCart = (a: number) => ({
    x: cx + r * Math.cos((a * Math.PI) / 180),
    y: cy + r * Math.sin((a * Math.PI) / 180),
  });

  const bgStart = polarToCart(startAngle);
  const bgEnd = polarToCart(endAngle);
  const arcStart = polarToCart(startAngle);
  const arcEnd = polarToCart(activeAngle);

  const bgD = `M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 1 1 ${bgEnd.x} ${bgEnd.y}`;
  const arcD = `M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 ${sweep * pct > 180 ? 1 : 0} 1 ${arcEnd.x} ${arcEnd.y}`;

  const color = pct > 0.6 ? "#22d3ee" : pct > 0.25 ? "#fbbf24" : "#f87171";
  const isCritical = value < 5;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 100" className={`w-28 h-28 ${isCritical ? "critical-pulse" : ""}`}>
        <path d={bgD} fill="none" stroke="#1e293b" strokeWidth="6" strokeLinecap="round" />
        <motion.path
          d={arcD}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        <text x={cx} y={cy - 2} textAnchor="middle" fill="white" fontSize="18" fontWeight="bold" fontFamily="var(--font-mono)">
          {value}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#6b7280" fontSize="8">
          / {max}
        </text>
      </svg>
    </div>
  );
}

function MiniSparkline({ data, color = "#22d3ee" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-8 w-full mt-1 opacity-60">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color.replace("#", "")})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const borderColor = toast.type === "success" ? "border-cyber-emerald/60" : toast.type === "warning" ? "border-amber-500/60" : "border-cyber-neon/60";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.9 }}
      className={`px-4 py-2.5 rounded-lg bg-cyber-900/90 backdrop-blur border text-xs text-cyber-300 font-mono shadow-lg ${borderColor}`}
    >
      {toast.message}
    </motion.div>
  );
}

function App() {
  const [telemetry, setTelemetry] = useState<any[]>([]);
  const [wifiList, setWifiList] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentPreset, setCurrentPreset] = useState<Preset>("BALANCED");
  const [stats, setStats] = useState({ latency: 0, pps: 0 });
  const [bridgeStats, setBridgeStats] = useState<BridgeStats>({ tx: 0, rx: 0, credits: 0 });
  const [showEventLog, setShowEventLog] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(0);
  const connectedAt = useRef<number | null>(null);

  const buffer = useRef({ totalLatency: 0, totalBytes: 0, count: 0 });
  const ppsHistory = useRef<number[]>(Array(20).fill(0));
  const unlistenRegistry = useRef<Array<() => void>>([]);
  const sparklines = useRef({ tx: [] as number[], rx: [] as number[], latency: [] as number[], pps: [] as number[] });

  /* toast helpers */
  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = nextToastId.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 50));
  }, []);

  /* preset */
  const changePreset = useCallback(async (p: Preset) => {
    try {
      await invoke("set_preset", { preset: p });
      setCurrentPreset(p);
      addLog(`PRESET: Changed to ${p}`);
      addToast(`Preset: ${p}`, "success");
    } catch (err) { addLog("ERROR: Failed to set preset"); }
  }, [addLog, addToast]);

  /* engine IPC */
  useEffect(() => {
    const connInterval = setInterval(async () => {
      try {
        const status = await invoke<boolean>("get_connection_status");
        if (status !== isConnected) {
          setIsConnected(status);
          addLog(status ? "SYSTEM: IPC Link Established" : "SYSTEM: IPC Link Lost");
          addToast(status ? "Engine connected" : "Engine disconnected", status ? "success" : "warning");
          connectedAt.current = status ? Date.now() : null;
        }
      } catch (err) { setIsConnected(false); }
    }, 2000);

    const setupListeners = async () => {
      try {
        const u1 = await listen<TelemetryData>("telemetry-event", (event) => {
          buffer.current.totalLatency += event.payload.usec;
          buffer.current.totalBytes += event.payload.bytes;
          buffer.current.count += 1;
        });
        unlistenRegistry.current.push(u1);

        const u2 = await listen<string[]>("wifi-list-event", (event) => {
          setWifiList(event.payload);
          setIsScanning(false);
          addLog(`WIFI: Scan complete, found ${event.payload.length} networks`);
          addToast(`Found ${event.payload.length} networks`, "success");
        });
        unlistenRegistry.current.push(u2);

        const u3 = await listen<BridgeStats>("bridge-stats-event", (event) => {
          setBridgeStats(event.payload);
        });
        unlistenRegistry.current.push(u3);
      } catch (err) {
        addLog("ERROR: Failed to setup Tauri events");
      }
    };
    setupListeners();

    // UI Sync Loop (20Hz)
    const uiInterval = setInterval(() => {
      const { totalLatency, count } = buffer.current;
      const avgLat = count > 0 ? Math.round(totalLatency / count) : 0;

      ppsHistory.current.push(count);
      if (ppsHistory.current.length > 20) ppsHistory.current.shift();
      const rollingPps = ppsHistory.current.reduce((a, b) => a + b, 0);

      setStats({ latency: avgLat, pps: rollingPps });
      setTelemetry(prev => [...prev, { val: avgLat === 0 && prev.length > 0 ? prev[prev.length-1].val : avgLat }].slice(-100));

      // sparkline buffers
      const push = (arr: number[], v: number) => { arr.push(v); if (arr.length > 20) arr.shift(); };
      push(sparklines.current.latency, avgLat);
      push(sparklines.current.pps, rollingPps);
      push(sparklines.current.tx, bridgeStats.tx);
      push(sparklines.current.rx, bridgeStats.rx);

      buffer.current = { totalLatency: 0, totalBytes: 0, count: 0 };
    }, 50);

    return () => {
      clearInterval(connInterval);
      clearInterval(uiInterval);
      unlistenRegistry.current.forEach(fn => fn());
      unlistenRegistry.current = [];
    };
  }, []);

  /* keyboard shortcuts */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (SHORTCUT_KEYS[e.key]) {
        changePreset(SHORTCUT_KEYS[e.key]);
      }
      if (e.key === "l" || e.key === "L") {
        setShowEventLog(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [changePreset]);

  const triggerScan = useCallback(async () => {
    setIsScanning(true);
    setWifiList([]);
    try {
      await invoke("scan_wifi");
      addLog("WIFI: Requesting airspace scan...");
    } catch (err) {
      setIsScanning(false);
      addLog("ERROR: WiFi scan failed");
    }
  }, [addLog]);

  /* derived */
  const peakLatency = telemetry.length > 0 ? Math.max(...telemetry.map((d: any) => d.val)) : 0;
  const peakIdx = telemetry.length > 1 ? telemetry.reduce((maxI: number, d: any, i: number, arr: any[]) => d.val > arr[maxI].val ? i : maxI, 0) : -1;
  const avgLatency = telemetry.length > 0 ? Math.round(telemetry.reduce((s: number, d: any) => s + d.val, 0) / telemetry.length) : 0;
  const minLatency = telemetry.length > 0 ? Math.min(...telemetry.map((d: any) => d.val)) : 0;

  return (
    <div className="min-h-screen bg-cyber-950 text-white font-sans select-none flex flex-col overflow-hidden relative">
      <div className="grid-bg fixed inset-0 pointer-events-none" />
      <div className="dot-pattern fixed inset-0 pointer-events-none" />
      <div className="scanline fixed inset-0 pointer-events-none" />

      {/* connection screen */}
      <AnimatePresence>
        {!isConnected && <ConnectionScreen />}
      </AnimatePresence>

      {/* toast container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end">
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
          ))}
        </AnimatePresence>
      </div>

      {/* HEADER */}
      <div className="relative z-10 flex justify-between items-center mb-6 border-b border-white/10 pb-4 px-6 pt-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <motion.div animate={{ opacity: isConnected ? [0.5, 1, 0.5] : 1 }} transition={{ repeat: Infinity, duration: 2 }}>
                <Zap className={isConnected ? "text-cyan-400" : "text-red-500"} size={28} />
            </motion.div>
            <h1 className="text-2xl font-black italic tracking-tighter uppercase">OptiFi <span className="text-cyan-400">Core</span></h1>
          </div>
          <div className="flex gap-2">
            <Badge label="ENGINE" active={isConnected} />
            <Badge label="BRIDGE" active={isConnected && (bridgeStats.tx > 0 || bridgeStats.rx > 0)} />
            <Badge label="NAT" active={isConnected && bridgeStats.rx > 0} />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <RealtimeClock />
          <UptimeCounter connectedAt={connectedAt.current} />
          <div className="text-right">
            <p className={`text-[10px] uppercase tracking-widest font-bold ${isConnected ? "text-emerald-400" : "text-red-500"}`}>
              {isConnected ? "Engine Link Active" : "Searching for Engine..."}
            </p>
            <p className="text-xs font-bold text-cyan-400 opacity-60">optifi0 (10.137.137.1)</p>
          </div>
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-4 gap-6 flex-1 min-h-0 px-6 pb-6">
        {/* LEFT COLUMN */}
        <div className="col-span-3 flex flex-col gap-6 min-h-0">
          <div className="grid grid-cols-4 gap-4">
            <StatTile label="HOST TO ESP" value={bridgeStats.tx} unit="TX" color="text-cyan-400"
              sparkData={sparklines.current.tx} sparkColor="#22d3ee" glowClass="neon-glow" />
            <StatTile label="ESP TO HOST" value={bridgeStats.rx} unit="RX" color="text-emerald-400"
              sparkData={sparklines.current.rx} sparkColor="#34d399" glowClass="emerald-glow" />
            <StatTile label="USB CREDITS" value={bridgeStats.credits} unit="/32" color={bridgeStats.credits > 0 ? "text-emerald-400" : "text-red-400"} />
            <StatTile label="LATENCY" value={stats.latency} unit="μs" color="text-violet-300"
              sparkData={sparklines.current.latency} sparkColor="#a78bfa" glowClass="violet-glow" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <StatusPanel icon={<Route size={18} />} label="Internal Path" value="10.137.137.1 -> 10.137.137.2" active={isConnected} />
            <StatusPanel icon={<ShieldCheck size={18} />} label="NAT State" value={bridgeStats.rx > 0 ? "MASQUERADE ACTIVE" : "WAITING FOR TRAFFIC"} active={bridgeStats.rx > 0} />
            <StatusPanel icon={<Cpu size={18} />} label="Packet Freq" value={`${stats.pps} PPS`} active={stats.pps > 0} />
          </div>

          {/* CHART */}
          <motion.div className="bg-white/[0.02] border border-white/5 rounded-lg p-6 flex-1 flex flex-col min-h-0 relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 relative z-10">
              <h2 className="text-xs font-bold opacity-30 uppercase tracking-[0.2em]">Real-time Bridge Latency</h2>
              <div className="flex items-center gap-4">
                {telemetry.length > 0 && (
                  <>
                    <span className="text-[9px] font-mono text-cyber-emerald/60">MIN: {minLatency}μs</span>
                    <span className="text-[9px] font-mono text-cyber-400/60">AVG: {avgLatency}μs</span>
                    <span className="text-[9px] font-mono text-cyber-violet/60">PEAK: {peakLatency}μs</span>
                  </>
                )}
              </div>
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-1/2 bg-cyan-500/5 blur-[100px] pointer-events-none" />
            <div className="flex-1 min-h-[260px] relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetry}>
                    <defs>
                      <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" horizontal={true} vertical={false} />
                    <YAxis hide domain={[0, 'auto']} />
                    <Tooltip
                      contentStyle={{ background: "#111216", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-mono)" }}
                      formatter={(v: number) => [`${v} μs`, "Latency"]}
                    />
                    <Area type="monotone" dataKey="val" stroke="#22d3ee" strokeWidth={2.5} fill="url(#latencyGrad)" dot={false} isAnimationActive={false} />
                    {peakIdx >= 0 && telemetry[peakIdx]?.val > 0 && (
                      <ReferenceDot x={peakIdx} y={telemetry[peakIdx].val} r={4} fill="#a78bfa" stroke="#a78bfa" strokeWidth={2} />
                    )}
                </AreaChart>
                </ResponsiveContainer>
            </div>
          </motion.div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="col-span-1 flex flex-col gap-4 min-h-0">
          <h2 className="text-[10px] font-black opacity-30 uppercase tracking-[0.2em] mb-2">Driver Presets</h2>
          <PresetCard active={currentPreset === "PERFORMANCE"} onClick={() => changePreset("PERFORMANCE")} icon={<Zap size={16}/>} label="PERFORMANCE" desc="Zero lag / High Power" shortcut="1" />
          <PresetCard active={currentPreset === "BALANCED"} onClick={() => changePreset("BALANCED")} icon={<Activity size={16}/>} label="BALANCED" desc="Standard mode" shortcut="2" />
          <PresetCard active={currentPreset === "BATTERY"} onClick={() => changePreset("BATTERY")} icon={<Battery size={16}/>} label="BATTERY" desc="Power Efficient" shortcut="3" />

          {/* USB Credits Arc Gauge */}
          <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4 flex flex-col items-center">
            <div className="text-[10px] font-bold opacity-40 mb-2 tracking-widest uppercase">USB Credits</div>
            <ArcGauge value={bridgeStats.credits} />
          </div>

          {/* Event Log */}
          <div className="mt-2 flex flex-col gap-2">
            <button onClick={() => setShowEventLog(prev => !prev)} className="flex items-center gap-2 group cursor-pointer">
              <h2 className="text-[10px] font-black opacity-30 uppercase tracking-[0.2em] group-hover:opacity-60 transition-opacity">Event Log</h2>
              <span className="text-[8px] text-white/20 ml-auto font-mono border border-white/10 rounded px-1 py-0.5">L</span>
              {showEventLog ? <ChevronDown size={10} className="text-white/30" /> : <ChevronUp size={10} className="text-white/30" />}
            </button>
            <AnimatePresence>
              {showEventLog && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                  <div className="bg-black/40 border border-white/5 rounded-lg p-2 max-h-[180px] overflow-y-auto custom-scrollbar">
                    {logs.length === 0 ? (
                      <span className="text-[10px] opacity-30 italic p-2">No events yet</span>
                    ) : (
                      logs.map((log, i) => (
                        <div key={i} className={`text-[10px] font-mono py-1 px-2 flex items-start gap-2 ${i === 0 ? '' : 'border-t border-white/[0.03]'}`}>
                          <span className={`shrink-0 ${
                            log.includes("ERROR") ? "text-red-400" :
                            log.includes("SYSTEM") ? "text-cyan-400" :
                            log.includes("PRESET") ? "text-violet-400" :
                            log.includes("WIFI") ? "text-emerald-400" : "text-white/50"
                          }`}>{log}</span>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {!showEventLog && (
              <div className="bg-black/40 border border-white/5 rounded-lg p-3 flex items-center overflow-hidden relative">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={logs[0] || "waiting"}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.2 }}
                    className="font-mono text-[10px] flex items-center gap-3 w-full"
                  >
                    {logs.length === 0 ? (
                      <span className="opacity-30 italic">Waiting for events...</span>
                    ) : (
                      <>
                        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                        <span className={`truncate ${logs[0].includes("ERROR") ? "text-red-400" : logs[0].includes("SYSTEM") ? "text-cyan-400" : "text-white/80"}`}>
                          {logs[0]}
                        </span>
                        <span className="ml-auto opacity-20 text-[8px] shrink-0">
                          {new Date().toLocaleTimeString()}
                        </span>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Live Path Info */}
          <motion.div className="mt-auto p-4 bg-gradient-to-br from-white/[0.05] to-white/[0.01] border border-white/10 rounded-lg shadow-lg">
            <div className="flex items-center gap-2 mb-2 text-cyan-400">
              <Radio size={14} className="animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">Live Path</span>
            </div>
            <p className="text-[9px] text-white/50 leading-relaxed font-mono">
              TCP/UDP/ICMP traffic flowing through optifi0 &rarr; USB &rarr; ESP32 NAT &rarr; Internet.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, unit, color, sparkData, sparkColor, glowClass }: any) {
  const formatted = formatVal(value, unit);
  const thresholdColor = () => {
    if (unit === "μs") return value > 5000 ? "text-red-400" : value > 2000 ? "text-amber-400" : color;
    if ((unit === "TX" || unit === "RX") && value >= 1_048_576) return "text-cyber-violet";
    if ((unit === "TX" || unit === "RX") && value >= 1024) return "text-amber-400";
    return color;
  };
  return (
    <motion.div
      className={`bg-white/[0.02] border border-white/10 rounded-lg p-5 transition-all hover:bg-white/[0.04] hover:border-white/20 cursor-default group ${glowClass || ""}`}
      whileHover={{ scale: 1.02 }}
    >
      <div className="text-[10px] font-bold opacity-40 mb-2 tracking-widest uppercase">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black tracking-tight"><AnimatedNumber value={value} /></span>
        <span className={`text-xs font-bold ${thresholdColor()}`}>{formatted.display.split(" ").pop()}</span>
      </div>
      {sparkData && <MiniSparkline data={sparkData} color={sparkColor} />}
    </motion.div>
  );
}

function StatusPanel({ icon, label, value, active }: any) {
  return (
    <motion.div
      className={`border rounded-lg p-4 transition-all ${
        active
          ? "bg-emerald-500/5 border-emerald-500/20 emerald-glow"
          : "bg-white/[0.02] border-white/10 hover:bg-white/[0.04] hover:border-white/15"
      }`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={active ? "text-emerald-400" : "text-white/35"}>{icon}</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-white/45">{label}</span>
        {active && (
          <motion.span
            className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 ripple-pulse"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </div>
      <div className={`text-[11px] font-bold truncate ${active ? "text-white" : "text-white/60"}`}>{value}</div>
    </motion.div>
  );
}

function PresetCard({ active, onClick, icon, label, desc, shortcut }: any) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onClick}
      className={`p-4 rounded-lg border cursor-pointer transition-all relative ${
        active
          ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400 neon-glow"
          : "bg-white/[0.02] border-white/5 opacity-60 hover:opacity-100 hover:border-white/15"
      }`}
    >
      {active && (
        <motion.div
          layoutId="preset-indicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r bg-cyan-400"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
      <div className="flex items-center gap-3 mb-1">
        {icon}
        <span className="text-xs font-black tracking-tighter uppercase">{label}</span>
        {shortcut && (
          <span className={`ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded border ${
            active ? "border-cyan-500/30 text-cyan-400/60" : "border-white/10 text-white/25"
          }`}>{shortcut}</span>
        )}
      </div>
      <p className={`text-[9px] ${active ? "opacity-80" : "opacity-50"}`}>{desc}</p>
    </motion.div>
  );
}

function Badge({ label, active }: { label: string, active: boolean }) {
  return (
    <motion.div className={`px-3 py-1 rounded text-[9px] font-black border transition-all flex items-center gap-1.5 ${
      active ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400 neon-glow" : "bg-red-500/10 border-red-500/40 text-red-500"
    }`}>
      {active && (
        <motion.span className="w-1.5 h-1.5 rounded-full bg-cyan-400" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }} />
      )}
      {label}: {active ? "ONLINE" : "OFFLINE"}
    </motion.div>
  );
}

export default App;
