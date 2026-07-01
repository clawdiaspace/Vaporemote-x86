import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "@/lib/stats";
import type { AppSettings } from "@/lib/stats";

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  toggleWidget: (widgetId: string) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const toggleWidget = useCallback((widgetId: string) => {
    setSettings(prev => {
      const widgets = prev.dashboardWidgets.includes(widgetId)
        ? prev.dashboardWidgets.filter(w => w !== widgetId)
        : [...prev.dashboardWidgets, widgetId];
      const next = { ...prev, dashboardWidgets: widgets };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    saveSettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, toggleWidget, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
