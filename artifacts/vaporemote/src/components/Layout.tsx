import { Link, useLocation } from "wouter";
import { LayoutDashboard, Bluetooth, BarChart3, Settings, Terminal } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { useDevices } from "@/contexts/DeviceContext";
import { useEffect } from "react";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/devices", label: "Devices", icon: Bluetooth },
  { path: "/stats", label: "Statistics", icon: BarChart3 },
  { path: "/settings", label: "Settings", icon: Settings },
  { path: "/geek", label: "Geek", icon: Terminal },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { settings } = useSettings();
  const { devices } = useDevices();

  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [settings.darkMode]);

  const activePage = NAV_ITEMS.find(n => n.path === "/" ? location === "/" : location.startsWith(n.path))?.label || "VapoRemote";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Mobile Header Bar */}
      <header className="md:hidden flex items-center justify-between h-14 px-4 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center shadow-[0_0_10px_rgba(249,115,22,0.3)]">
            <span className="text-primary font-bold text-xs">V</span>
          </div>
          <span className="font-semibold">{activePage}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">
          <Bluetooth size={12} className={devices.length > 0 ? "text-primary" : ""} />
          <span>{devices.length}</span>
        </div>
      </header>

      <main className="flex-1 overflow-auto pb-20 md:pb-0 md:pl-64">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-card/80 backdrop-blur-lg border-t border-border z-50">
        <div className="flex items-center justify-around h-16 px-2">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const active = path === "/" ? location === "/" : location.startsWith(path);
            return (
              <Link key={path} href={path}>
                <button
                  data-testid={`nav-mobile-${label.toLowerCase()}`}
                  className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors ${
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon size={20} className={active ? "drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]" : ""} />
                  <span className="text-[10px] font-medium">{label}</span>
                </button>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 bg-sidebar border-r border-sidebar-border flex-col z-40">
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.5)] border border-primary/30">
              <span className="text-primary font-bold text-sm drop-shadow-[0_0_5px_rgba(249,115,22,0.8)]">V</span>
            </div>
            <div>
              <h1 className="font-bold text-sidebar-foreground text-lg leading-none tracking-tight">VapoRemote</h1>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Multi-device control</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const active = path === "/" ? location === "/" : location.startsWith(path);
            return (
              <Link key={path} href={path}>
                <button
                  data-testid={`nav-desktop-${label.toLowerCase()}`}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-left relative overflow-hidden ${
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r shadow-[0_0_8px_rgba(249,115,22,0.8)]" />}
                  <Icon size={18} className={active ? "drop-shadow-[0_0_5px_rgba(249,115,22,0.5)]" : ""} />
                  <span className="text-sm tracking-wide">{label}</span>
                  {label === "Geek" && (
                    <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded ${active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>PRO</span>
                  )}
                </button>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <p className="text-[10px] font-mono text-muted-foreground text-center opacity-50">VapoRemote v1.0.0-rc1</p>
        </div>
      </aside>
    </div>
  );
}
