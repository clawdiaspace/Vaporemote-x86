import type { VaporizerAdapter, DeviceState, VaporizerCommand } from "../bluetooth";
import { connectWithServiceFallback } from "./utils";

const CARTA_SERVICE     = "0000fee9-0000-1000-8000-00805f9b34fb";
const CARTA_WRITE_CHAR  = "d44bc439-abfd-45a2-b575-925416129600";
const CARTA_NOTIFY_CHAR = "d44bc439-abfd-45a2-b575-925416129601";

const CMD_GET_STATUS   = new Uint8Array([0xef, 0x01, 0x00]);
const CMD_HEAT_ON      = new Uint8Array([0xef, 0x05, 0x01]);
const CMD_HEAT_OFF     = new Uint8Array([0xef, 0x05, 0x00]);

function parseCartaPacket(data: DataView): Partial<DeviceState> & { rawData?: Record<string, unknown> } {
  if (data.byteLength < 3) return {};
  const cmd = data.getUint8(1);
  const val = data.getUint8(2);

  if (cmd === 0x06) {
    const tempRaw = data.byteLength >= 4 ? (data.getUint8(2) << 8) | data.getUint8(3) : 0;
    return {
      temperature: tempRaw / 10,
      rawData: { cmd: `0x${cmd.toString(16)}`, raw: tempRaw },
    };
  }
  if (cmd === 0x05) {
    return {
      isHeating: val === 1,
      rawData: { cmd: `0x${cmd.toString(16)}`, heat: val },
    };
  }
  if (cmd === 0x07) {
    const targetRaw = data.byteLength >= 4 ? (data.getUint8(2) << 8) | data.getUint8(3) : 0;
    return {
      targetTemperature: targetRaw / 10,
      rawData: { cmd: `0x${cmd.toString(16)}`, target_raw: targetRaw },
    };
  }
  if (cmd === 0x0a) {
    return {
      batteryLevel: val,
      rawData: { cmd: `0x${cmd.toString(16)}`, battery: val },
    };
  }
  return { rawData: { cmd: `0x${cmd.toString(16)}`, value: val } };
}

function buildSetTempCommand(celsius: number): Uint8Array {
  const raw = Math.round(celsius * 10);
  return new Uint8Array([0xef, 0x07, (raw >> 8) & 0xff, raw & 0xff]);
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
    connected: false,
    temperature: null,
    targetTemperature: null,
    isHeating: false,
    batteryLevel: null,
    mode: "conduction",
    rawData: {},
  };

  async function send(data: Uint8Array): Promise<void> {
    if (!writeChar) return;
    try { await writeChar.writeValueWithoutResponse(data); }
    catch (e) { console.error("Carta write error:", e); }
  }

  return {
    deviceType,
    displayName,
    manufacturer: "Focus V",
    serviceUUIDs: [CARTA_SERVICE, "6e400001-b5a3-f393-e0a9-e50e24dcca9e"],
    nameFilter,

    async connect(device) {
      const conn = await connectWithServiceFallback(device, CARTA_SERVICE,
        ["6e400001-b5a3-f393-e0a9-e50e24dcca9e"]);
      server = conn.server;
      service = conn.service;
      if (!service) { cached = { ...cached, connected: true }; return { ...cached }; }
      try {
        writeChar = await service.getCharacteristic(CARTA_WRITE_CHAR);
        notifyChar = await service.getCharacteristic(CARTA_NOTIFY_CHAR);
      } catch { cached = { ...cached, connected: true }; return { ...cached }; }

      await notifyChar.startNotifications();
      notifyHandler = (e) => {
        const char = e.target as BluetoothRemoteGATTCharacteristic;
        const parsed = parseCartaPacket(char.value!);
        cached = {
          ...cached,
          ...parsed,
          rawData: { ...cached.rawData, ...(parsed.rawData ?? {}) },
        };
        subscribers.forEach(cb => cb({ ...cached }));
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
          await send(buildSetTempCommand(cmd.value ?? 200));
          break;
        case "toggle_heat":
          await send(cached.isHeating ? CMD_HEAT_OFF : CMD_HEAT_ON);
          cached.isHeating = !cached.isHeating;
          break;
        case "power_off":
          await send(CMD_HEAT_OFF);
          cached.isHeating = false;
          break;
      }
      subscribers.forEach(cb => cb({ ...cached }));
    },

    subscribeToUpdates(cb) {
      subscribers.push(cb);
      return () => { const i = subscribers.indexOf(cb); if (i >= 0) subscribers.splice(i, 1); };
    },

    async getRawData() { return cached.rawData ?? {}; },
  };
}

export function createCartaAdapter(): VaporizerAdapter {
  return createCartaAdapterBase("focus_carta", "Carta", ["CARTA", "Focus V Carta"]);
}

export function createCartaSportAdapter(): VaporizerAdapter {
  return createCartaAdapterBase("focus_carta_sport", "Carta Sport", ["CARTA SPORT", "Carta Sport"]);
}
