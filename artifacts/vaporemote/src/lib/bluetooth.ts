export interface BLEDeviceInfo {
  id: string;
  name: string;
  deviceType: VaporizerType;
  connected: boolean;
  lastSeen?: Date;
  rssi?: number;
}

export type VaporizerType =
  | "volcano_hybrid"
  | "volcano_classic"
  | "venty"
  | "crafty_plus"
  | "puffco_peak"
  | "puffco_peak_pro"
  | "focus_carta"
  | "focus_carta_sport"
  | "dr_dabber_switch"
  | "dr_dabber_boost_evo"
  | "arizer_solo"
  | "arizer_air"
  | "pax3"
  | "davinci_iq2"
  | "unknown";

export type HeatingMode = "conduction" | "convection" | "hybrid" | "boost";

export interface DeviceState {
  connected: boolean;
  temperature: number | null;
  targetTemperature: number | null;
  isHeating: boolean;
  batteryLevel: number | null;
  mode: HeatingMode | null;
  sessionTime?: number;
  fanSpeed?: number;
  fanOn?: boolean;
  boostActive?: boolean;
  boostTemperature?: number | null;
  activeProfile?: number | null;
  // Volcano Hybrid extended state
  isReady?: boolean;        // at target temperature
  isCharging?: boolean;     // battery charging
  ledBrightness?: number | null;
  autoShutoffMinutes?: number | null;
  firmwareVersion?: string | null;
  serial?: string | null;
  rawData?: Record<string, unknown>;
}

export const DEFAULT_DEVICE_STATE: DeviceState = {
  connected: false,
  temperature: null,
  targetTemperature: null,
  isHeating: false,
  batteryLevel: null,
  mode: null,
};

export interface VaporizerCommand {
  type:
    | "set_temperature"
    | "set_boost_temperature"
    | "set_fan_speed"
    | "toggle_heat"
    | "toggle_fan"
    | "boost"
    | "power_off"
    | "set_profile"
    | "set_led_brightness"
    | "set_auto_shutoff";
  value?: number;
}

export interface VaporizerAdapter {
  deviceType: VaporizerType;
  displayName: string;
  manufacturer: string;
  serviceUUIDs: string[];
  nameFilter?: string | string[];
  connect(device: BluetoothDevice): Promise<DeviceState>;
  disconnect(): Promise<void>;
  getState(): Promise<DeviceState>;
  sendCommand(cmd: VaporizerCommand): Promise<void>;
  subscribeToUpdates(callback: (state: DeviceState) => void): () => void;
  getRawData?(): Promise<Record<string, unknown>>;
}

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function getUnsupportedReason(): string | null {
  if (typeof navigator === "undefined") return "Not in browser context";
  if (!("bluetooth" in navigator)) {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) {
      return "iOS Safari does not support Web Bluetooth. Use the Bluefy app from the App Store, or a Chrome-based browser on Android/Desktop.";
    }
    if (/Firefox/.test(ua)) {
      return "Firefox does not support Web Bluetooth. Please use Chrome or Edge.";
    }
    if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
      return "Safari does not support Web Bluetooth. Please use Chrome or Edge.";
    }
    return "Your browser does not support Web Bluetooth API. Please use Chrome or Edge on Desktop/Android.";
  }
  return null;
}

export async function requestBluetoothDeviceForAdapter(
  adapter: VaporizerAdapter
): Promise<BluetoothDevice | null> {
  if (!isWebBluetoothSupported()) return null;

  try {
    return await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: adapter.serviceUUIDs,
    });
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "NotFoundError") return null;
    throw e;
  }
}

export async function requestBluetoothDevice(
  adapters: VaporizerAdapter[]
): Promise<{ device: BluetoothDevice; adapter: VaporizerAdapter } | null> {
  if (!isWebBluetoothSupported()) return null;

  const allServiceUUIDs = Array.from(
    new Set(adapters.flatMap((a) => a.serviceUUIDs))
  );

  const nameFilters: BluetoothLEScanFilter[] = [];
  for (const adapter of adapters) {
    if (adapter.nameFilter) {
      const names = Array.isArray(adapter.nameFilter)
        ? adapter.nameFilter
        : [adapter.nameFilter];
      for (const n of names) {
        nameFilters.push({ namePrefix: n });
      }
    }
  }

  const filters: BluetoothRequestDeviceFilter[] =
    nameFilters.length > 0 ? nameFilters : [{}];

  try {
    const device = await navigator.bluetooth.requestDevice({
      filters,
      optionalServices: allServiceUUIDs,
    });

    const adapter = detectAdapter(device, adapters);
    return { device, adapter };
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "NotFoundError") return null;
    throw e;
  }
}

export function detectAdapter(
  device: BluetoothDevice,
  adapters: VaporizerAdapter[]
): VaporizerAdapter {
  const name = device.name?.toLowerCase() ?? "";

  for (const adapter of adapters) {
    if (!adapter.nameFilter) continue;
    const filters = Array.isArray(adapter.nameFilter)
      ? adapter.nameFilter
      : [adapter.nameFilter];
    for (const f of filters) {
      if (name.startsWith(f.toLowerCase())) return adapter;
    }
  }

  const unknownIdx = adapters.findIndex((a) => a.deviceType === "unknown");
  return unknownIdx >= 0 ? adapters[unknownIdx] : adapters[0];
}

export function generateDeviceId(device: BluetoothDevice): string {
  return device.id || `ble-${device.name}-${Date.now()}`;
}
