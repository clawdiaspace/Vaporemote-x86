import type { VaporizerAdapter, DeviceState, VaporizerCommand } from "../bluetooth";
import { connectWithServiceFallback } from "./utils";

const CARTA_SERVICE     = "0000fee9-0000-1000-8000-00805f9b34fb";
const CARTA_WRITE_CHAR  = "d44bc439-abfd-45a2-b575-925416129600";
const CARTA_NOTIFY_CHAR = "d44bc439-abfd-45a2-b575-925416129601";

const CMD_GET_STATUS  = new Uint8Array([0xef, 0x01, 0x00]);
const CMD_HEAT_ON     = new Uint8Array([0xef, 0x05, 0x01]);
const CMD_HEAT_OFF    = new Uint8Array([0xef, 0x05, 0x00]);
const CMD_GET_BATTERY = new Uint8Array([0xef, 0x0a, 0x00]);
const CMD_GET_PROFILE = new Uint8Array([0xef, 0x02, 0x00]);

function buildSetTempCmd(celsius: number): Uint8Array {
  const raw = Math.round(celsius * 10);
  return new Uint8Array([0xef, 0x07, (raw >> 8) & 0xff, raw & 0xff]);
}

function buildSetProfileCmd(idx: number): Uint8Array {
  return new Uint8Array([0xef, 0x03, idx & 0xff]);
}

function buildSetTimerCmd(seconds: number): Uint8Array {
  return new Uint8Array([0xef, 0x09, Math.max(0, Math.min(255, seconds))]);
}

function buildSetLEDCmd(r: number, g: number, b: number): Uint8Array {
  return new Uint8Array([0xef, 0x0b, r & 0xff, g & 0xff, b & 0xff]);
}

function parseCartaPacket(data: DataView): Partial<DeviceState> & { rawData?: Record<string, unknown> } {
  if (data.byteLength < 3) return {};
  const cmd = data.getUint8(1);
  const val = data.getUint8(2);

  switch (cmd) {
    case 0x06: {
      const tempRaw = data.byteLength >= 4 ? (data.getUint8(2) << 8) | data.getUint8(3) : 0;
      return { temperature: tempRaw / 10, rawData: { cmd: `0x${cmd.toString(16)}`, temp_raw: tempRaw } };
    }
    case 0x05:
      return { isHeating: val === 1, rawData: { cmd: `0x${cmd.toString(16)}`, heat: val } };
    case 0x07: {
      const tgtRaw = data.byteLength >= 4 ? (data.getUint8(2) << 8) | data.getUint8(3) : 0;
      return { targetTemperature: tgtRaw / 10, rawData: { cmd: `0x${cmd.toString(16)}`, target_raw: tgtRaw } };
    }
    case 0x0a:
      return { batteryLevel: val, rawData: { cmd: `0x${cmd.toString(16)}`, battery: val } };
    case 0x02:
      return { activeProfile: val, rawData: { cmd: `0x${cmd.toString(16)}`, profile: val } };
    default:
      return { rawData: { cmd: `0x${cmd.toString(16)}`, value: val } };
  }
}

export interface CartaSportProfile {
  index:    number;
  name:     string;
  nameEn:   string;
  tempF:    number;
  tempC:    number;
  color:    string;
  rgb:      [number, number, number];
  duration: number;
}

export const CARTA_SPORT_PROFILES: CartaSportProfile[] = [
  { index: 0, name: "Blau",  nameEn: "Blue",   tempF: 480, tempC: 248.9, color: "#3b82f6", rgb: [ 30, 100, 255], duration: 60 },
  { index: 1, name: "Gelb",  nameEn: "Yellow", tempF: 495, tempC: 257.2, color: "#eab308", rgb: [255, 200,   0], duration: 55 },
  { index: 2, name: "Grün",  nameEn: "Green",  tempF: 515, tempC: 268.3, color: "#22c55e", rgb: [  0, 220,  80], duration: 50 },
  { index: 3, name: "Lila",  nameEn: "Purple", tempF: 535, tempC: 279.4, color: "#a855f7", rgb: [160,  50, 250], duration: 45 },
  { index: 4, name: "Rot",   nameEn: "Red",    tempF: 565, tempC: 296.1, color: "#ef4444", rgb: [255,  20,  20], duration: 40 },
];

export function createCartaAdapter(): VaporizerAdapter {
  return createCartaAdapterBase("focus_carta", "Carta", ["CARTA", "Focus V Carta"]);
}

export function createCartaSportAdapter(): VaporizerAdapter {
  return createCartaAdapterBase("focus_carta_sport", "Carta Sport", ["CARTA SPORT", "Carta Sport"]);
}

function createCartaAdapterBase(
  deviceType: "focus_carta" | "focus_carta_sport",
  displayName: string,
  nameFilter: string | string[]
): VaporizerAdapter {
  let server: BluetoothRemoteGATTServer | null = null;
  let service: BluetoothRemoteGATTService | null = null;
  let writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  let notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  const subscribers: Array<(s: DeviceState) => void> = [];
  let notifyHandler: ((e: Event) => void) | null = null;
  let pollingInterval: ReturnType<typeof setInterval> | null = null;

  let cached: DeviceState = {
    connected: false, temperature: null, targetTemperature: null,
    isHeating: false, batteryLevel: null, mode: "conduction",
    activeProfile: null, rawData: {},
  };

  async function send(data: Uint8Array): Promise<void> {
    if (!writeChar) return;
    try {
      try { await writeChar.writeValueWithoutResponse(data); }
      catch { await writeChar.writeValue(data); }
    } catch (e) { console.warn("Carta write:", e); }
  }

  function notify() { subscribers.forEach(cb => cb({ ...cached })); }

  return {
    deviceType,
    displayName,
    manufacturer: "Focus V",
    serviceUUIDs: [CARTA_SERVICE, "6e400001-b5a3-f393-e0a9-e50e24dcca9e"],
    nameFilter,
    capabilities: {
      hasHeat: true, hasFan: false, hasLed: true, hasAutoShutoff: false,
      hasBoost: false, hasProfiles: deviceType === "focus_carta_sport", hasBattery: false, hasCharging: false, hasWorkflows: false,
    },

    async connect(device) {
      const conn = await connectWithServiceFallback(device, CARTA_SERVICE,
        ["6e400001-b5a3-f393-e0a9-e50e24dcca9e"]);
      server = conn.server; service = conn.service;
      if (!service) { cached = { ...cached, connected: true }; return { ...cached }; }

      try {
        writeChar = await service.getCharacteristic(CARTA_WRITE_CHAR);
        notifyChar = await service.getCharacteristic(CARTA_NOTIFY_CHAR);
      } catch (e) {
        console.warn("Carta: char lookup failed", e);
        cached = { ...cached, connected: true };
        return { ...cached };
      }

      await notifyChar.startNotifications();
      notifyHandler = (e: Event) => {
        const char = e.target as BluetoothRemoteGATTCharacteristic;
        if (!char.value) return;
        const parsed = parseCartaPacket(char.value);
        cached = { ...cached, ...parsed, rawData: { ...cached.rawData, ...(parsed.rawData ?? {}) } };
        notify();
      };
      notifyChar.addEventListener("characteristicvaluechanged", notifyHandler);

      pollingInterval = setInterval(() => { send(CMD_GET_STATUS); }, 3000);

      await send(CMD_GET_STATUS);
      cached = { ...cached, connected: true };
      return { ...cached };
    },

    async disconnect() {
      if (pollingInterval) clearInterval(pollingInterval);
      if (notifyChar && notifyHandler) {
        notifyChar.removeEventListener("characteristicvaluechanged", notifyHandler);
        await notifyChar.stopNotifications().catch(() => {});
      }
      server?.disconnect();
      cached = { ...cached, connected: false };
    },

    async getState() { return { ...cached }; },

    async sendCommand(cmd: VaporizerCommand) {
      switch (cmd.type) {
        case "set_temperature":
          await send(buildSetTempCmd(cmd.value ?? 200));
          cached.targetTemperature = cmd.value ?? 200;
          cached.activeProfile = null;
          break;
        case "set_profile": {
          const idx = cmd.value ?? 0;
          const profile = CARTA_SPORT_PROFILES[idx];
          if (profile) {
            await send(buildSetTempCmd(profile.tempC));
            cached.targetTemperature = profile.tempC;
            cached.activeProfile = idx;
            const [r, g, b] = profile.rgb;
            await send(buildSetLEDCmd(r, g, b));
            await send(buildSetTimerCmd(profile.duration));
          }
          break;
        }
        case "set_session_duration": {
          const secs = Math.round(cmd.value ?? 60);
          await send(buildSetTimerCmd(secs));
          break;
        }
        case "toggle_heat":
          await send(cached.isHeating ? CMD_HEAT_OFF : CMD_HEAT_ON);
          cached.isHeating = !cached.isHeating;
          break;
        case "power_off":
          await send(CMD_HEAT_OFF);
          cached.isHeating = false;
          break;
      }
      notify();
    },

    subscribeToUpdates(cb) {
      subscribers.push(cb);
      return () => { const i = subscribers.indexOf(cb); if (i >= 0) subscribers.splice(i, 1); };
    },

    async getRawData() { return cached.rawData ?? {}; },
  };
}
