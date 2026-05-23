import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { 
  Activity, 
  Battery, 
  Cpu, 
  ShieldAlert, 
  Zap, 
  Wifi, 
  ChevronRight,
  MousePointer2
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  ResponsiveContainer, 
  YAxis, 
  Tooltip 
} from "recharts";
import { motion } from "framer-motion";
import "./App.css";

interface TelemetryData {
  bytes: number;
  usec: number;
}

type Preset = "PERFORMANCE" | "BALANCED" | "BATTERY";

function App() {
  const [telemetry, setTelemetry] = useState<TelemetryData[]>([]);
  const [currentPreset, setCurrentPreset] = useState<Preset>("BALANCED");
  const [isConnected, setIsConnected] = useState(false);
  const [displayStats, setDisplayStats] = useState({ latency: 0, bytes: 0, packetCount: 0 });

  // Use refs to buffer high-frequency data without triggering re-renders
  const buffer = useRef<{ totalLatency: number, totalBytes: number, count: number }>({
    totalLatency: 0,
    totalBytes: 0,
    count: 0
  });

  useEffect(() => {
    // 0. Safety Guard: Check if we are running in a Tauri environment
    const isTauri = !!(window as any).__TAURI_INTERNALS__;
    if (!isTauri) {
      console.warn("Tauri API not found. Running in browser mode.");
      return;
    }

    // 1. Initial Connection Check
    const checkStatus = async () => {
      const status = await invoke<boolean>("get_connection_status");
      setIsConnected(status);
    };
    checkStatus();

    // 2. High-Frequency Listener (Updates the buffer, not the state)
    const unlisten = listen<TelemetryData>("telemetry-event", (event) => {
      buffer.current.totalLatency += event.payload.usec;
      buffer.current.totalBytes += event.payload.bytes;
      buffer.current.count += 1;
      setIsConnected(true);
    });

    // 3. Low-Frequency UI Poller (Runs once per second)
    const interval = setInterval(() => {
      if (buffer.current.count > 0) {
        const avgLatency = Math.round(buffer.current.totalLatency / buffer.current.count);
        const totalBytes = buffer.current.totalBytes;
        const count = buffer.current.count;

        // Update the display numbers
        setDisplayStats({ 
          latency: avgLatency, 
          bytes: totalBytes, 
          packetCount: count 
        });

        // Update the graph
        setTelemetry((prev) => {
          const newData = [...prev, { usec: avgLatency, bytes: totalBytes }];
          if (newData.length > 30) return newData.slice(1); // Show 30 seconds of history
          return newData;
        });

        // Reset buffer for the next second
        buffer.current = { totalLatency: 0, totalBytes: 0, count: 0 };
      } else if (isConnected) {
        // Still connected but no packets this second
        setDisplayStats(prev => ({ ...prev, bytes: 0, packetCount: 0 }));
        setTelemetry((prev) => {
          const newData = [...prev, { usec: 0, bytes: 0 }];
          if (newData.length > 30) return newData.slice(1);
          return newData;
        });
      }
    }, 1000);

    return () => {
      unlisten.then((f) => f());
      clearInterval(interval);
    };
  }, [isConnected]);

  const changePreset = async (p: Preset) => {
    try {
      await invoke("set_preset", { preset: p });
      setCurrentPreset(p);
    } catch (err) {
      console.error("Failed to set preset:", err);
    }
  };

  return (
    <div className="min-h-screen p-4 flex flex-col gap-4 font-mono">
      {/* HEADER SECTION */}
      <header className="flex justify-between items-center cyber-border bg-cyber-card p-4 rounded-lg">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded ${isConnected ? 'bg-cyber-neon/20' : 'bg-cyber-alert/20'}`}>
            <Zap className={isConnected ? 'text-cyber-neon' : 'text-cyber-alert'} size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter">OPTIFI <span className="text-cyber-neon">CORE</span></h1>
            <div className="flex items-center gap-2 text-[10px] opacity-60">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-cyber-neon animate-pulse' : 'bg-cyber-alert'}`}></span>
              {isConnected ? "SYSTEMS ONLINE" : "WAITING FOR ENGINE..."}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right mr-4">
            <p className="text-[10px] opacity-40 uppercase">OS ADAPTER</p>
            <p className="text-xs font-bold">WINTUN 0.14</p>
          </div>
          <div className="h-8 w-[1px] bg-white/10 mx-2"></div>
          <Activity size={18} className="text-cyber-neon opacity-50" />
        </div>
      </header>

      {/* MAIN STATS GRID */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard 
          icon={<Cpu size={16}/>} 
          label="ENGINE LATENCY" 
          value={`${displayStats.latency}`} 
          unit="µs"
          sublabel="Avg per second"
        />
        <StatCard 
          icon={<Wifi size={16}/>} 
          label="THROUGHPUT" 
          value={`${(displayStats.bytes / 1024).toFixed(1)}`} 
          unit="KB/s"
          sublabel={`${displayStats.packetCount} pkts/sec`}
        />
        <StatCard 
          icon={<MousePointer2 size={16}/>} 
          label="UPTIME" 
          value={`${telemetry.length}`} 
          unit="sec"
          sublabel="Monitoring Window"
        />
      </div>

      {/* CHART & CONTROLS */}
      <div className="flex-1 grid grid-cols-4 gap-4 overflow-hidden">
        
        {/* GRAPH */}
        <div className="col-span-3 cyber-border bg-cyber-card rounded-lg p-6 relative flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xs font-bold opacity-60">SYSTEM PERFORMANCE (LATENCY)</h3>
            <div className="flex gap-4">
               <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-cyber-neon"></div>
                  <span className="text-[10px]">Processing Time</span>
               </div>
            </div>
          </div>
          
          <div className="flex-1 w-full min-h-[400px] h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={telemetry}>
                <YAxis hide domain={[0, 'auto']} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#121216', border: '1px solid rgba(0, 242, 255, 0.2)', fontSize: '10px' }}
                  labelStyle={{ display: 'none' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="usec" 
                  stroke="#00f2ff" 
                  strokeWidth={2} 
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="col-span-1 flex flex-col gap-4">
          <div className="cyber-border bg-cyber-card p-6 rounded-lg flex-1">
            <h3 className="text-xs font-bold mb-6 opacity-60">POWER PRESETS</h3>
            
            <div className="flex flex-col gap-3">
              <PresetButton 
                active={currentPreset === "PERFORMANCE"} 
                onClick={() => changePreset("PERFORMANCE")}
                icon={<Zap size={14} />}
                label="PERFORMANCE"
                desc="Max Tx / 0ms delay"
              />
              <PresetButton 
                active={currentPreset === "BALANCED"} 
                onClick={() => changePreset("BALANCED")}
                icon={<Activity size={14} />}
                label="BALANCED"
                desc="Default / 500µs"
              />
              <PresetButton 
                active={currentPreset === "BATTERY"} 
                onClick={() => changePreset("BATTERY")}
                icon={<Battery size={14} />}
                label="BATTERY"
                desc="Power Save / 2ms"
              />
            </div>

            <div className="mt-8 pt-8 border-t border-white/5">
               <div className="flex items-start gap-3 p-3 bg-cyber-alert/5 border border-cyber-alert/20 rounded">
                  <ShieldAlert size={16} className="text-cyber-alert mt-0.5" />
                  <p className="text-[9px] text-cyber-alert leading-relaxed">
                    CRITICAL: High performance mode increases ESP32 power consumption and thermal output.
                  </p>
               </div>
            </div>
          </div>

          <div className="cyber-border bg-cyber-dim p-4 rounded-lg">
            <div className="flex justify-between items-center text-[10px]">
              <span className="opacity-40 uppercase">Firmware Hash</span>
              <span className="font-bold">E54-X90</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ icon, label, value, unit, sublabel }: any) {
  return (
    <div className="cyber-border bg-cyber-card p-6 rounded-lg group hover:border-cyber-neon/30 transition-all">
      <div className="flex items-center gap-2 mb-4 opacity-40">
        {icon}
        <p className="text-[10px] uppercase font-bold tracking-widest">{label}</p>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-black text-white">{value}</span>
        <span className="text-sm font-bold text-cyber-neon">{unit}</span>
      </div>
      <p className="text-[10px] mt-1 opacity-40 italic">{sublabel}</p>
    </div>
  );
}

function PresetButton({ active, onClick, icon, label, desc }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full p-4 rounded text-left border transition-all relative overflow-hidden group ${
        active 
          ? 'bg-cyber-neon/10 border-cyber-neon' 
          : 'bg-white/5 border-white/5 hover:border-white/20'
      }`}
    >
      <div className="flex items-center gap-3 relative z-10">
        <div className={`${active ? 'text-cyber-neon' : 'opacity-40'}`}>
          {icon}
        </div>
        <div>
          <p className={`text-xs font-black ${active ? 'text-cyber-neon' : ''}`}>{label}</p>
          <p className="text-[9px] opacity-40">{desc}</p>
        </div>
        <ChevronRight size={14} className={`ml-auto ${active ? 'text-cyber-neon' : 'opacity-20'}`} />
      </div>
      {active && (
        <motion.div 
          layoutId="active-bg"
          className="absolute inset-0 bg-cyber-neon/5"
        />
      )}
    </button>
  );
}

export default App;
