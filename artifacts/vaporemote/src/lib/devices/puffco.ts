import type { VaporizerAdapter, DeviceState, VaporizerCommand } from "../bluetooth";

const PUFFCO_SERVICE      = "06aa1910-f22a-11e3-9daa-0002a5d5c51b";
const PUFFCO_CHAR_TEMP    = "06aa1520-f22a-11e3-9daa-0002a5d5c51b";
const PUFFCO_CHAR_TARGET  = "06aa1524-f22a-11e3-9daa-0002a5d5c51b";
const PUFFCO_CHAR_STATE   = "06aa1521-f22a-11e3-9daa-0002a5d5c51b";
const PUFFCO_CHAR_BATTERY = "06aa1522-f22a-11e3-9daa-0002a5d5c51b";
const PUFFCO_CHAR_PROFILE = "06aa1523-f22a-11e3-9daa-0002a5d5c51b";

const PUFFCO_STATES: Record<number, string> = {
  0: "OFF",
  1: "SLEEP",
  2: "IDLE",
  3: "TEMP_SELECT",
  4: "HEATING",
  5: "SESH",
  6: "BOOST",
};

const PUFFCO_PROFILES: Record<number, string> = {
  0: "Sesh",
  1: "Flavor",
  2: "Boost",
  3: "Efficiency",
  4: "Custom",
};

function createPuffcoAdapter(
  deviceType: "puffco_peak" | "puffco_peak_pro",
  displayName: string,
  nameFilter: string | string[]
): VaporizerAdapter {
  let server: BluetoothRemoteGATTServer | null = null;
  let service: BluetoothRemoteGATTService | null = null;
  const subscribers: Array<(s: DeviceState) => void> = [];
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  let notifyUnsubscribe: (() => void) | null = null;
  let cached: DeviceState = {
    connected: false,
    temperature: null,
    targetTemperature: null,
    isHeating: false,
    batteryLevel: null,
    mode: "conduction",
    rawData: {},
  };

  async function read(uuid: string): Promise<DataView | null> {
    if (!service) return null;
    try { return await (await service.getCharacteristic(uuid)).readValue(); }
    catch { return null; }
  }

  async function write(uuid: string, data: Uint8Array): Promise<void> {
    if (!service) return;
    try {
      const char = await service.getCharacteristic(uuid);
      await char.writeValueWithoutResponse(data);
    } catch (e) { console.error("Puffco write error:", e); }
  }

  function celsiusToF(c: number) { return c * 9 / 5 + 32; }
  function fToCelsius(f: number) { return (f - 32) * 5 / 9; }

  async function fetchState(): Promise<DeviceState> {
    const [tempVal, targetVal, stateVal, batteryVal, profileVal] = await Promise.all([
      read(PUFFCO_CHAR_TEMP),
      read(PUFFCO_CHAR_TARGET),
      read(PUFFCO_CHAR_STATE),
      read(PUFFCO_CHAR_BATTERY),
      read(PUFFCO_CHAR_PROFILE),
    ]);

    const stateCode = stateVal ? stateVal.getUint8(0) : 0;
    const profileCode = profileVal ? profileVal.getUint8(0) : 0;

    const tempF = tempVal ? tempVal.getFloat32(0, true) : null;
    const targetF = targetVal ? targetVal.getFloat32(0, true) : null;

    cached = {
      ...cached,
      connected: server?.connected ?? false,
      temperature: tempF !== null ? fToCelsius(tempF) : cached.temperature,
      targetTemperature: targetF !== null ? fToCelsius(targetF) : cached.targetTemperature,
      isHeating: stateCode === 4 || stateCode === 5 || stateCode === 6,
      batteryLevel: batteryVal ? batteryVal.getUint8(0) : cached.batteryLevel,
      boostActive: stateCode === 6,
      rawData: {
        state_code: stateCode,
        state_name: PUFFCO_STATES[stateCode] ?? "UNKNOWN",
        profile_code: profileCode,
        profile_name: PUFFCO_PROFILES[profileCode] ?? "Unknown",
        temperature_f: tempF,
        target_temp_f: targetF,
        battery_raw: batteryVal ? batteryVal.getUint8(0) : null,
      },
    };
    return cached;
  }

  return {
    deviceType,
    displayName,
    manufacturer: "Puffco",
    serviceUUIDs: [PUFFCO_SERVICE],
    nameFilter,

    async connect(device) {
      server = await device.gatt!.connect();
      service = await server.getPrimaryService(PUFFCO_SERVICE);

      try {
        const stateChar = await service.getCharacteristic(PUFFCO_CHAR_STATE);
        await stateChar.startNotifications();
        const handler = async () => {
          const s = await fetchState();
          subscribers.forEach(cb => cb(s));
        };
        stateChar.addEventListener("characteristicvaluechanged", handler);
        notifyUnsubscribe = () => {
          stateChar.removeEventListener("characteristicvaluechanged", handler);
          stateChar.stopNotifications().catch(() => {});
        };
      } catch {
        pollingInterval = setInterval(async () => {
          const s = await fetchState();
          subscribers.forEach(cb => cb(s));
        }, 2000);
      }

      return fetchState();
    },

    async disconnect() {
      notifyUnsubscribe?.();
      if (pollingInterval) clearInterval(pollingInterval);
      server?.disconnect();
      cached = { ...cached, connected: false };
    },

    async getState() { return fetchState(); },

    async sendCommand(cmd: VaporizerCommand) {
      switch (cmd.type) {
        case "set_temperature": {
          const tempF = celsiusToF(cmd.value ?? 200);
          const buf = new ArrayBuffer(4);
          new DataView(buf).setFloat32(0, tempF, true);
          await write(PUFFCO_CHAR_TARGET, new Uint8Array(buf));
          break;
        }
        case "boost":
          await write(PUFFCO_CHAR_STATE, new Uint8Array([6]));
          break;
        case "power_off":
          await write(PUFFCO_CHAR_STATE, new Uint8Array([0]));
          break;
        case "toggle_heat":
          if (cached.isHeating) {
            await write(PUFFCO_CHAR_STATE, new Uint8Array([2]));
          } else {
            await write(PUFFCO_CHAR_STATE, new Uint8Array([4]));
          }
          break;
      }
      const s = await fetchState();
      subscribers.forEach(cb => cb(s));
    },

    subscribeToUpdates(cb) {
      subscribers.push(cb);
      return () => { const i = subscribers.indexOf(cb); if (i >= 0) subscribers.splice(i, 1); };
    },

    async getRawData() { return cached.rawData ?? {}; },
  };
}

export function createPuffcoPeakAdapter(): VaporizerAdapter {
  return createPuffcoAdapter("puffco_peak", "Peak", ["Peak", "Puffco Peak"]);
}

export function createPuffcoPeakProAdapter(): VaporizerAdapter {
  return createPuffcoAdapter("puffco_peak_pro", "Peak Pro", ["Peak Pro", "Puffco Pro"]);
}
