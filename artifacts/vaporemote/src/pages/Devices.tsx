import { useDevices } from "@/contexts/DeviceContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bluetooth, Plus, Trash2, Wifi, WifiOff, Battery, Zap, Activity } from "lucide-react";
import { DEVICE_MANUFACTURERS } from "@/lib/devices";

export default function Devices() {
  const { devices, isConnecting, connectDevice, disconnectDevice, bluetoothSupported } = useDevices();

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto min-h-[calc(100vh-4rem)] md:min-h-screen">
      <div className="flex items-center justify-between mb-8 border-b border-border/10 pb-4">
        <div>
          <h1 data-testid="page-title-devices" className="text-3xl font-bold tracking-tight mb-1">Fleet Management</h1>
          <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Active & Available Hardware</p>
        </div>
        <Button
          data-testid="add-device-btn"
          onClick={connectDevice}
          disabled={isConnecting || !bluetoothSupported}
          className="gap-2 bg-primary/10 text-primary border border-primary/30 hover:bg-primary hover:text-primary-foreground shadow-[0_0_10px_rgba(249,115,22,0.1)] transition-all font-bold tracking-wider text-xs uppercase"
        >
          {isConnecting ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-current border-r-transparent rounded-full animate-spin" />
              SCANNING
            </span>
          ) : (
            <>
              <Plus size={16} />
              Pair Hardware
            </>
          )}
        </Button>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
          <Activity size={16} className="text-primary" /> Active Links
        </h2>
        
        {devices.length === 0 ? (
          <Card className="border-border/30 bg-black/20 shadow-none border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Bluetooth size={32} className="text-muted-foreground/30 mb-4" />
              <p className="font-mono tracking-widest text-sm uppercase text-muted-foreground mb-1">No Hardware Paired</p>
              <p className="text-xs text-muted-foreground/60 font-mono">Initialize link to stream telemetry</p>
            </CardContent>
          </Card>
        ) : (
          devices.map(device => (
            <Card data-testid={`device-row-${device.id}`} key={device.id} className="border-border/50 bg-card overflow-hidden group">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="w-12 h-12 rounded bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 shadow-[0_0_10px_rgba(249,115,22,0.1)] relative">
                  <Zap size={20} className="text-primary drop-shadow-[0_0_5px_rgba(249,115,22,0.8)]" />
                  {device.state.isHeating && (
                    <div className="absolute inset-0 rounded border border-primary/50 animate-[ping_2s_ease-out_infinite]" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-1.5">
                    <p className="font-bold tracking-wide truncate text-lg">{device.displayName}</p>
                    <Badge variant="outline" className="text-[10px] font-mono border-white/10 bg-black/40">{device.manufacturer}</Badge>
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs font-mono font-bold text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      {device.state.connected ? (
                        <><Wifi size={12} className="text-primary" /> <span className="text-foreground">LINKED</span></>
                      ) : (
                        <><WifiOff size={12} className="opacity-50" /> <span className="opacity-50">OFFLINE</span></>
                      )}
                    </span>
                    
                    {device.state.batteryLevel !== null && (
                      <span className={`flex items-center gap-1.5 ${device.state.batteryLevel < 20 ? 'text-destructive' : ''}`}>
                        <Battery size={12} /> <span className="text-foreground">{device.state.batteryLevel}%</span>
                      </span>
                    )}
                    
                    {device.state.temperature !== null && (
                      <span className="flex items-center gap-1.5 border-l border-white/10 pl-4">
                        TEMP: <span className="text-primary drop-shadow-[0_0_2px_rgba(249,115,22,0.5)]">{Math.round(device.state.temperature)}°C</span>
                      </span>
                    )}
                  </div>
                </div>
                
                <Button
                  data-testid={`disconnect-btn-${device.id}`}
                  variant="outline"
                  size="icon"
                  className="shrink-0 w-10 h-10 text-destructive/70 border-destructive/20 bg-destructive/5 hover:text-destructive hover:bg-destructive/20 hover:border-destructive/40 transition-colors"
                  onClick={() => disconnectDevice(device.id)}
                >
                  <Trash2 size={16} />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="mt-12">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Supported Architectures</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { brand: "Storz & Bickel", models: ["Volcano Hybrid", "Venty", "Crafty+"] },
            { brand: "Puffco", models: ["Peak", "Peak Pro"] },
            { brand: "Focus V", models: ["Carta", "Carta Sport"] },
            { brand: "Dr. Dabber", models: ["Switch", "Boost EVO"] },
            { brand: "Arizer", models: ["Solo 2", "Air 2"] },
            { brand: "Others", models: ["PAX 3", "DaVinci IQ2"] },
          ].map(({ brand, models }) => (
            <Card key={brand} className="bg-black/20 border-border/30">
              <CardContent className="p-4">
                <p className="text-xs font-bold font-mono tracking-widest text-primary/80 mb-2 uppercase">{brand}</p>
                <div className="space-y-1">
                  {models.map(m => (
                    <p key={m} className="text-xs text-muted-foreground/80 font-mono flex items-center gap-2 before:content-[''] before:w-1 before:h-1 before:bg-white/20 before:rounded-full">{m}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
