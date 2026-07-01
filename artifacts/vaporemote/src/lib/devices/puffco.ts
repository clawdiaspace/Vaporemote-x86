import type { VaporizerAdapter, DeviceState, VaporizerCommand } from "../bluetooth";
import { connectWithServiceFallback } from "./utils";

const SFX = "0951-4504-bfd9-eb0b66e1c6e0";
const PEAK_PRO_SERVICE   = `f0cd1900-${SFX}`;
const PP_CHAR_TEMP       = `f0cd1400-${SFX}`;
const PP_CHAR_PROFILE_T  = `f0cd1500-${SFX}`;
const PP_CHAR_STATE      = `f0cd0300-${SFX}`;
const PP_CHAR_HEAT_CMD   = `f0cd0400-${SFX}`;
const PP_CHAR_BATTERY    = `f0cd0900-${SFX}`;
const PP_CHAR_TOTAL_DABS = `f0cd0b00-${SFX}`;

const PEAK_SERVICE       = "06aa1910-f22a-11e3-9ddd-0002a5d5c51b";
const PK_CHAR_TEMP       = "06aa1520-f22a-11e3-9ddd-0002a5d5c51b";
const PK_CHAR_TARGET     = "06aa1524-f22a-11e3-9ddd-0002a5d5c51b";
const PK_CHAR_STATE      = "06aa1521-f22a-11e3-9ddd-0002a5d5c51b";
const PK_CHAR_BATTERY    = "06aa1522-f22a-11e3-9ddd-0002a5d5c51b";

const PEAK_PRO_STATES: Record<number, string> = {
  0: "Off", 1: "Sleep", 2: "Idle", 3: "Temp Select",
  4: "Heating", 5: "Session", 6: "Boost", 7: "Cooling",
};

function fToC(f: number) { return Math.round((f - 32) * 5 / 9 * 10) / 10; }
function cToF(c: number) { return c * 9 / 5 + 32; }

export function createPuffcoPeakProAdapter(): VaporizerAdapter {
  let server: BluetoothRemoteGATTServer | null = null;
  let service: BluetoothRemoteGATTService | null = null;
  let usedServiceUUID: string | null = null;
  const subscribers: Array<(s: DeviceState) => void> = [];
  let notifyCleanup: (() => void) | null = null;
  let pollingInterval: ReturnType<typeof setInterval> | null = null;

  let cached: DeviceState = {
    connected: false, temperature: null, targetTemperature: null,
    isHeating: false, batteryLevel: null, mode: "conduction", rawData: {},
  };

  async function readChar(uuid: string): Promise<DataView | null> {
    if (!service) return null;
    try { return await (await service.getCharacteristic(uuid)).readValue(); }
    catch { return null; }
  }

  function isPeakPro() { return usedServiceUUID === PEAK_PRO_SERVICE; }

  async function fetchState(): Promise<DeviceState> {
    if (!service) return cached;

    if (isPeakPro()) {
      const [tRaw, tgtRaw, stateRaw, battRaw, dabsRaw] = await Promise.all([
        readChar(PP_CHAR_TEMP), readChar(PP_CHAR_PROFILE_T), readChar(PP_CHAR_STATE),
        readChar(PP_CHAR_BATTERY), readChar(PP_CHAR_TOTAL_DABS),
      ]);
      const stateCode = stateRaw ? stateRaw.getUint8(0) : 0;
      const tempF = tRaw ? tRaw.getUint16(0, true) / 10 : null;
      const targetF = tgtRaw ? tgtRaw.getUint16(0, true) / 10 : null;
      cached = {
        ...cached,
        connected: server?.connected ?? false,
        temperature: tempF !== null ? fToC(tempF) : cached.temperature,
        targetTemperature: targetF !== null ? fToC(targetF) : cached.targetTemperature,
        isHeating: stateCode === 4 || stateCode === 5 || stateCode === 6,
        batteryLevel: battRaw ? battRaw.getUint8(0) : cached.batteryLevel,
        boostActive: stateCode === 6,
        rawData: {
          state: PEAK_PRO_STATES[stateCode] ?? `Unknown (${stateCode})`,
          state_code: stateCode,
          temperature_f: tempF,
          target_f: targetF,
          total_dabs: dabsRaw ? dabsRaw.getUint32(0, true) : null,
          service: "Peak Pro (f0cd)",
        },
      };
    } else {
      const [tRaw, tgtRaw, stateRaw, battRaw] = await Promise.all([
        readChar(PK_CHAR_TEMP), readChar(PK_CHAR_TARGET), readChar(PK_CHAR_STATE), readChar(PK_CHAR_BATTERY),
      ]);
      const stateCode = stateRaw ? stateRaw.getUint8(0) : 0;
      const tempF = tRaw ? tRaw.getFloat32(0, true) : null;
      const targetF = tgtRaw ? tgtRaw.getFloat32(0, true) : null;
      cached = {
        ...cached,
        connected: server?.connected ?? false,
        temperature: tempF !== null ? fToC(tempF) : cached.temperature,
        targetTemperature: targetF !== null ? fToC(targetF) : cached.targetTemperature,
        isHeating: stateCode === 4 || stateCode === 5,
        batteryLevel: battRaw ? battRaw.getUint8(0) : cached.batteryLevel,
        rawData: { state_code: stateCode, temperature_f: tempF, target_f: targetF, service: "Peak (06aa)" },
      };
    }
    return cached;
  }

  return {
    deviceType: "puffco_peak_pro",
    displayName: "Peak Pro",
    manufacturer: "Puffco",
    serviceUUIDs: [PEAK_PRO_SERVICE, PEAK_SERVICE],
    nameFilter: ["Peak Pro", "Puffco"],
    capabilities: {
      hasHeat: true, hasFan: false, hasLed: false, hasAutoShutoff: false,
      hasBoost: true, hasProfiles: false, hasBattery: true, hasCharging: false, hasWorkflows: false,
    },

    async connect(device) {
      const conn = await connectWithServiceFallback(device, PEAK_PRO_SERVICE, [PEAK_SERVICE]);
      server = conn.server; service = conn.service; usedServiceUUID = conn.serviceUUID;
      cached = { ...cached, connected: true };

      if (service && isPeakPro()) {
        try {
          const stateChar = await service.getCharacteristic(PP_CHAR_STATE);
          await stateChar.startNotifications();
          const h = async () => { const s = await fetchState(); subscribers.forEach(cb => cb(s)); };
          stateChar.addEventListener("characteristicvaluechanged", h);
          notifyCleanup = () => {
            stateChar.removeEventListener("characteristicvaluechanged", h);
            stateChar.stopNotifications().catch(() => {});
          };
        } catch { /* notifications not available — polling fallback */ }
      }

      pollingInterval = setInterval(async () => {
        const s = await fetchState();
        subscribers.forEach(cb => cb(s));
      }, 2500);

      return fetchState();
    },

    async disconnect() {
      notifyCleanup?.();
      if (pollingInterval) clearInterval(pollingInterval);
      server?.disconnect();
      cached = { ...cached, connected: false };
    },

    async getState() { return fetchState(); },

    async sendCommand(cmd: VaporizerCommand) {
      if (!service) return;
      try {
        if (isPeakPro()) {
          switch (cmd.type) {
            case "set_temperature": {
              const raw = Math.round(cToF(cmd.value ?? 200) * 10);
              const buf = new Uint8Array(2);
              new DataView(buf.buffer).setUint16(0, raw, true);
              await (await service.getCharacteristic(PP_CHAR_PROFILE_T)).writeValueWithoutResponse(buf);
              cached.targetTemperature = cmd.value ?? 200;
              break;
            }
            case "toggle_heat": {
              const heat = await service.getCharacteristic(PP_CHAR_HEAT_CMD);
              await heat.writeValueWithoutResponse(new Uint8Array([cached.isHeating ? 0 : 1]));
              break;
            }
            case "power_off": {
              const heat = await service.getCharacteristic(PP_CHAR_HEAT_CMD);
              await heat.writeValueWithoutResponse(new Uint8Array([0]));
              break;
            }
          }
        } else {
          switch (cmd.type) {
            case "set_temperature": {
              const f = cToF(cmd.value ?? 200);
              const buf = new ArrayBuffer(4);
              new DataView(buf).setFloat32(0, f, true);
              await (await service.getCharacteristic(PK_CHAR_TARGET)).writeValueWithoutResponse(new Uint8Array(buf));
              cached.targetTemperature = cmd.value ?? 200;
              break;
            }
            case "toggle_heat":
              await (await service.getCharacteristic(PK_CHAR_STATE)).writeValueWithoutResponse(new Uint8Array([cached.isHeating ? 2 : 4]));
              break;
            case "power_off":
              await (await service.getCharacteristic(PK_CHAR_STATE)).writeValueWithoutResponse(new Uint8Array([0]));
              break;
          }
        }
      } catch (e) { console.error("Puffco command error:", e); }
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
  const base = createPuffcoPeakProAdapter();
  return {
    ...base,
    deviceType: "puffco_peak",
    displayName: "Peak",
    nameFilter: ["Peak"],
    serviceUUIDs: [PEAK_SERVICE, PEAK_PRO_SERVICE],
    capabilities: {
      hasHeat: true, hasFan: false, hasLed: false, hasAutoShutoff: false,
      hasBoost: false, hasProfiles: false, hasBattery: true, hasCharging: false, hasWorkflows: false,
    },
  };
}
