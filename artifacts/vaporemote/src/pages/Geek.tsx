import { useDevices } from "@/contexts/DeviceContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Terminal, Cpu, Wifi, WifiOff, Activity } from "lucide-react";
import { useState, useEffect } from "react";

interface LogEntry {
  timestamp: number;
  deviceId: string;
  deviceName: string;
  type: "state" | "command" | "connect" | "disconnect";
  data: unknown;
}

export default function Geek() {
  const { devices } = useDevices();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [rawData, setRawData] = useState<Record<string, Record<string, unknown>>>({});

  useEffect(() => {
    const interval = setInterval(async () => {
      const newRaw: Record<string, Record<string, unknown>> = {};
      for (const d of devices) {
        if (d.state.connected && d.adapter.getRawData) {
          const data = await d.adapter.getRawData();
          newRaw[d.id] = data;
          setLogs(prev => {
            const entry: LogEntry = {
              timestamp: Date.now(),
              deviceId: d.id,
              deviceName: d.displayName,
              type: "state",
              data,
            };
            return [entry, ...prev.slice(0, 99)];
          });
        }
      }
      setRawData(newRaw);
    }, 2000);
    return () => clearInterval(interval);
  }, [devices]);

  const hasConnectedDevices = devices.some(d => d.state.connected);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto min-h-[calc(100vh-4rem)] md:min-h-screen">
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Terminal size={24} className="text-primary drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
          </div>
          <div>
            <h1 data-testid="page-title-geek" className="text-3xl font-bold tracking-tight mb-1">Geek Mode</h1>
            <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Diagnostic Telemetry & Raw BLE</p>
          </div>
        </div>
      </div>

      {devices.length === 0 ? (
        <Card className="border-border/30 bg-black/20 shadow-none border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-24">
            <Cpu size={48} className="text-muted-foreground/30 mb-6" />
            <p className="font-mono tracking-widest text-sm uppercase text-muted-foreground mb-2">No Active Links</p>
            <p className="text-xs text-muted-foreground/60 font-mono">Awaiting hardware connection to stream diagnostics</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          <div className="grid md:grid-cols-2 gap-6">
            {devices.map(device => (
              <Card key={device.id} data-testid={`geek-card-${device.id}`} className="border-border/50 bg-card overflow-hidden">
                <CardHeader className="pb-4 border-b border-border/10 bg-black/20">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold tracking-wider uppercase flex items-center gap-3">
                      <Cpu size={16} className="text-primary" />
                      {device.displayName}
                      <Badge variant="outline" className="text-[10px] font-mono border-white/10 bg-black/40">{device.deviceType}</Badge>
                    </CardTitle>
                    {device.state.connected ? (
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] uppercase tracking-widest font-bold shadow-[0_0_10px_rgba(249,115,22,0.1)]">
                        <Wifi size={10} className="mr-1.5" /> Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60 border-border/50">
                        <WifiOff size={10} className="mr-1.5" /> Offline
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ["TEMP.CURR", device.state.temperature ? `${device.state.temperature.toFixed(2)}°C` : "NULL"],
                      ["TEMP.TGT", device.state.targetTemperature ? `${device.state.targetTemperature.toFixed(2)}°C` : "NULL"],
                      ["SYS.HEAT", String(device.state.isHeating).toUpperCase()],
                      ["PWR.BATT", device.state.batteryLevel !== null ? `${device.state.batteryLevel}%` : "NULL"],
                      ["SYS.FAN", device.state.fanOn !== undefined ? String(device.state.fanOn).toUpperCase() : "N/A"],
                      ["FAN.SPD", device.state.fanSpeed !== undefined ? String(device.state.fanSpeed) : "N/A"],
                    ].map(([key, val]) => (
                      <div key={key} className="bg-black/30 border border-white/5 rounded p-3">
                        <p className="text-[10px] text-muted-foreground font-mono mb-1">{key}</p>
                        <p data-testid={`geek-value-${device.id}-${key}`} className={`text-sm font-mono font-bold truncate ${val === 'TRUE' ? 'text-primary drop-shadow-[0_0_5px_rgba(249,115,22,0.5)]' : 'text-foreground'}`}>
                          {val}
                        </p>
                      </div>
                    ))}
                  </div>

                  {rawData[device.id] && (
                    <div className="relative rounded-lg overflow-hidden border border-border/50 bg-[#0a0a0a]">
                      <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(transparent,transparent_2px,rgba(0,0,0,0.3)_2px,rgba(0,0,0,0.3)_4px)] opacity-50 z-10"></div>
                      <div className="bg-black/60 px-4 py-2 border-b border-border/20 flex justify-between items-center relative z-20">
                        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">RAW_BLE_PAYLOAD.JSON</p>
                        <Activity size={12} className="text-primary animate-pulse" />
                      </div>
                      <div className="p-4 overflow-x-auto relative z-20 max-h-64 overflow-y-auto">
                        <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-all leading-relaxed">
                          {JSON.stringify(rawData[device.id], null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground mb-3 uppercase tracking-widest">Active Services (UUIDs)</p>
                    <div className="flex flex-wrap gap-2">
                      {device.adapter.serviceUUIDs.map(uuid => (
                         <span key={uuid} className="px-2 py-1 bg-muted/30 border border-white/5 rounded text-[10px] font-mono text-muted-foreground">
                           {uuid}
                         </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-border/50 bg-card overflow-hidden">
            <CardHeader className="pb-4 border-b border-border/10 bg-black/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold tracking-wider uppercase flex items-center gap-3">
                  <Terminal size={16} className="text-primary" />
                  Terminal Stream
                </CardTitle>
                {hasConnectedDevices && (
                  <div className="flex items-center gap-2 text-[10px] font-mono font-bold tracking-widest text-green-400">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite] shadow-[0_0_5px_#22c55e]" />
                    LIVE
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative h-96 bg-[#050505] overflow-hidden">
                {/* CRT Scanline Overlay */}
                <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(transparent,transparent_2px,rgba(0,0,0,0.5)_2px,rgba(0,0,0,0.5)_4px)] z-10 opacity-70"></div>
                <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)] z-10"></div>
                
                <div className="p-4 h-full overflow-y-auto font-mono text-xs space-y-1.5 relative z-20">
                  {logs.length === 0 ? (
                    <div className="flex items-center gap-2 text-muted-foreground/50">
                      <span className="animate-pulse">_</span>
                      WAITING FOR STREAM DATA...
                    </div>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} data-testid={`log-entry-${i}`} className="flex gap-3 hover:bg-white/5 px-2 py-0.5 rounded transition-colors group">
                        <span className="text-muted-foreground/50 shrink-0 group-hover:text-muted-foreground transition-colors">
                          {new Date(log.timestamp).toISOString().slice(11, 23)}
                        </span>
                        <span className="text-blue-400/80 shrink-0 font-bold">[{log.deviceName}]</span>
                        <span className="text-primary/80 shrink-0 font-bold uppercase w-16">{log.type}</span>
                        <span className="text-green-400/90 break-all">
                          {JSON.stringify(log.data)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
