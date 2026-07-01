import { useDevices } from "@/contexts/DeviceContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useState, useCallback, useRef } from "react";
import {
  Bluetooth, Plus, Wind, PowerOff, Thermometer, Battery,
  Clock, Wifi, WifiOff, Flame, PenLine, Check, X, AlarmClock, TimerReset,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { formatTemp, loadPresets, savePresets } from "@/lib/stats";
import type { TempPreset } from "@/lib/stats";
import { DEVICE_TEMP_RANGES, getAllAdapters } from "@/lib/devices";
import type { VaporizerType } from "@/lib/bluetooth";
import type { ConnectedDevice } from "@/contexts/DeviceContext";
import { motion, AnimatePresence } from "framer-motion";
import VolcanoRoutines from "@/components/VolcanoRoutines";
import DevicePickerModal from "@/components/DevicePickerModal";

function TempGauge({ current, target, unit, isHeating }: {
  current: number | null;
  target: number | null;
  unit: "C" | "F";
  isHeating: boolean;
}) {
  const range = { min: 40, max: 250 };
  const pct = current ? ((current - range.min) / (range.max - range.min)) * 100 : 0;
  const targetPct = target ? ((target - range.min) / (range.max - range.min)) * 100 : 0;

  return (
    <div data-testid="temp-gauge" className="relative flex flex-col items-center gap-2">
      <div className="w-36 h-36 relative">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90 drop-shadow-xl">
          {Array.from({ length: 36 }).map((_, i) => (
            <line key={i} x1="50" y1="2" x2="50" y2="4"
              stroke="hsl(var(--muted-foreground)/0.3)" strokeWidth="0.5"
              transform={`rotate(${i * 10}, 50, 50)`} />
          ))}
          <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted)/0.5)" strokeWidth="6" />
          <circle cx="50" cy="50" r="40" fill="none"
            stroke="hsl(var(--primary))" strokeWidth="6"
            strokeDasharray={`${pct * 2.512} ${251.2}`}
            strokeLinecap="round"
            className={`transition-all duration-700 ${isHeating ? "opacity-90" : "opacity-50"}`}
            style={{ filter: isHeating ? "drop-shadow(0 0 4px rgba(249,115,22,0.8))" : "none" }}
          />
          {target && (
            <line x1="50" y1="6" x2="50" y2="14"
              stroke="hsl(var(--accent))" strokeWidth="2.5" strokeLinecap="round"
              transform={`rotate(${targetPct * 3.6}, 50, 50)`}
              style={{ filter: "drop-shadow(0 0 2px rgba(249,115,22,0.8))" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-foreground font-mono tracking-tighter drop-shadow-sm">
            {current ? formatTemp(current, unit) : "—"}
          </span>
          {target && (
            <span className="text-[10px] uppercase tracking-widest text-primary font-medium mt-1 opacity-80">
              Ziel: {formatTemp(target, unit)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PresetRow({ deviceType, unit, onSelect }: {
  deviceType: VaporizerType;
  unit: "C" | "F";
  onSelect: (temp: number) => void;
}) {
  const [presets, setPresets] = useState<TempPreset[]>(() => loadPresets(deviceType));
  const [editMode, setEditMode] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editTemp, setEditTemp] = useState("");

  const startEdit = (i: number) => {
    setEditIndex(i);
    setEditLabel(presets[i].label);
    setEditTemp(String(Math.round(presets[i].temp)));
  };

  const commitEdit = () => {
    if (editIndex === null) return;
    const temp = Number(editTemp);
    if (!isNaN(temp) && temp > 0) {
      const updated = presets.map((p, i) =>
        i === editIndex ? { label: editLabel || p.label, temp } : p
      );
      setPresets(updated);
      savePresets(deviceType as any, updated);
    }
    setEditIndex(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Presets</span>
        <button
          className="text-[10px] text-primary/70 hover:text-primary font-medium flex items-center gap-1 transition-colors"
          onClick={() => { setEditMode(e => !e); setEditIndex(null); }}
        >
          {editMode ? <><Check size={10} /> Fertig</> : <><PenLine size={10} /> Bearbeiten</>}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {presets.map((preset, i) => (
          editMode && editIndex === i ? (
            <div key={i} className="col-span-4 flex gap-1.5 items-center bg-black/30 rounded-lg px-2 py-1.5 border border-primary/30">
              <input
                className="w-16 bg-transparent border-b border-primary/40 text-xs text-foreground outline-none px-1"
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                placeholder="Label"
              />
              <input
                className="w-14 bg-transparent border-b border-primary/40 text-xs text-primary font-mono outline-none px-1"
                value={editTemp}
                type="number"
                onChange={e => setEditTemp(e.target.value)}
              />
              <span className="text-[10px] text-muted-foreground">°C</span>
              <button onClick={commitEdit} className="ml-auto text-primary hover:text-primary/80"><Check size={12} /></button>
              <button onClick={() => setEditIndex(null)} className="text-muted-foreground hover:text-foreground"><X size={12} /></button>
            </div>
          ) : (
            <button
              key={i}
              onClick={() => editMode ? startEdit(i) : onSelect(preset.temp)}
              className={`relative rounded-lg border px-1 py-2 text-center transition-all group ${
                editMode
                  ? "border-dashed border-primary/30 hover:border-primary/60 bg-black/20"
                  : "border-border/30 bg-black/20 hover:border-primary/50 hover:bg-primary/10 active:scale-95"
              }`}
            >
              {editMode && <PenLine size={8} className="absolute top-1 right-1 text-primary/40 group-hover:text-primary/70" />}
              <span className="text-[10px] font-bold text-foreground block">{preset.label}</span>
              <span className="text-[11px] font-mono text-primary">{formatTemp(preset.temp, unit)}</span>
            </button>
          )
        ))}
      </div>
    </div>
  );
}

function SessionCountdown({ startedAt, maxDuration, onExpire }: {
  startedAt: number;
  maxDuration: number;
  onExpire: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    const id = setInterval(() => {
      const e = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(e);
      if (e >= maxDuration && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt, maxDuration, onExpire]);

  const remaining = Math.max(0, maxDuration - elapsed);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = Math.min(100, (elapsed / maxDuration) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-mono text-primary/80 bg-primary/10 border border-primary/20 rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Clock size={14} className="animate-pulse" />
          <span className="uppercase text-[10px] tracking-widest font-sans font-bold">Session</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-bold tracking-wider text-foreground">
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </span>
          <span className="text-[10px] text-primary/70 ml-2">
            noch {mins}:{String(secs).padStart(2, "0")}
          </span>
        </div>
      </div>
      <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-1000"
          style={{ width: `${pct}%`, opacity: pct > 80 ? 1 : 0.7 }}
        />
      </div>
    </div>
  );
}

function SessionDurationPicker({ value, onChange }: {
  value: number;
  onChange: (s: number) => void;
}) {
  const options = [
    { label: "3 min", value: 180 },
    { label: "5 min", value: 300 },
    { label: "8 min", value: 480 },
    { label: "10 min", value: 600 },
    { label: "15 min", value: 900 },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-1.5">
          <AlarmClock size={10} /> Sessiondauer
        </span>
        <span className="text-[10px] font-mono text-primary">{Math.floor(value / 60)} min</span>
      </div>
      <div className="flex gap-1 flex-wrap">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-2 py-1 rounded text-[10px] font-mono border transition-all ${
              value === opt.value
                ? "bg-primary/20 border-primary/50 text-primary font-bold"
                : "bg-black/20 border-border/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DeviceCard({ device }: { device: ConnectedDevice }) {
  const { sendCommand, heatUp, heatOff, extendSession, setSessionMaxDuration } = useDevices();
  const { settings } = useSettings();
  const [localTarget, setLocalTarget] = useState(device.state.targetTemperature ?? 185);
  const range = DEVICE_TEMP_RANGES[device.deviceType];
  const isVolcano = device.deviceType === "volcano_hybrid";

  const handleSetTemp = useCallback((val: number[]) => {
    setLocalTarget(val[0]);
    sendCommand(device.id, { type: "set_temperature", value: val[0] });
  }, [device.id, sendCommand]);

  const handlePresetSelect = useCallback((temp: number) => {
    setLocalTarget(temp);
    sendCommand(device.id, { type: "set_temperature", value: temp });
  }, [device.id, sendCommand]);

  const handleHeatUp = useCallback(() => {
    heatUp(device.id);
  }, [device.id, heatUp]);

  const handleHeatOff = useCallback(() => {
    heatOff(device.id);
  }, [device.id, heatOff]);

  const handleExpire = useCallback(() => {
    heatOff(device.id);
  }, [device.id, heatOff]);

  return (
    <Card
      data-testid={`device-card-${device.id}`}
      className={`border transition-all duration-500 overflow-hidden relative ${
        device.state.isHeating
          ? "heating-active border-primary/50 shadow-[0_0_30px_rgba(249,115,22,0.15)] bg-gradient-to-b from-primary/5 to-card"
          : "border-border/50 bg-card hover:border-border"
      }`}
    >
      {device.state.isHeating && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary shadow-[0_0_10px_rgba(249,115,22,1)] z-10" />
      )}

      <CardHeader className="pb-3 relative z-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest mb-1 opacity-70">{device.manufacturer}</p>
            <CardTitle className="text-xl font-medium tracking-tight">{device.displayName}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {device.state.connected ? (
              <Badge variant="default" className="bg-primary/10 text-primary border-primary/20 text-[10px] uppercase font-bold tracking-wider px-2 shadow-[0_0_10px_rgba(249,115,22,0.1)]">
                <Wifi size={10} className="mr-1.5 opacity-80" /> Live
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground/60 border-border/50 text-[10px] uppercase tracking-wider px-2">
                <WifiOff size={10} className="mr-1.5" /> Offline
              </Badge>
            )}
            {device.state.batteryLevel !== null && (
              <div data-testid={`battery-${device.id}`} className={`flex items-center gap-1.5 text-xs font-mono ${device.state.batteryLevel < 20 ? "text-destructive" : "text-muted-foreground"}`}>
                <Battery size={14} className="opacity-80" />
                <span>{device.state.batteryLevel}%</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 relative z-10">
        <div className="flex items-center justify-center pt-2 pb-2">
          <TempGauge
            current={device.state.temperature}
            target={device.state.targetTemperature}
            unit={settings.tempUnit}
            isHeating={device.state.isHeating || false}
          />
        </div>

        <PresetRow
          deviceType={device.deviceType}
          unit={settings.tempUnit}
          onSelect={handlePresetSelect}
        />

        <div className="space-y-3 bg-black/20 p-4 rounded-xl border border-white/5">
          <div className="flex justify-between text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            <span>{formatTemp(range.min, settings.tempUnit)}</span>
            <span className="font-bold text-primary/90">{formatTemp(localTarget, settings.tempUnit)}</span>
            <span>{formatTemp(range.max, settings.tempUnit)}</span>
          </div>
          <Slider
            data-testid={`temp-slider-${device.id}`}
            min={range.min}
            max={range.max}
            step={range.step}
            value={[localTarget]}
            onValueChange={handleSetTemp}
            disabled={!device.state.connected}
            className="w-full"
          />
        </div>

        {!device.activeSession && (
          <SessionDurationPicker
            value={device.sessionMaxDuration}
            onChange={(s) => setSessionMaxDuration(device.id, s)}
          />
        )}

        {device.activeSession && (
          <SessionCountdown
            startedAt={device.activeSession.startedAt}
            maxDuration={device.sessionMaxDuration}
            onExpire={handleExpire}
          />
        )}

        <div className="flex gap-2">
          {!device.state.isHeating ? (
            <Button
              data-testid={`heat-button-${device.id}`}
              className="flex-1 gap-2 h-12 transition-all duration-300 font-bold tracking-wide uppercase text-xs bg-primary text-primary-foreground shadow-[0_0_15px_rgba(249,115,22,0.3)] hover:shadow-[0_0_25px_rgba(249,115,22,0.5)]"
              onClick={handleHeatUp}
              disabled={!device.state.connected}
            >
              <Flame size={16} />
              Heat Up
            </Button>
          ) : (
            <Button
              data-testid={`heat-button-${device.id}`}
              variant="secondary"
              className="flex-1 gap-2 h-12 font-bold tracking-wide uppercase text-xs bg-muted/50 hover:bg-muted/80"
              onClick={handleHeatOff}
              disabled={!device.state.connected}
            >
              <Thermometer size={16} className="opacity-70" />
              Stop
            </Button>
          )}

          {device.activeSession && (
            <Button
              variant="secondary"
              className="h-12 px-3 gap-1.5 text-xs font-bold tracking-wide border border-primary/30 hover:border-primary/60 hover:bg-primary/10 hover:text-primary bg-black/20"
              onClick={() => extendSession(device.id, 60)}
              title="Session um 1 Minute verlängern"
            >
              <TimerReset size={14} />
              +1 min
            </Button>
          )}

          {isVolcano && device.state.fanSpeed !== undefined && (
            <Button
              data-testid={`fan-button-${device.id}`}
              variant={device.state.fanOn ? "default" : "secondary"}
              size="icon"
              className={`h-12 w-12 ${device.state.fanOn ? "bg-primary shadow-[0_0_10px_rgba(249,115,22,0.3)]" : "bg-muted/50"}`}
              onClick={() => sendCommand(device.id, { type: "toggle_fan" })}
              disabled={!device.state.connected}
              title={device.state.fanOn ? "Pumpe stoppen" : "Pumpe starten"}
            >
              <Wind size={18} className={device.state.fanOn ? "animate-spin-slow" : "opacity-70"} />
            </Button>
          )}

          <Button
            data-testid={`power-button-${device.id}`}
            variant="secondary"
            size="icon"
            className="h-12 w-12 bg-muted/50 hover:bg-destructive/20 hover:text-destructive hover:border-destructive/30 border border-transparent transition-colors"
            onClick={() => {
              sendCommand(device.id, { type: "power_off" });
              if (device.activeSession) heatOff(device.id);
            }}
            disabled={!device.state.connected}
          >
            <PowerOff size={18} className="opacity-70" />
          </Button>
        </div>

        {isVolcano && (
          <VolcanoRoutines
            deviceId={device.id}
            connected={device.state.connected}
            onSendCommand={(cmd) => sendCommand(device.id, cmd)}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { devices, isConnecting, connectDevice, bluetoothSupported, bluetoothUnsupportedReason } = useDevices();
  const { settings } = useSettings();
  const [showPicker, setShowPicker] = useState(false);
  const adapters = getAllAdapters();

  const handleSelectDevice = (deviceType: import("@/lib/bluetooth").VaporizerType) => {
    const adapter = adapters.find(a => a.deviceType === deviceType);
    if (adapter) connectDevice(adapter);
  };

  const showWidget = (id: string) => settings.dashboardWidgets.includes(id);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto min-h-[calc(100vh-4rem)] md:min-h-screen">
      <DevicePickerModal
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleSelectDevice}
      />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 data-testid="page-title-dashboard" className="text-3xl font-bold tracking-tight mb-1">Dashboard</h1>
          <p className="text-sm text-muted-foreground font-mono">
            {devices.length === 0 ? "STATUS: NO DEVICES" : `STATUS: ${devices.length} DEVICE${devices.length > 1 ? "S" : ""} ONLINE`}
          </p>
        </div>
        <Button
          data-testid="connect-device-btn"
          onClick={() => setShowPicker(true)}
          disabled={isConnecting || !bluetoothSupported}
          className="gap-2 bg-primary/10 text-primary border border-primary/30 hover:bg-primary hover:text-primary-foreground shadow-[0_0_10px_rgba(249,115,22,0.1)] transition-all"
        >
          {isConnecting ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-current border-r-transparent rounded-full animate-spin" />
              SCANNING...
            </span>
          ) : (
            <>
              <Plus size={16} />
              <span className="font-bold tracking-wider text-xs uppercase">Gerät hinzufügen</span>
            </>
          )}
        </Button>
      </div>

      {!bluetoothSupported && (
        <Card className="mb-8 border-destructive/30 bg-destructive/5 shadow-none">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
                <Bluetooth className="text-destructive" size={20} />
              </div>
              <div>
                <p className="font-bold text-destructive tracking-wide uppercase text-sm mb-1">Bluetooth nicht verfügbar</p>
                <p className="text-sm text-muted-foreground mb-3">{bluetoothUnsupportedReason}</p>
                <div className="bg-black/20 p-3 rounded border border-white/5">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">iOS-Nutzer:</strong> Lade <strong className="text-foreground">Bluefy</strong> aus dem App Store für Web Bluetooth-Unterstützung.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center relative overflow-hidden rounded-2xl border border-white/5 bg-black/20">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.05)_0%,transparent_70%)] pointer-events-none" />
          <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-primary/30 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] opacity-75" />
            <div className="absolute inset-2 rounded-full border border-primary/20 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite_0.5s] opacity-50" />
            <div className="absolute inset-4 rounded-full border border-primary/10 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite_1s] opacity-25" />
            <div className="relative w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.2)] backdrop-blur-sm z-10">
              <Bluetooth size={28} className="text-primary drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
            </div>
          </div>
          <h2 className="text-xl font-bold tracking-tight mb-3">Warte auf Verbindung</h2>
          <p className="text-sm text-muted-foreground max-w-md mb-8 leading-relaxed">
            Verbinde deine Vaporizer — Volcano, Venty, Puffco, Carta Sport und mehr. Vollständige Telemetrie und präzise Steuerung.
          </p>
          <Button
            data-testid="connect-first-device-btn"
            onClick={() => setShowPicker(true)}
            disabled={isConnecting || !bluetoothSupported}
            size="lg"
            className="gap-2 bg-primary text-primary-foreground shadow-[0_0_15px_rgba(249,115,22,0.4)] hover:shadow-[0_0_25px_rgba(249,115,22,0.6)] font-bold tracking-wider uppercase text-xs"
          >
            <Plus size={18} />
            Verbindung herstellen
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence>
            {showWidget("device_cards") && devices.map((device, i) => (
              <motion.div
                key={device.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4, delay: i * 0.1, ease: "easeOut" }}
              >
                <DeviceCard device={device} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
