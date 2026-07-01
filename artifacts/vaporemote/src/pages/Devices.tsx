import { useDevices } from "@/contexts/DeviceContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bluetooth, Trash2, Wifi, WifiOff, Battery, Zap, Activity, Link } from "lucide-react";
import { DEVICE_MANUFACTURERS } from "@/lib/devices";
import {
  createVolcanoHybridAdapter, createVentyAdapter, createCraftyPlusAdapter,
  createPuffcoPeakProAdapter, createPuffcoPeakAdapter,
  createCartaSportAdapter, createCartaAdapter,
  createDrDabberSwitchAdapter, createDrDabberBoostEvoAdapter,
  createArizerAirAdapter, createPax3Adapter, createDaVinciIQ2Adapter,
} from "@/lib/devices";
import type { VaporizerAdapter } from "@/lib/devices";

// ── Device catalogue ──────────────────────────────────────────────────────────
// bleHint = what the device is called in the system BLE picker
// (users need this info since the picker shows all nearby BLE devices)
const DEVICE_CATALOGUE: {
  brand: string;
  models: {
    label: string;
    bleHint: string;
    factory: () => VaporizerAdapter;
  }[];
}[] = [
  {
    brand: "Storz & Bickel",
    models: [
      { label: "Volcano Hybrid", bleHint: "VOLCANO HYBRID",   factory: createVolcanoHybridAdapter },
      { label: "Venty",          bleHint: "STORZ&BICKEL",     factory: createVentyAdapter },
      { label: "Crafty+",        bleHint: "STORZ&BICKEL",     factory: createCraftyPlusAdapter },
    ],
  },
  {
    brand: "Puffco",
    models: [
      { label: "Peak Pro",       bleHint: "Peak Pro",         factory: createPuffcoPeakProAdapter },
      { label: "Peak",           bleHint: "Peak",             factory: createPuffcoPeakAdapter },
    ],
  },
  {
    brand: "Focus V",
    models: [
      { label: "Carta Sport",    bleHint: "CARTA",            factory: createCartaSportAdapter },
      { label: "Carta",          bleHint: "CARTA",            factory: createCartaAdapter },
    ],
  },
  {
    brand: "Dr. Dabber",
    models: [
      { label: "Switch²",        bleHint: "SWITCH",           factory: createDrDabberSwitchAdapter },
      { label: "Boost EVO",      bleHint: "BOOST",            factory: createDrDabberBoostEvoAdapter },
    ],
  },
  {
    brand: "Arizer",
    models: [
      { label: "Air 2",          bleHint: "Arizer Air",       factory: createArizerAirAdapter },
    ],
  },
  {
    brand: "Other",
    models: [
      { label: "PAX 3",          bleHint: "PAX 3",            factory: createPax3Adapter },
      { label: "DaVinci IQ2",    bleHint: "IQ2",              factory: createDaVinciIQ2Adapter },
    ],
  },
];

export default function Devices() {
  const { devices, isConnecting, connectDevice, disconnectDevice, bluetoothSupported } = useDevices();

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto min-h-[calc(100vh-4rem)] md:min-h-screen space-y-10">

      {/* ── Header ── */}
      <div className="border-b border-border/10 pb-4">
        <h1 data-testid="page-title-devices" className="text-3xl font-bold tracking-tight mb-1">Geräte</h1>
        <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Bluetooth-Verbindungen verwalten</p>
      </div>

      {/* ── Active connections ── */}
      <section>
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Activity size={13} className="text-primary" /> Verbundene Geräte
        </h2>

        {devices.length === 0 ? (
          <Card className="border-border/30 bg-black/20 shadow-none border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <Bluetooth size={28} className="text-muted-foreground/30 mb-3" />
              <p className="font-mono tracking-widest text-xs uppercase text-muted-foreground">Kein Gerät verbunden</p>
              <p className="text-xs text-muted-foreground/50 font-mono mt-1">Wähle unten ein Modell aus</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {devices.map(device => (
              <Card data-testid={`device-row-${device.id}`} key={device.id} className="border-border/50 bg-card overflow-hidden">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 relative">
                    <Zap size={16} className="text-primary drop-shadow-[0_0_4px_rgba(249,115,22,0.8)]" />
                    {device.state.isHeating && (
                      <div className="absolute inset-0 rounded border border-primary/50 animate-[ping_2s_ease-out_infinite]" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-bold tracking-wide truncate">{device.displayName}</p>
                      <Badge variant="outline" className="text-[10px] font-mono border-white/10 bg-black/40">{device.manufacturer}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                      {device.state.connected
                        ? <span className="flex items-center gap-1"><Wifi size={11} className="text-primary" /> verbunden</span>
                        : <span className="flex items-center gap-1 opacity-40"><WifiOff size={11} /> getrennt</span>
                      }
                      {device.state.batteryLevel !== null && (
                        <span className={`flex items-center gap-1 ${device.state.batteryLevel < 20 ? "text-destructive" : ""}`}>
                          <Battery size={11} /> {device.state.batteryLevel}%
                        </span>
                      )}
                      {device.state.temperature !== null && (
                        <span className="text-primary">{Math.round(device.state.temperature)}°C</span>
                      )}
                    </div>
                  </div>

                  <Button
                    data-testid={`disconnect-btn-${device.id}`}
                    variant="outline"
                    size="icon"
                    className="shrink-0 w-9 h-9 text-destructive/70 border-destructive/20 bg-destructive/5 hover:text-destructive hover:bg-destructive/20 hover:border-destructive/40"
                    onClick={() => disconnectDevice(device.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Per-model connect grid ── */}
      <section>
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-2">
          <Link size={13} className="text-primary" /> Gerät verbinden
        </h2>
        <p className="text-[11px] text-muted-foreground/60 font-mono mb-5">
          Wähle dein Modell — der Browser öffnet dann die Bluetooth-Auswahl.
          Tippe dort auf den angezeigten Namen (Spalte&nbsp;<span className="text-foreground/70">»BLE-Name«</span>).
        </p>

        {!bluetoothSupported && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive font-mono mb-6">
            Bluetooth nicht verfügbar — nutze Chrome auf Android/Desktop oder Bluefy auf iOS.
          </div>
        )}

        <div className="space-y-6">
          {DEVICE_CATALOGUE.map(({ brand, models }) => (
            <div key={brand}>
              <p className="text-[10px] font-bold font-mono tracking-widest text-primary/70 uppercase mb-2">{brand}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {models.map(({ label, bleHint, factory }) => (
                  <button
                    key={label}
                    disabled={isConnecting || !bluetoothSupported}
                    onClick={() => connectDevice(factory())}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-border/30 bg-black/20 px-4 py-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-sm leading-tight truncate">{label}</p>
                      <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5 truncate">
                        BLE: <span className="text-muted-foreground">{bleHint}</span>
                      </p>
                    </div>
                    <span className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      {isConnecting
                        ? <span className="w-3 h-3 border-2 border-primary border-r-transparent rounded-full animate-spin" />
                        : <Bluetooth size={13} className="text-primary" />
                      }
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
