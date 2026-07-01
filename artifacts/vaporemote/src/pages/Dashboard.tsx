import { useDevices } from "@/contexts/DeviceContext";
import { useGroups } from "@/contexts/GroupContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  Bluetooth, Plus, Wind, PowerOff, Thermometer, Battery,
  Clock, Wifi, WifiOff, Flame, PenLine, Check, X, AlarmClock, TimerReset, Zap,
  BatteryCharging, Sun, Timer, CheckCircle2, Info, Scan, History,
  ChevronDown, ChevronUp, Users, Trash2, UserPlus,
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
import type { DeviceGroup } from "@/contexts/GroupContext";
import { motion, AnimatePresence } from "framer-motion";
import VolcanoRoutines from "@/components/VolcanoRoutines";
import DevicePickerModal from "@/components/DevicePickerModal";
import { CARTA_SPORT_PROFILES } from "@/lib/devices/focus-v";

// ─── Battery Strip (multi-device) ────────────────────────────────────────────

function BatteryStrip({ devices }: { devices: ConnectedDevice[] }) {
  if (devices.length < 2) return null;

  function barColor(level: number | null, isCharging: boolean): string {
    if (isCharging) return "bg-emerald-500";
    if (level === null) return "bg-muted";
    if (level < 15) return "bg-red-500 animate-pulse";
    if (level < 30) return "bg-amber-500";
    return "bg-primary";
  }

  function shortName(d: ConnectedDevice): string {
    const words = d.displayName.split(" ");
    return words[0].slice(0, 7);
  }

  return (
    <div className="fixed top-16 left-0 right-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border/40 shadow-md">
      <div className="flex items-center gap-3 px-4 py-2 max-w-7xl mx-auto overflow-x-auto">
        {devices.map(device => {
          const level = device.state.batteryLevel;
          const charging = device.state.isCharging ?? false;
          const color = barColor(level, charging);
          return (
            <div key={device.id} className="flex items-center gap-2 min-w-[120px] shrink-0">
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider w-[52px] truncate">{shortName(device)}</span>
              <div className="flex-1 relative h-2.5 rounded-full bg-muted/40 overflow-hidden min-w-[60px]">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${color}`}
                  style={{ width: level !== null ? `${Math.max(2, level)}%` : "0%" }}
                />
                {charging && (
                  <Zap size={8} className="absolute inset-0 m-auto text-white/80 drop-shadow-sm" />
                )}
              </div>
              <span className="text-[9px] font-mono text-muted-foreground w-7 text-right">
                {level !== null ? `${level}%` : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Single-device battery block ──────────────────────────────────────────────

function SingleBatteryBlock({ level, isCharging }: { level: number | null; isCharging: boolean }) {
  if (level === null) return null;
  const color = level < 15 ? "text-red-400" : level < 30 ? "text-amber-400" : "text-emerald-400";
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/5 ${color}`}>
      <div className="relative">
        {isCharging ? (
          <BatteryCharging size={28} className={`${color} ${isCharging ? "animate-pulse" : ""}`} />
        ) : (
          <Battery size={28} className={color} />
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-2xl font-bold font-mono leading-none">{level}%</span>
        <span className="text-[9px] uppercase tracking-widest opacity-70 mt-0.5">
          {isCharging ? "Charging" : "Battery"}
        </span>
      </div>
    </div>
  );
}

// ─── TempGauge ────────────────────────────────────────────────────────────────

function TempGauge({ current, target, unit, isHeating }: {
  current: number | null; target: number | null;
  unit: "C" | "F"; isHeating: boolean;
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
              Target: {formatTemp(target, unit)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PresetRow ────────────────────────────────────────────────────────────────

function PresetRow({ deviceType, unit, onSelect }: {
  deviceType: VaporizerType; unit: "C" | "F"; onSelect: (temp: number) => void;
}) {
  const [presets, setPresets] = useState<TempPreset[]>(() => loadPresets(deviceType));
  const [editMode, setEditMode] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editTemp, setEditTemp] = useState("");

  const startEdit = (i: number) => {
    setEditIndex(i); setEditLabel(presets[i].label); setEditTemp(String(Math.round(presets[i].temp)));
  };

  const commitEdit = () => {
    if (editIndex === null) return;
    const temp = Number(editTemp);
    if (!isNaN(temp) && temp > 0) {
      const updated = presets.map((p, i) => i === editIndex ? { label: editLabel || p.label, temp } : p);
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
          {editMode ? <><Check size={10} /> Done</> : <><PenLine size={10} /> Edit</>}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {presets.map((preset, i) => (
          editMode && editIndex === i ? (
            <div key={i} className="col-span-4 flex gap-1.5 items-center bg-black/30 rounded-lg px-2 py-1.5 border border-primary/30">
              <input className="w-16 bg-transparent border-b border-primary/40 text-xs text-foreground outline-none px-1"
                value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="Label" />
              <input className="w-14 bg-transparent border-b border-primary/40 text-xs text-primary font-mono outline-none px-1"
                value={editTemp} type="number" onChange={e => setEditTemp(e.target.value)} />
              <span className="text-[10px] text-muted-foreground">°C</span>
              <button onClick={commitEdit} className="ml-auto text-primary hover:text-primary/80"><Check size={12} /></button>
              <button onClick={() => setEditIndex(null)} className="text-muted-foreground hover:text-foreground"><X size={12} /></button>
            </div>
          ) : (
            <button key={i} onClick={() => editMode ? startEdit(i) : onSelect(preset.temp)}
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

// ─── SessionCountdown ─────────────────────────────────────────────────────────

function SessionCountdown({ startedAt, maxDuration, onExpire }: {
  startedAt: number; maxDuration: number; onExpire: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    const id = setInterval(() => {
      const e = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(e);
      if (e >= maxDuration && !expiredRef.current) { expiredRef.current = true; onExpire(); }
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
            {mins}:{String(secs).padStart(2, "0")} left
          </span>
        </div>
      </div>
      <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-1000"
          style={{ width: `${pct}%`, opacity: pct > 80 ? 1 : 0.7 }} />
      </div>
    </div>
  );
}

// ─── SessionDurationPicker ────────────────────────────────────────────────────

function SessionDurationPicker({ value, onChange }: { value: number; onChange: (s: number) => void }) {
  const options = [
    { label: "3 min", value: 180 }, { label: "5 min", value: 300 },
    { label: "8 min", value: 480 }, { label: "10 min", value: 600 },
    { label: "15 min", value: 900 },
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-1.5">
          <AlarmClock size={10} /> Session Duration
        </span>
        <span className="text-[10px] font-mono text-primary">{Math.floor(value / 60)} min</span>
      </div>
      <div className="flex gap-1 flex-wrap">
        {options.map(opt => (
          <button key={opt.value} onClick={() => onChange(opt.value)}
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

// ─── DeviceCard ───────────────────────────────────────────────────────────────

function DeviceCard({ device, multiDevice }: { device: ConnectedDevice; multiDevice: boolean }) {
  const { sendCommand, heatUp, heatOff, extendSession, setSessionMaxDuration } = useDevices();
  const { settings } = useSettings();
  const [localTarget, setLocalTarget] = useState(device.state.targetTemperature ?? 185);
  const [localBoost, setLocalBoost] = useState(device.state.boostTemperature ?? 15);
  const [localLed, setLocalLed] = useState(device.state.ledBrightness ?? 100);
  const [localShutoff, setLocalShutoff] = useState(device.state.autoShutoffMinutes ?? 0);
  const range = DEVICE_TEMP_RANGES[device.deviceType];
  const caps = device.adapter.capabilities;
  const isVolcano = device.deviceType === "volcano_hybrid";
  const isCartaSport = device.deviceType === "focus_carta_sport";

  const handleSetTemp = useCallback((val: number[]) => {
    setLocalTarget(val[0]);
    sendCommand(device.id, { type: "set_temperature", value: val[0] });
  }, [device.id, sendCommand]);

  const handlePresetSelect = useCallback((temp: number) => {
    setLocalTarget(temp);
    sendCommand(device.id, { type: "set_temperature", value: temp });
  }, [device.id, sendCommand]);

  const handleSetBoost = useCallback((val: number[]) => {
    setLocalBoost(val[0]);
    sendCommand(device.id, { type: "set_boost_temperature", value: val[0] });
  }, [device.id, sendCommand]);

  const handleHeatUp = useCallback(() => heatUp(device.id), [device.id, heatUp]);
  const handleHeatOff = useCallback(() => heatOff(device.id), [device.id, heatOff]);
  const handleExpire = useCallback(() => heatOff(device.id), [device.id, heatOff]);

  const handleSetLed = useCallback((val: number[]) => {
    setLocalLed(val[0]);
    sendCommand(device.id, { type: "set_led_brightness", value: val[0] });
  }, [device.id, sendCommand]);

  const handleSetShutoff = useCallback((val: number[]) => {
    setLocalShutoff(val[0]);
    sendCommand(device.id, { type: "set_auto_shutoff", value: val[0] });
  }, [device.id, sendCommand]);

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
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {device.state.connected ? (
              <Badge variant="default" className="bg-primary/10 text-primary border-primary/20 text-[10px] uppercase font-bold tracking-wider px-2 shadow-[0_0_10px_rgba(249,115,22,0.1)]">
                <Wifi size={10} className="mr-1.5 opacity-80" /> Live
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground/60 border-border/50 text-[10px] uppercase tracking-wider px-2">
                <WifiOff size={10} className="mr-1.5" /> Offline
              </Badge>
            )}
            {isVolcano && device.state.isReady && (
              <Badge variant="default" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] uppercase font-bold tracking-wider px-2">
                <CheckCircle2 size={10} className="mr-1.5" /> At Temp
              </Badge>
            )}
            {/* Single-device: show large battery block; multi-device: show in strip */}
            {!multiDevice && caps?.hasBattery && device.state.batteryLevel !== null && (
              <SingleBatteryBlock
                level={device.state.batteryLevel}
                isCharging={device.state.isCharging ?? false}
              />
            )}
            {multiDevice && caps?.hasBattery && device.state.batteryLevel !== null && (
              <div data-testid={`battery-${device.id}`} className={`flex items-center gap-1.5 text-xs font-mono ${device.state.batteryLevel < 20 ? "text-destructive" : "text-muted-foreground"}`}>
                {device.state.isCharging
                  ? <BatteryCharging size={14} className="text-emerald-400" />
                  : <Battery size={14} className="opacity-80" />
                }
                <span>{device.state.batteryLevel}%</span>
              </div>
            )}
          </div>
        </div>

        {/* PAX 3 / limited device note */}
        {device.adapter.statusNote && (
          <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Info size={12} className="text-amber-400 shrink-0" />
            <span className="text-[10px] text-amber-300">{device.adapter.statusNote}</span>
          </div>
        )}
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

        {/* Carta Sport — 5-preset color profile grid */}
        {isCartaSport ? (
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-1.5">
              <Flame size={10} /> Heat Levels
            </span>
            <div className="grid grid-cols-5 gap-2">
              {CARTA_SPORT_PROFILES.map((p) => {
                const isActive = device.state.activeProfile === p.index;
                return (
                  <button key={p.index}
                    onClick={() => {
                      sendCommand(device.id, { type: "set_profile", value: p.index });
                      setLocalTarget(p.tempC);
                      setSessionMaxDuration(device.id, p.duration);
                    }}
                    disabled={!device.state.connected}
                    title={`${p.nameEn} — ${p.tempF}°F / ${p.tempC.toFixed(1)}°C · ${p.duration}s`}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all duration-200 disabled:opacity-40 ${
                      isActive
                        ? "border-white/40 bg-white/10 shadow-[0_0_12px_rgba(255,255,255,0.15)]"
                        : "border-border/30 bg-black/20 hover:bg-white/5 hover:border-white/20"
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: p.color, boxShadow: isActive ? `0 0 10px ${p.color}, 0 0 4px ${p.color}` : "none" }}
                    />
                    <span className="text-[8px] font-mono text-muted-foreground leading-tight">{p.tempF}°</span>
                    <span className="text-[7px] font-mono text-muted-foreground/60 leading-tight">{p.duration}s</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <PresetRow deviceType={device.deviceType} unit={settings.tempUnit} onSelect={handlePresetSelect} />
        )}

        {/* Temperature slider */}
        <div className="space-y-3 bg-black/20 p-4 rounded-xl border border-white/5">
          <div className="flex justify-between text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            <span>{formatTemp(range.min, settings.tempUnit)}</span>
            <span className="font-bold text-primary/90">{formatTemp(localTarget, settings.tempUnit)}</span>
            <span>{formatTemp(range.max, settings.tempUnit)}</span>
          </div>
          <Slider
            data-testid={`temp-slider-${device.id}`}
            min={range.min} max={range.max} step={range.step}
            value={[localTarget]} onValueChange={handleSetTemp}
            disabled={!device.state.connected} className="w-full"
          />
        </div>

        {/* Boost temperature (Venty / Crafty+) */}
        {caps?.hasBoost && (
          <div className="space-y-3 bg-black/20 p-4 rounded-xl border border-amber-500/20">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-amber-400/80 font-semibold flex items-center gap-1.5">
                <Zap size={10} /> Boost Temperature
              </span>
              <span className="text-[10px] font-mono text-amber-400 font-bold">+{localBoost.toFixed(1)}°C</span>
            </div>
            <Slider min={1} max={30} step={1} value={[localBoost]} onValueChange={handleSetBoost}
              disabled={!device.state.connected} className="w-full" />
            <p className="text-[9px] text-muted-foreground/60">
              Boost target: {(localTarget + localBoost).toFixed(1)}°C · Superboost: {(localTarget + localBoost * 2).toFixed(1)}°C
            </p>
          </div>
        )}

        {!device.activeSession && (
          <SessionDurationPicker value={device.sessionMaxDuration} onChange={(s) => setSessionMaxDuration(device.id, s)} />
        )}

        {device.activeSession && (
          <SessionCountdown startedAt={device.activeSession.startedAt} maxDuration={device.sessionMaxDuration} onExpire={handleExpire} />
        )}

        {/* Action buttons — only show heat if adapter supports it */}
        <div className="flex gap-2">
          {caps?.hasHeat && !device.state.isHeating && (
            <Button
              data-testid={`heat-button-${device.id}`}
              className="flex-1 gap-2 h-12 transition-all duration-300 font-bold tracking-wide uppercase text-xs bg-primary text-primary-foreground shadow-[0_0_15px_rgba(249,115,22,0.3)] hover:shadow-[0_0_25px_rgba(249,115,22,0.5)]"
              onClick={handleHeatUp} disabled={!device.state.connected}
            >
              <Flame size={16} /> Heat Up
            </Button>
          )}
          {caps?.hasHeat && device.state.isHeating && (
            <Button
              data-testid={`heat-button-${device.id}`}
              variant="secondary"
              className="flex-1 gap-2 h-12 font-bold tracking-wide uppercase text-xs bg-muted/50 hover:bg-muted/80"
              onClick={handleHeatOff} disabled={!device.state.connected}
            >
              <Thermometer size={16} className="opacity-70" /> Stop
            </Button>
          )}
          {!caps?.hasHeat && (
            <div className="flex-1 flex items-center justify-center h-12 bg-black/20 rounded-md border border-white/5 text-[10px] text-muted-foreground/60 uppercase tracking-widest">
              Monitor Only
            </div>
          )}

          {device.activeSession && (
            <Button variant="secondary"
              className="h-12 px-3 gap-1.5 text-xs font-bold tracking-wide border border-primary/30 hover:border-primary/60 hover:bg-primary/10 hover:text-primary bg-black/20"
              onClick={() => extendSession(device.id, 60)} title="Extend session by 1 minute"
            >
              <TimerReset size={14} /> +1 min
            </Button>
          )}

          {/* Fan button — only for devices with fan (Volcano) */}
          {caps?.hasFan && (
            <Button
              data-testid={`fan-button-${device.id}`}
              variant={device.state.fanOn ? "default" : "secondary"}
              size="icon"
              className={`h-12 w-12 transition-all duration-300 ${device.state.fanOn ? "bg-primary shadow-[0_0_10px_rgba(249,115,22,0.3)]" : "bg-muted/50"}`}
              onClick={() => sendCommand(device.id, { type: "toggle_fan" })}
              disabled={!device.state.connected}
              title={device.state.fanOn ? "Stop pump" : "Start pump"}
            >
              <Wind size={18} className={device.state.fanOn ? "animate-spin-slow" : "opacity-70"} />
            </Button>
          )}

          <Button
            data-testid={`power-button-${device.id}`}
            variant="secondary" size="icon"
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

        {/* Volcano / LED & Auto-Shutoff settings */}
        {(caps?.hasLed || caps?.hasAutoShutoff) && (
          <div className="space-y-4 bg-black/20 p-4 rounded-xl border border-white/5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-1.5">
              <Info size={10} /> Device Settings
            </span>

            {caps.hasLed && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sun size={10} /> LED Brightness
                  </span>
                  <span className="text-[10px] font-mono text-primary font-bold">{localLed}%</span>
                </div>
                <Slider min={0} max={100} step={5} value={[localLed]} onValueChange={handleSetLed}
                  disabled={!device.state.connected} className="w-full" />
              </div>
            )}

            {caps.hasAutoShutoff && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Timer size={10} /> Auto-Shutoff
                  </span>
                  <span className="text-[10px] font-mono text-primary font-bold">
                    {localShutoff === 0 ? "Off" : `${localShutoff} min`}
                  </span>
                </div>
                <Slider min={0} max={60} step={5} value={[localShutoff]} onValueChange={handleSetShutoff}
                  disabled={!device.state.connected} className="w-full" />
                <p className="text-[9px] text-muted-foreground/60">0 = disabled · max. 60 minutes</p>
              </div>
            )}

            {(device.state.firmwareVersion || device.state.serial) && (
              <div className="flex flex-wrap gap-3 pt-1 border-t border-white/5">
                {device.state.firmwareVersion && (
                  <span className="text-[9px] font-mono text-muted-foreground/50">FW {device.state.firmwareVersion}</span>
                )}
                {device.state.serial && (
                  <span className="text-[9px] font-mono text-muted-foreground/50">S/N {device.state.serial}</span>
                )}
              </div>
            )}
          </div>
        )}

        {isVolcano && (
          <VolcanoRoutines deviceId={device.id} connected={device.state.connected}
            onSendCommand={(cmd) => sendCommand(device.id, cmd)} />
        )}
      </CardContent>
    </Card>
  );
}

// ─── GroupCard (extracted to avoid hooks-in-loop) ────────────────────────────

interface GroupCardProps {
  group: DeviceGroup;
  connectedDevices: ConnectedDevice[];
  connectedIds: string[];
  onDelete: (id: string) => void;
  onRemoveMember: (groupId: string, deviceId: string) => void;
}

function GroupCard({ group, connectedDevices, connectedIds, onDelete, onRemoveMember }: GroupCardProps) {
  const { sendCommand } = useDevices();
  const { settings } = useSettings();

  const members = connectedDevices.filter(d => group.deviceIds.includes(d.id));
  const activeMembers = group.deviceIds.filter(id => connectedIds.includes(id));
  const hasFanMember = members.some(d => d.adapter.capabilities?.hasFan);

  const mins = members.map(d => DEVICE_TEMP_RANGES[d.deviceType].min);
  const maxs = members.map(d => DEVICE_TEMP_RANGES[d.deviceType].max);
  const range = members.length > 0
    ? { min: Math.max(...mins), max: Math.min(...maxs), step: 1 }
    : { min: 100, max: 230, step: 1 };

  const [groupTemp, setGroupTemp] = useState(Math.round((range.min + range.max) / 2));

  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-medium">{group.name}</CardTitle>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {activeMembers.length}/{group.deviceIds.length} connected
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/50 hover:text-destructive"
            onClick={() => onDelete(group.id)}
          >
            <Trash2 size={13} />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {group.deviceIds.map(id => {
            const d = connectedDevices.find(x => x.id === id);
            return (
              <div key={id} className="flex items-center gap-1 bg-black/20 rounded px-2 py-0.5 border border-white/5">
                <span className={`w-1.5 h-1.5 rounded-full ${connectedIds.includes(id) ? "bg-primary" : "bg-muted"}`} />
                <span className="text-[10px] text-muted-foreground">{d?.displayName ?? id.slice(0, 8)}</span>
                <button onClick={() => onRemoveMember(group.id, id)} className="ml-1 text-muted-foreground/40 hover:text-destructive">
                  <X size={9} />
                </button>
              </div>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
            <span>{formatTemp(range.min, settings.tempUnit)}</span>
            <span className="text-primary font-bold">{formatTemp(groupTemp, settings.tempUnit)}</span>
            <span>{formatTemp(range.max, settings.tempUnit)}</span>
          </div>
          <Slider
            min={range.min} max={range.max} step={range.step}
            value={[groupTemp]}
            onValueChange={([v]) => {
              setGroupTemp(v);
              activeMembers.forEach(id => sendCommand(id, { type: "set_temperature", value: v }));
            }}
            disabled={activeMembers.length === 0}
            className="w-full"
          />
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1 h-9 gap-1.5 text-xs font-bold uppercase tracking-wide"
            onClick={() => activeMembers.forEach(id => sendCommand(id, { type: "toggle_heat" }))}
            disabled={activeMembers.length === 0}
          >
            <Flame size={13} /> Heat All Up
          </Button>
          <Button variant="secondary" size="sm" className="flex-1 h-9 gap-1.5 text-xs font-bold uppercase tracking-wide"
            onClick={() => activeMembers.forEach(id => sendCommand(id, { type: "power_off" }))}
            disabled={activeMembers.length === 0}
          >
            <PowerOff size={13} /> Stop All
          </Button>
          {hasFanMember && (
            <Button variant="outline" size="sm" className="h-9 px-3 gap-1.5 text-xs"
              onClick={() => {
                const volcanoIds = group.deviceIds.filter(id => {
                  const d = connectedDevices.find(x => x.id === id);
                  return d?.adapter.capabilities?.hasFan && connectedIds.includes(id);
                });
                volcanoIds.forEach(id => sendCommand(id, { type: "toggle_fan" }));
              }}
              disabled={activeMembers.length === 0}
            >
              <Wind size={13} /> Fan
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── GroupPanel ───────────────────────────────────────────────────────────────

function GroupPanel({ connectedDevices }: { connectedDevices: ConnectedDevice[] }) {
  const { groups, createGroup, renameGroup, deleteGroup, removeFromGroup, sendGroupCommand } = useGroups();
  const { sendCommand } = useDevices();
  const { settings } = useSettings();
  const [collapsed, setCollapsed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);

  const connectedIds = connectedDevices.map(d => d.id);

  const handleCreate = () => {
    if (!newGroupName.trim() || selectedDevices.length === 0) return;
    createGroup(newGroupName.trim(), selectedDevices);
    setNewGroupName(""); setSelectedDevices([]); setShowCreate(false);
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <button
          className="flex items-center gap-2 text-sm font-bold tracking-wide uppercase text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setCollapsed(c => !c)}
        >
          <Users size={14} />
          Groups
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          {groups.length > 0 && (
            <span className="ml-1 text-[10px] bg-primary/20 text-primary rounded px-1.5 py-0.5">{groups.length}</span>
          )}
        </button>
        {!collapsed && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7 text-primary/70 hover:text-primary"
            onClick={() => setShowCreate(s => !s)}
          >
            <UserPlus size={12} /> New Group
          </Button>
        )}
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
            {showCreate && (
              <div className="mb-4 p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-primary font-semibold">New Group</p>
                <input
                  className="w-full bg-black/30 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  placeholder="Group name"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                />
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">Select devices:</p>
                  {connectedDevices.map(d => (
                    <label key={d.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={selectedDevices.includes(d.id)}
                        onChange={e => {
                          setSelectedDevices(prev =>
                            e.target.checked ? [...prev, d.id] : prev.filter(id => id !== d.id)
                          );
                        }}
                        className="accent-primary"
                      />
                      <span className="text-xs">{d.displayName}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-8 text-xs" onClick={handleCreate}
                    disabled={!newGroupName.trim() || selectedDevices.length === 0}
                  >
                    <Check size={12} className="mr-1" /> Create
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {groups.length === 0 && !showCreate && (
              <div className="text-center py-8 text-muted-foreground/50 text-sm">
                No groups yet — create one to control devices together
              </div>
            )}

            <div className="space-y-3">
              {groups.map(group => (
                <GroupCard
                  key={group.id}
                  group={group}
                  connectedDevices={connectedDevices}
                  connectedIds={connectedIds}
                  onDelete={deleteGroup}
                  onRemoveMember={removeFromGroup}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── PreviouslyConnected bar ──────────────────────────────────────────────────

function PreviouslyConnectedBar() {
  const { knownDevices, reconnectKnownDevice, isConnecting, devices } = useDevices();

  const notCurrentlyConnected = knownDevices.filter(
    k => !devices.some(d => d.id === k.id)
  );

  if (notCurrentlyConnected.length === 0) return null;

  return (
    <div className="mb-6 p-4 rounded-xl border border-border/40 bg-card/60 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <History size={13} className="text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Previously Connected</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {notCurrentlyConnected.map(known => (
          <button
            key={known.id}
            onClick={() => reconnectKnownDevice(known)}
            disabled={isConnecting}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/40 bg-black/20 hover:border-primary/40 hover:bg-primary/5 transition-all text-sm disabled:opacity-50"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
            <span className="font-medium">{known.name}</span>
            <span className="text-[9px] text-muted-foreground/60 font-mono uppercase">{known.deviceType.replace(/_/g, " ")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { devices, isConnecting, connectDevice, bluetoothSupported, bluetoothUnsupportedReason } = useDevices();
  const { settings } = useSettings();
  const [showPicker, setShowPicker] = useState(false);
  const adapters = getAllAdapters();

  const handleSelectDevice = (deviceType: VaporizerType) => {
    const adapter = adapters.find(a => a.deviceType === deviceType);
    if (adapter) connectDevice(adapter);
  };

  const handleAutoScan = useCallback(() => {
    connectDevice();
  }, [connectDevice]);

  const showWidget = (id: string) => settings.dashboardWidgets.includes(id);
  const multiDevice = devices.length >= 2;

  return (
    <div className={`p-4 md:p-6 lg:p-8 max-w-7xl mx-auto min-h-[calc(100vh-4rem)] md:min-h-screen ${multiDevice ? "pt-16" : ""}`}>
      <DevicePickerModal open={showPicker} onClose={() => setShowPicker(false)} onSelect={handleSelectDevice} />

      {/* Multi-device battery strip */}
      {multiDevice && <BatteryStrip devices={devices} />}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 data-testid="page-title-dashboard" className="text-3xl font-bold tracking-tight mb-1">Dashboard</h1>
          <p className="text-sm text-muted-foreground font-mono">
            {devices.length === 0 ? "STATUS: NO DEVICES" : `STATUS: ${devices.length} DEVICE${devices.length > 1 ? "S" : ""} ONLINE`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            data-testid="connect-device-btn"
            onClick={handleAutoScan}
            disabled={isConnecting || !bluetoothSupported}
            className="gap-2 bg-primary text-primary-foreground shadow-[0_0_10px_rgba(249,115,22,0.2)] hover:shadow-[0_0_20px_rgba(249,115,22,0.4)] transition-all font-bold tracking-wider uppercase text-xs"
          >
            {isConnecting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-current border-r-transparent rounded-full animate-spin" />
                SCANNING...
              </span>
            ) : (
              <><Scan size={15} /> Scan for Devices</>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowPicker(true)}
            disabled={isConnecting || !bluetoothSupported}
            className="gap-2 text-xs h-9 border-border/50 text-muted-foreground hover:text-foreground"
            title="Manual device type selection"
          >
            <Plus size={14} /> Manual
          </Button>
        </div>
      </div>

      {!bluetoothSupported && (
        <Card className="mb-8 border-destructive/30 bg-destructive/5 shadow-none">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
                <Bluetooth className="text-destructive" size={20} />
              </div>
              <div>
                <p className="font-bold text-destructive tracking-wide uppercase text-sm mb-1">Bluetooth Not Available</p>
                <p className="text-sm text-muted-foreground mb-3">{bluetoothUnsupportedReason}</p>
                <div className="bg-black/20 p-3 rounded border border-white/5">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">iOS users:</strong> Download <strong className="text-foreground">Bluefy</strong> from the App Store for Web Bluetooth support.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Previously connected bar */}
      <PreviouslyConnectedBar />

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
          <h2 className="text-xl font-bold tracking-tight mb-3">Waiting for Connection</h2>
          <p className="text-sm text-muted-foreground max-w-md mb-8 leading-relaxed">
            Connect your vaporizers — Volcano, Venty, Puffco, Carta Sport and more. Full telemetry and precise control.
          </p>
          <div className="flex gap-3">
            <Button
              data-testid="connect-first-device-btn"
              onClick={handleAutoScan}
              disabled={isConnecting || !bluetoothSupported}
              size="lg"
              className="gap-2 bg-primary text-primary-foreground shadow-[0_0_15px_rgba(249,115,22,0.4)] hover:shadow-[0_0_25px_rgba(249,115,22,0.6)] font-bold tracking-wider uppercase text-xs"
            >
              <Scan size={18} /> Scan for Devices
            </Button>
            <Button
              variant="outline" size="lg"
              onClick={() => setShowPicker(true)}
              disabled={isConnecting || !bluetoothSupported}
              className="gap-2 text-xs border-border/50"
            >
              <Plus size={18} /> Manual
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <AnimatePresence>
              {showWidget("device_cards") && devices.map((device, i) => (
                <motion.div key={device.id}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4, delay: i * 0.1, ease: "easeOut" }}
                >
                  <DeviceCard device={device} multiDevice={multiDevice} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {devices.length > 0 && <GroupPanel connectedDevices={devices} />}
        </>
      )}
    </div>
  );
}
