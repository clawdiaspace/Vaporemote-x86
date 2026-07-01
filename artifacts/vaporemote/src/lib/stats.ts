import type { VaporizerType } from "./bluetooth";

export interface Session {
  id: string;
  deviceId: string;
  deviceType: VaporizerType;
  deviceName: string;
  startedAt: number;
  endedAt?: number;
  peakTemp: number;
  targetTemp: number;
  avgTemp: number;
  durationSeconds: number;
  tempReadings: Array<{ timestamp: number; temp: number }>;
}

export interface DeviceStats {
  deviceId: string;
  deviceType: VaporizerType;
  deviceName: string;
  totalSessions: number;
  totalMinutes: number;
  avgSessionMinutes: number;
  favoriteTempC: number;
  lastUsed: number;
}

const SESSIONS_KEY = "vaporemote_sessions";
const SETTINGS_KEY = "vaporemote_settings";

export function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveSessions(sessions: Session[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(-500)));
  } catch { /* quota */ }
}

export function startSession(
  deviceId: string,
  deviceType: VaporizerType,
  deviceName: string,
  targetTemp: number
): Session {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    deviceId,
    deviceType,
    deviceName,
    startedAt: Date.now(),
    peakTemp: 0,
    targetTemp,
    avgTemp: 0,
    durationSeconds: 0,
    tempReadings: [],
  };
}

export function updateSession(session: Session, currentTemp: number): Session {
  const now = Date.now();
  const readings = [...session.tempReadings, { timestamp: now, temp: currentTemp }];
  const totalTemp = readings.reduce((s, r) => s + r.temp, 0);
  return {
    ...session,
    peakTemp: Math.max(session.peakTemp, currentTemp),
    avgTemp: totalTemp / readings.length,
    durationSeconds: (now - session.startedAt) / 1000,
    tempReadings: readings,
  };
}

export function endSession(session: Session): Session {
  return {
    ...session,
    endedAt: Date.now(),
    durationSeconds: (Date.now() - session.startedAt) / 1000,
  };
}

export function getDeviceStats(sessions: Session[]): DeviceStats[] {
  const map = new Map<string, Session[]>();
  for (const s of sessions) {
    if (!map.has(s.deviceId)) map.set(s.deviceId, []);
    map.get(s.deviceId)!.push(s);
  }

  return Array.from(map.entries()).map(([deviceId, deviceSessions]) => {
    const totalSeconds = deviceSessions.reduce((s, d) => s + d.durationSeconds, 0);
    const avgTarget =
      deviceSessions.reduce((s, d) => s + d.targetTemp, 0) / deviceSessions.length;
    const lastSession = deviceSessions.sort((a, b) => b.startedAt - a.startedAt)[0];
    return {
      deviceId,
      deviceType: lastSession.deviceType,
      deviceName: lastSession.deviceName,
      totalSessions: deviceSessions.length,
      totalMinutes: Math.round(totalSeconds / 60),
      avgSessionMinutes: Math.round(totalSeconds / deviceSessions.length / 60 * 10) / 10,
      favoriteTempC: Math.round(avgTarget),
      lastUsed: lastSession.startedAt,
    };
  });
}

export function getWeeklyData(sessions: Session[]): Array<{ day: string; sessions: number; minutes: number }> {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const dayKey = d.toDateString();
    const daySessions = sessions.filter(s => new Date(s.startedAt).toDateString() === dayKey);
    return {
      day: days[d.getDay()],
      sessions: daySessions.length,
      minutes: Math.round(daySessions.reduce((s, d) => s + d.durationSeconds, 0) / 60),
    };
  });
}

export interface AppSettings {
  tempUnit: "C" | "F";
  dashboardWidgets: string[];
  darkMode: boolean;
  geekMode: boolean;
  autoReconnect: boolean;
  notificationsEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  tempUnit: "C",
  dashboardWidgets: ["device_cards", "active_temp", "battery", "session_timer", "quick_actions"],
  darkMode: true,
  geekMode: false,
  autoReconnect: true,
  notificationsEnabled: false,
};

export const ALL_WIDGETS = [
  { id: "device_cards",    label: "Device Cards",      description: "Connected device overview" },
  { id: "active_temp",     label: "Live Temperature",  description: "Real-time temperature gauge" },
  { id: "battery",         label: "Battery Status",    description: "Battery levels for all devices" },
  { id: "session_timer",   label: "Session Timer",     description: "Current session duration" },
  { id: "quick_actions",   label: "Quick Actions",     description: "Heat/fan/power controls" },
  { id: "weekly_chart",    label: "Weekly Overview",   description: "Sessions this week" },
  { id: "last_session",    label: "Last Session",      description: "Summary of last session" },
  { id: "temp_history",    label: "Temp History",      description: "Temperature trend chart" },
];

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

export function saveSettings(settings: AppSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
  catch { /* quota */ }
}

export function formatTemp(celsius: number, unit: "C" | "F"): string {
  if (unit === "F") return `${Math.round(celsius * 9 / 5 + 32)}°F`;
  return `${Math.round(celsius)}°C`;
}
