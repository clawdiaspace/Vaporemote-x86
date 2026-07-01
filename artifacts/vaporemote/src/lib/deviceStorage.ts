import type { VaporizerType } from "./bluetooth";

const KNOWN_DEVICES_KEY   = "vaporemote_known_devices";
const DEVICE_SETTINGS_KEY = "vaporemote_device_settings";
const GROUPS_KEY          = "vaporemote_groups";

export interface KnownDevice {
  id: string;
  deviceType: VaporizerType;
  name: string;
  lastSeen: number;
}

export interface PersistedDeviceSettings {
  targetTemperature?: number;
  ledBrightness?: number;
  autoShutoffMinutes?: number;
  boostTemperature?: number;
}

export interface DeviceGroup {
  id: string;
  name: string;
  deviceIds: string[];
}

// ─── Known devices ────────────────────────────────────────────────────────────

export function loadKnownDevices(): KnownDevice[] {
  try {
    const raw = localStorage.getItem(KNOWN_DEVICES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveKnownDevice(id: string, deviceType: VaporizerType, name: string): void {
  try {
    const existing = loadKnownDevices().filter(d => d.id !== id);
    const updated: KnownDevice[] = [
      ...existing,
      { id, deviceType, name, lastSeen: Date.now() },
    ];
    localStorage.setItem(KNOWN_DEVICES_KEY, JSON.stringify(updated.slice(-20)));
  } catch { /* quota */ }
}

export function removeKnownDevice(id: string): void {
  try {
    const updated = loadKnownDevices().filter(d => d.id !== id);
    localStorage.setItem(KNOWN_DEVICES_KEY, JSON.stringify(updated));
  } catch { /* quota */ }
}

// ─── Per-device settings ──────────────────────────────────────────────────────

export function loadDeviceSettings(deviceId: string): PersistedDeviceSettings {
  try {
    const raw = localStorage.getItem(`${DEVICE_SETTINGS_KEY}_${deviceId}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveDeviceSettings(deviceId: string, settings: PersistedDeviceSettings): void {
  try {
    localStorage.setItem(`${DEVICE_SETTINGS_KEY}_${deviceId}`, JSON.stringify(settings));
  } catch { /* quota */ }
}

// ─── Groups ───────────────────────────────────────────────────────────────────

export function loadGroups(): DeviceGroup[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveGroups(groups: DeviceGroup[]): void {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  } catch { /* quota */ }
}
