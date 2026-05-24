import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Zap, Activity, Wifi, Battery, ChevronRight, Route, ShieldCheck, Radio, Globe2, Cpu } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from "recharts";
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

function AnimatedNumber({ value }: { value: number }) {
  const spring = useSpring(value, { mass: 0.5, stiffness: 100, damping: 20 });
  useEffect(() => { spring.set(value); }, [value, spring]);
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString());
  return <motion.span>{display}</motion.span>;
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
  
  const buffer = useRef({ totalLatency: 0, totalBytes: 0, count: 0 });
  const ppsHistory = useRef<number[]>(Array(20).fill(0));
  const unlistenRegistry = useRef<Array<() => void>>([]);

  const addLog = (msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 50));
  };

  useEffect(() => {
    // 1. Connection check loop
    const connInterval = setInterval(async () => {
      try {
        const status = await invoke<boolean>("get_connection_status");
        if (status !== isConnected) {
          setIsConnected(status);
          addLog(status ? "SYSTEM: IPC Link Established" : "SYSTEM: IPC Link Lost");
        }
      } catch (err) { setIsConnected(false); }
    }, 2000);

    // 2. Setup Telemetry Listener
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

    // 3. UI Sync Loop (20Hz)
    const uiInterval = setInterval(() => {
      const { totalLatency, count } = buffer.current;
      const avgLat = count > 0 ? Math.round(totalLatency / count) : 0;
      
      ppsHistory.current.push(count);
      if (ppsHistory.current.length > 20) ppsHistory.current.shift();
      const rollingPps = ppsHistory.current.reduce((a, b) => a + b, 0);
      
      setStats({ latency: avgLat, pps: rollingPps });
      setTelemetry(prev => [...prev, { val: avgLat === 0 && prev.length > 0 ? prev[prev.length-1].val : avgLat }].slice(-100)); 
      
      buffer.current = { totalLatency: 0, totalBytes: 0, count: 0 };
    }, 50);

    return () => {
      clearInterval(connInterval);
      clearInterval(uiInterval);
      unlistenRegistry.current.forEach(fn => fn());
      unlistenRegistry.current = [];
    };
  }, []);

  const changePreset = async (p: Preset) => {
    try {
      await invoke("set_preset", { preset: p });
      setCurrentPreset(p);
      addLog(`PRESET: Changed to ${p}`);
    } catch (err) { addLog("ERROR: Failed to set preset"); }
  };

  const triggerScan = async () => {
    setIsScanning(true);
    setWifiList([]);
    try {
      await invoke("scan_wifi");
      addLog("WIFI: Requesting airspace scan...");
    } catch (err) { 
      setIsScanning(false);
      addLog("ERROR: WiFi scan failed");
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white font-mono p-6 select-none flex flex-col overflow-hidden">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
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
        <div className="text-right">
           <p className={`text-[10px] uppercase tracking-widest font-bold ${isConnected ? "text-emerald-400" : "text-red-500"}`}>
             {isConnected ? "Engine Link Active" : "Searching for Engine..."}
           </p>
           <p className="text-xs font-bold text-cyan-400 opacity-60">optifi0 (10.137.137.1)</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6 flex-1 min-h-0">
        {/* LEFT COLUMN */}
        <div className="col-span-3 flex flex-col gap-6 min-h-0">
          <div className="grid grid-cols-4 gap-4">
            <StatTile label="HOST TO ESP" value={bridgeStats.tx} unit="TX" color="text-cyan-400" />
            <StatTile label="ESP TO HOST" value={bridgeStats.rx} unit="RX" color="text-emerald-400" />
            <StatTile label="USB CREDITS" value={bridgeStats.credits} unit="/32" color={bridgeStats.credits > 0 ? "text-emerald-400" : "text-red-400"} />
            <StatTile label="LATENCY" value={stats.latency} unit="μs" color="text-violet-300" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <StatusPanel icon={<Route size={18} />} label="Internal Path" value="10.137.137.1 -> 10.137.137.2" active={isConnected} />
            <StatusPanel icon={<ShieldCheck size={18} />} label="NAT State" value={bridgeStats.rx > 0 ? "MASQUERADE ACTIVE" : "WAITING FOR TRAFFIC"} active={bridgeStats.rx > 0} />
            <StatusPanel icon={<Cpu size={18} />} label="Packet Freq" value={`${stats.pps} PPS`} active={stats.pps > 0} />
          </div>

          <motion.div className="bg-white/[0.02] border border-white/5 rounded-lg p-6 flex-1 flex flex-col min-h-0 relative overflow-hidden">
            <h2 className="text-xs font-bold opacity-30 mb-6 uppercase tracking-[0.2em] relative z-10">Real-time Bridge Latency</h2>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-1/2 bg-cyan-500/5 blur-[100px] pointer-events-none" />
            <div className="flex-1 min-h-[260px] relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                <LineChart data={telemetry}>
                    <YAxis hide domain={[0, 'auto']} />
                    <Tooltip contentStyle={{ background: "#111216", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                    <Line type="monotone" dataKey="val" stroke="#22d3ee" strokeWidth={3} dot={false} isAnimationActive={false} />
                </LineChart>
                </ResponsiveContainer>
            </div>
          </motion.div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="col-span-1 flex flex-col gap-4 min-h-0">
          <h2 className="text-[10px] font-black opacity-30 uppercase tracking-[0.2em] mb-2">Driver Presets</h2>
          <PresetCard active={currentPreset === "PERFORMANCE"} onClick={() => changePreset("PERFORMANCE")} icon={<Zap size={16}/>} label="PERFORMANCE" desc="Zero lag / High Power" />
          <PresetCard active={currentPreset === "BALANCED"} onClick={() => changePreset("BALANCED")} icon={<Activity size={16}/>} label="BALANCED" desc="Standard mode" />
          <PresetCard active={currentPreset === "BATTERY"} onClick={() => changePreset("BATTERY")} icon={<Battery size={16}/>} label="BATTERY" desc="Power Efficient" />
          
          <div className="mt-2 flex flex-col gap-2">
            <h2 className="text-[10px] font-black opacity-30 uppercase tracking-[0.2em]">System Status</h2>
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
          </div>

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

function StatTile({ label, value, unit, color }: any) {
  return (
    <motion.div className="bg-white/[0.02] border border-white/10 rounded-lg p-5 transition-all shadow-sm">
      <div className="text-[10px] font-bold opacity-40 mb-3 tracking-widest uppercase">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black tracking-tight"><AnimatedNumber value={value} /></span>
        <span className={`text-xs font-bold ${color}`}>{unit}</span>
      </div>
    </motion.div>
  );
}

function StatusPanel({ icon, label, value, active }: any) {
  return (
    <motion.div className={`border rounded-lg p-4 transition-colors ${active ? "bg-emerald-500/5 border-emerald-500/20" : "bg-white/2 border-white/10"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={active ? "text-emerald-400" : "text-white/35"}>{icon}</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-white/45">{label}</span>
      </div>
      <div className={`text-[11px] font-bold truncate ${active ? "text-white" : "text-white/60"}`}>{value}</div>
    </motion.div>
  );
}

function PresetCard({ active, onClick, icon, label, desc }: any) {
  return (
    <motion.div 
      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onClick}
      className={`p-4 rounded-lg border cursor-pointer transition-colors shadow-sm ${active ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400" : "bg-white/2 border-white/5 opacity-60 hover:opacity-100"}`}
    >
      <div className="flex items-center gap-3 mb-1">
        {icon}
        <span className="text-xs font-black tracking-tighter uppercase">{label}</span>
        {active && <ChevronRight size={14} className="ml-auto" />}
      </div>
      <p className={`text-[9px] ${active ? "opacity-80" : "opacity-50"}`}>{desc}</p>
    </motion.div>
  );
}

function Badge({ label, active }: { label: string, active: boolean }) {
  return (
    <motion.div className={`px-3 py-1 rounded text-[9px] font-black border transition-colors shadow-sm ${active ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400" : "bg-red-500/10 border-red-500/50 text-red-500"}`}>
      {label}: {active ? "ONLINE" : "OFFLINE"}
    </motion.div>
  );
}

export default App;
