import { useSettings } from "@/contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ALL_WIDGETS } from "@/lib/stats";
import { Sun, LayoutDashboard, Terminal, RotateCcw, Settings as SettingsIcon } from "lucide-react";

export default function Settings() {
  const { settings, updateSettings, toggleWidget, resetSettings } = useSettings();

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto min-h-[calc(100vh-4rem)] md:min-h-screen">
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <SettingsIcon size={24} className="text-primary drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
          </div>
          <div>
            <h1 data-testid="page-title-settings" className="text-3xl font-bold tracking-tight mb-1">Preferences</h1>
            <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">System Configuration</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <Card className="border-border/50 bg-black/10 overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/10 bg-black/20">
            <CardTitle className="text-sm font-bold tracking-wider uppercase text-muted-foreground flex items-center gap-3">
              <Sun size={16} className="text-primary" /> Appearance
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg hover:bg-black/20 transition-colors">
              <div>
                <Label className="font-bold text-sm tracking-wide">Dark Mode</Label>
                <p className="text-xs text-muted-foreground mt-1 font-mono">FORCE HIGH-CONTRAST DARK THEME</p>
              </div>
              <Switch
                data-testid="toggle-dark-mode"
                checked={settings.darkMode}
                onCheckedChange={(v) => updateSettings({ darkMode: v })}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            <Separator className="bg-border/20 my-2" />

            <div className="flex items-center justify-between p-3 rounded-lg hover:bg-black/20 transition-colors">
              <div>
                <Label className="font-bold text-sm tracking-wide">Temperature Unit</Label>
                <p className="text-xs text-muted-foreground mt-1 font-mono">CELSIUS OR FAHRENHEIT BASELINE</p>
              </div>
              <div className="flex gap-2 bg-black/40 p-1 rounded-lg border border-white/5">
                <Button
                  data-testid="unit-celsius"
                  size="sm"
                  variant={settings.tempUnit === "C" ? "default" : "ghost"}
                  className={`w-14 font-bold ${settings.tempUnit === "C" ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(249,115,22,0.4)]" : "text-muted-foreground"}`}
                  onClick={() => updateSettings({ tempUnit: "C" })}
                >
                  °C
                </Button>
                <Button
                  data-testid="unit-fahrenheit"
                  size="sm"
                  variant={settings.tempUnit === "F" ? "default" : "ghost"}
                  className={`w-14 font-bold ${settings.tempUnit === "F" ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(249,115,22,0.4)]" : "text-muted-foreground"}`}
                  onClick={() => updateSettings({ tempUnit: "F" })}
                >
                  °F
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-black/10 overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/10 bg-black/20">
            <CardTitle className="text-sm font-bold tracking-wider uppercase text-muted-foreground flex items-center gap-3">
              <LayoutDashboard size={16} className="text-primary" /> Active Widgets
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-4 font-mono pl-3">CONFIGURE DASHBOARD LAYOUT</p>
            <div className="space-y-1">
              {ALL_WIDGETS.map(widget => {
                const isEnabled = settings.dashboardWidgets.includes(widget.id);
                return (
                  <div 
                    key={widget.id} 
                    className={`flex items-center justify-between p-4 rounded-lg transition-all duration-200 border-l-2 relative overflow-hidden group hover:bg-black/30
                      ${isEnabled ? "border-l-primary bg-black/20" : "border-l-transparent bg-transparent"}
                    `}
                  >
                    {isEnabled && (
                      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-primary/10 to-transparent pointer-events-none" />
                    )}
                    <div className="relative z-10">
                      <Label className={`font-bold text-sm tracking-wide ${isEnabled ? "text-foreground" : "text-muted-foreground"}`}>{widget.label}</Label>
                      <p className="text-xs text-muted-foreground/70 mt-1 font-mono uppercase">{widget.description}</p>
                    </div>
                    <Switch
                      data-testid={`toggle-widget-${widget.id}`}
                      checked={isEnabled}
                      onCheckedChange={() => toggleWidget(widget.id)}
                      className="data-[state=checked]:bg-primary relative z-10"
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-black/10 overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/10 bg-black/20">
            <CardTitle className="text-sm font-bold tracking-wider uppercase text-muted-foreground flex items-center gap-3">
              <Terminal size={16} className="text-primary" /> Advanced Protocol
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg hover:bg-black/20 transition-colors">
              <div>
                <Label className="font-bold text-sm tracking-wide">Geek Mode</Label>
                <p className="text-xs text-muted-foreground mt-1 font-mono">ENABLE DIAGNOSTICS & RAW BLE TERMINAL</p>
              </div>
              <Switch
                data-testid="toggle-geek-mode"
                checked={settings.geekMode}
                onCheckedChange={(v) => updateSettings({ geekMode: v })}
                className="data-[state=checked]:bg-primary"
              />
            </div>
            
            <Separator className="bg-border/20 my-2" />
            
            <div className="flex items-center justify-between p-3 rounded-lg hover:bg-black/20 transition-colors">
              <div>
                <Label className="font-bold text-sm tracking-wide">Auto Reconnect</Label>
                <p className="text-xs text-muted-foreground mt-1 font-mono">MAINTAIN CONTINUOUS PAIRING LINK</p>
              </div>
              <Switch
                data-testid="toggle-auto-reconnect"
                checked={settings.autoReconnect}
                onCheckedChange={(v) => updateSettings({ autoReconnect: v })}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/20 bg-black/10 overflow-hidden">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="font-bold text-sm tracking-wide text-destructive">Factory Reset</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">PURGE ALL LOCAL CONFIGURATIONS</p>
              </div>
              <Button
                data-testid="reset-settings-btn"
                variant="outline"
                size="sm"
                onClick={resetSettings}
                className="gap-2 text-destructive border-destructive/30 hover:bg-destructive hover:text-destructive-foreground transition-all w-full sm:w-auto"
              >
                <RotateCcw size={14} />
                <span className="uppercase tracking-widest font-bold text-xs">Execute Reset</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center py-6">
          <p className="text-[10px] font-mono font-bold text-muted-foreground/50 uppercase tracking-widest mb-1">VapoRemote Core v1.0.0-rc1</p>
          <p className="text-[10px] font-mono text-muted-foreground/40">iOS REQUIRES BLUEFY WEB BROWSER</p>
        </div>
      </div>
    </div>
  );
}
