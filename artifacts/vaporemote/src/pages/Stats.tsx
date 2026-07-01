import { useDevices } from "@/contexts/DeviceContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import { getDeviceStats, getWeeklyData, formatTemp } from "@/lib/stats";
import { Clock, Zap, Thermometer, BarChart3, Activity } from "lucide-react";

export default function Stats() {
  const { allSessions } = useDevices();
  const { settings } = useSettings();
  const deviceStats = getDeviceStats(allSessions);
  const weeklyData = getWeeklyData(allSessions);
  const totalSessions = allSessions.length;
  const totalMinutes = Math.round(allSessions.reduce((s, d) => s + d.durationSeconds, 0) / 60);
  const avgTemp = allSessions.length
    ? allSessions.reduce((s, d) => s + d.avgTemp, 0) / allSessions.length
    : 0;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto min-h-[calc(100vh-4rem)] md:min-h-screen">
      <div className="mb-8">
        <h1 data-testid="page-title-stats" className="text-3xl font-bold tracking-tight mb-1">Telemetry</h1>
        <p className="text-sm text-muted-foreground font-mono">HISTORICAL DATA LOGS</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Sessions", value: totalSessions, icon: Zap, color: "text-primary", bg: "bg-primary/10 border-primary/20" },
          { label: "Total Minutes", value: totalMinutes, icon: Clock, color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20" },
          { label: "Avg Temp", value: avgTemp ? formatTemp(avgTemp, settings.tempUnit) : "—", icon: Thermometer, color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/20" },
          { label: "Devices Used", value: deviceStats.length, icon: BarChart3, color: "text-purple-400", bg: "bg-purple-400/10 border-purple-400/20" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} data-testid={`stat-card-${label.toLowerCase().replace(/ /g, "-")}`} className="border-border/50 bg-black/20">
            <CardContent className="pt-6 pb-6 flex flex-col items-center text-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 border ${bg}`}>
                <Icon size={20} className={color} style={{ filter: `drop-shadow(0 0 5px currentColor)` }} />
              </div>
              <p className="text-3xl font-bold font-mono tracking-tighter mb-1">{value}</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <Card className="border-border/50 bg-black/10 overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/10 bg-black/20">
            <CardTitle className="text-sm font-bold tracking-wider uppercase text-muted-foreground flex items-center gap-2">
              <BarChart3 size={14} className="text-primary" /> Session Volume
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {weeklyData.every(d => d.sessions === 0) ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground border border-dashed border-border/30 rounded-lg bg-black/10">
                <Activity size={32} className="opacity-20 mb-3" />
                <span className="text-xs uppercase tracking-widest font-mono">Insufficient Data</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "monospace" }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12, fontFamily: "monospace" }}
                    itemStyle={{ color: "hsl(var(--primary))", fontWeight: "bold" }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: "4px" }}
                    cursor={{ fill: 'hsl(var(--muted)/0.2)' }}
                  />
                  <Bar dataKey="sessions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-black/10 overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/10 bg-black/20">
            <CardTitle className="text-sm font-bold tracking-wider uppercase text-muted-foreground flex items-center gap-2">
              <Clock size={14} className="text-blue-400" /> Duration Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {weeklyData.every(d => d.minutes === 0) ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground border border-dashed border-border/30 rounded-lg bg-black/10">
                <Activity size={32} className="opacity-20 mb-3" />
                <span className="text-xs uppercase tracking-widest font-mono">Insufficient Data</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "monospace" }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12, fontFamily: "monospace" }}
                    itemStyle={{ color: "hsl(var(--blue-400))", fontWeight: "bold" }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: "4px" }}
                    formatter={(v) => [`${v} min`, "Minutes"]}
                  />
                  <Line type="monotone" dataKey="minutes" stroke="hsl(var(--blue-400))" strokeWidth={3} dot={{ fill: "hsl(var(--blue-400))", r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }} activeDot={{ r: 6, fill: "hsl(var(--blue-400))", stroke: "hsl(var(--card))" }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {deviceStats.length > 0 && (
        <Card className="border-border/50 bg-black/10">
          <CardHeader className="pb-4 border-b border-border/10 bg-black/20">
            <CardTitle className="text-sm font-bold tracking-wider uppercase text-muted-foreground">Hardware Utilization</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-4">
              {deviceStats.map(ds => (
                <div key={ds.deviceId} data-testid={`device-stat-${ds.deviceId}`} className="flex items-center gap-4 p-3 rounded-lg border border-white/5 bg-black/20 hover:bg-black/40 transition-colors">
                  <div className="w-10 h-10 rounded bg-muted/30 flex items-center justify-center shrink-0 border border-white/5">
                    <Zap size={18} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-bold tracking-wide truncate">{ds.deviceName}</p>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground uppercase">{ds.deviceType.replace('_', ' ')}</span>
                    </div>
                    <div className="flex gap-4 text-xs font-mono text-muted-foreground">
                      <span><strong className="text-foreground">{ds.totalSessions}</strong> SESS</span>
                      <span><strong className="text-foreground">{ds.totalMinutes}</strong> MIN</span>
                      <span>FAV: <strong className="text-primary">{formatTemp(ds.favoriteTempC, settings.tempUnit)}</strong></span>
                    </div>
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground shrink-0 text-right opacity-60">
                    <p className="uppercase mb-0.5">Last Active</p>
                    <p>{new Date(ds.lastUsed).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
