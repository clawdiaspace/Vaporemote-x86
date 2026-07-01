import type { VaporizerAdapter, DeviceState, VaporizerCommand } from "../bluetooth";
import { connectWithServiceFallback } from "./utils";

const SWITCH_SERVICE    = "000060aa-0000-1000-8000-00805f9b34fb";
const SWITCH_WRITE_CHAR = "0000eee1-0000-1000-8000-00805f9b34fb";
const SWITCH_READ_CHAR  = "0000eee2-0000-1000-8000-00805f9b34fb";

function encodeCmd(cmd: number, val?: number): Uint8Array {
  if (val !== undefined) {
    return new Uint8Array([0xaa, cmd, 0x02, val & 0xff, (val >> 8) & 0xff, 0x55]);
  }
  return new Uint8Array([0xaa, cmd, 0x00, 0x55]);
}

function createSwitchAdapter(
  deviceType: "dr_dabber_switch" | "dr_dabber_boost_evo",
  displayName: string,
  nameFilter: string | string[]
): VaporizerAdapter {
  let server: BluetoothRemoteGATTServer | null = null;
  let service: BluetoothRemoteGATTService | null = null;
  let writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  let readChar: BluetoothRemoteGATTCharacteristic | null = null;
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

  function parseResponse(data: DataView): Partial<DeviceState> & { rawData?: Record<string, unknown> } {
    if (data.byteLength < 4) return {};
    const cmd = data.getUint8(1);
    const raw: Record<string, unknown> = { response_cmd: `0x${cmd.toString(16)}` };

    if (cmd === 0x10) {
      const temp = data.getUint16(3, true);
      raw.temperature_raw = temp;
      return { temperature: temp / 10, rawData: raw };
    }
    if (cmd === 0x11) {
      const target = data.getUint16(3, true);
      raw.target_raw = target;
      return { targetTemperature: target / 10, rawData: raw };
    }
    if (cmd === 0x12) {
      const heat = data.getUint8(3);
      raw.heat = heat;
      return { isHeating: heat === 1, rawData: raw };
    }
    if (cmd === 0x20) {
      const batt = data.getUint8(3);
      raw.battery = batt;
      return { batteryLevel: batt, rawData: raw };
    }
    return { rawData: raw };
  }

  async function send(data: Uint8Array): Promise<void> {
    if (!writeChar) return;
    try { await writeChar.writeValueWithoutResponse(data); }
    catch (e) { console.error("Dr. Dabber write error:", e); }
  }

  return {
    deviceType,
    displayName,
    manufacturer: "Dr. Dabber",
    serviceUUIDs: [SWITCH_SERVICE],
    nameFilter,

    async connect(device) {
      const conn = await connectWithServiceFallback(device, SWITCH_SERVICE);
      server = conn.server;
      service = conn.service;
      if (!service) { cached = { ...cached, connected: true }; return { ...cached }; }
      try {
        writeChar = await service.getCharacteristic(SWITCH_WRITE_CHAR);
        readChar  = await service.getCharacteristic(SWITCH_READ_CHAR);
      } catch { cached = { ...cached, connected: true }; return { ...cached }; }

      await readChar.startNotifications();
      notifyHandler = (e) => {
        const ch = e.target as BluetoothRemoteGATTCharacteristic;
        const parsed = parseResponse(ch.value!);
        cached = {
          ...cached,
          ...parsed,
          rawData: { ...cached.rawData, ...(parsed.rawData ?? {}) },
        };
        subscribers.forEach(cb => cb({ ...cached }));
      };
      readChar.addEventListener("characteristicvaluechanged", notifyHandler);

      pollingInterval = setInterval(async () => {
        await send(encodeCmd(0x10));
        await send(encodeCmd(0x20));
      }, 3000);

      await send(encodeCmd(0x10));
      await send(encodeCmd(0x11));
      await send(encodeCmd(0x20));

      cached = { ...cached, connected: true };
      return { ...cached };
    },

    async disconnect() {
      if (pollingInterval) clearInterval(pollingInterval);
      if (readChar && notifyHandler) {
        readChar.removeEventListener("characteristicvaluechanged", notifyHandler);
        await readChar.stopNotifications().catch(() => {});
      }
      server?.disconnect();
      cached = { ...cached, connected: false };
    },

    async getState() { return { ...cached }; },

    async sendCommand(cmd: VaporizerCommand) {
      switch (cmd.type) {
        case "set_temperature":
          await send(encodeCmd(0x11, Math.round((cmd.value ?? 200) * 10)));
          break;
        case "toggle_heat":
          await send(encodeCmd(0x12, cached.isHeating ? 0 : 1));
          cached.isHeating = !cached.isHeating;
          break;
        case "power_off":
          await send(encodeCmd(0x12, 0));
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

export function createDrDabberSwitchAdapter(): VaporizerAdapter {
  return createSwitchAdapter("dr_dabber_switch", "Switch", ["SWITCH", "Dr Dabber Switch", "DrDabber"]);
}

export function createDrDabberBoostEvoAdapter(): VaporizerAdapter {
  return createSwitchAdapter("dr_dabber_boost_evo", "Boost EVO", ["BOOST", "Boost EVO", "Dr Dabber Boost"]);
}
