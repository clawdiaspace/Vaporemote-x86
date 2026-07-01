import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { VaporizerType } from "@/lib/bluetooth";

interface DeviceInfo {
  type: VaporizerType;
  name: string;
  manufacturer: string;
  hint?: string;
}

const DEVICES: { group: string; color: string; items: DeviceInfo[] }[] = [
  {
    group: "Storz & Bickel",
    color: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    items: [
      { type: "volcano_hybrid", name: "Volcano Hybrid", manufacturer: "Storz & Bickel", hint: 'Advertises as "VOLCANO"' },
      { type: "venty",          name: "Venty",          manufacturer: "Storz & Bickel", hint: 'Advertises as "VY + Seriennummer"' },
      { type: "crafty_plus",    name: "Crafty+",        manufacturer: "Storz & Bickel", hint: 'Advertises as "CRAFTY"' },
    ],
  },
  {
    group: "Focus V",
    color: "bg-orange-500/10 border-orange-500/30 text-orange-400",
    items: [
      { type: "focus_carta_sport", name: "Carta Sport", manufacturer: "Focus V", hint: 'Advertises als "CARTA SPORT"' },
      { type: "focus_carta",       name: "Carta",       manufacturer: "Focus V", hint: 'Advertises als "CARTA"' },
    ],
  },
  {
    group: "Puffco",
    color: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    items: [
      { type: "puffco_peak_pro", name: "Peak Pro", manufacturer: "Puffco" },
      { type: "puffco_peak",     name: "Peak",     manufacturer: "Puffco" },
    ],
  },
  {
    group: "Dr. Dabber",
    color: "bg-purple-500/10 border-purple-500/30 text-purple-400",
    items: [
      { type: "dr_dabber_switch",    name: "Switch",   manufacturer: "Dr. Dabber" },
      { type: "dr_dabber_boost_evo", name: "Boost EVO",manufacturer: "Dr. Dabber" },
    ],
  },
  {
    group: "Arizer",
    color: "bg-green-500/10 border-green-500/30 text-green-400",
    items: [
      { type: "arizer_solo", name: "Solo 2", manufacturer: "Arizer" },
      { type: "arizer_air",  name: "Air 2",  manufacturer: "Arizer" },
    ],
  },
  {
    group: "Andere",
    color: "bg-zinc-500/10 border-zinc-500/30 text-zinc-400",
    items: [
      { type: "pax3",        name: "PAX 3",    manufacturer: "PAX" },
      { type: "davinci_iq2", name: "IQ2",      manufacturer: "DaVinci" },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (deviceType: VaporizerType) => void;
}

export default function DevicePickerModal({ open, onClose, onSelect }: Props) {
  const [hovered, setHovered] = useState<VaporizerType | null>(null);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg bg-[hsl(var(--background))] border-border/50 shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight">Gerät auswählen</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Wähle dein Gerät bevor du die Bluetooth-Suche öffnest. So wird die richtige Verbindung hergestellt.
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {DEVICES.map(group => (
            <div key={group.group}>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                {group.group}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map(device => (
                  <button
                    key={device.type}
                    onClick={() => { onSelect(device.type); onClose(); }}
                    onMouseEnter={() => setHovered(device.type)}
                    onMouseLeave={() => setHovered(null)}
                    className={`relative text-left rounded-xl border p-3 transition-all duration-200 group ${group.color} hover:scale-[1.02] active:scale-[0.98]`}
                  >
                    <p className="text-sm font-bold tracking-tight text-foreground">{device.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{device.manufacturer}</p>
                    {device.hint && hovered === device.type && (
                      <p className="text-[9px] text-muted-foreground/70 mt-1 font-mono leading-tight">{device.hint}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-border/20">
          <p className="text-[10px] text-muted-foreground/60 text-center">
            Nach der Auswahl öffnet sich der OS-Bluetooth-Dialog. Wähle dort dein Gerät aus der Liste.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
