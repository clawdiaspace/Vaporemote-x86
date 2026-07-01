import type { VaporizerAdapter, DeviceState, VaporizerCommand } from "../bluetooth";
import { connectWithServiceFallback } from "./utils";

// ─── Arizer Solo 2 ────────────────────────────────────────────────────────────
// Community-verified UUIDs (00ff service family)
// Temp encoding: integer °C (NOT ×10)
const SOLO_SVC        = "00ff0000-0000-1000-8000-00805f9b34fb";
const SOLO_CUR_TEMP   = "0000ff01-0000-1000-8000-00805f9b34fb";  // Read/Notify uint16 LE °C
const SOLO_TGT_TEMP   = "0000ff03-0000-1000-8000-00805f9b34fb";  // Read/Write  uint16 LE °C
const SOLO_BATTERY    = "0000ff05-0000-1000-8000-00805f9b34fb";  // Read        uint8  %
const SOLO_HEAT_CTRL  = "0000ff07-0000-1000-8000-00805f9b34fb";  // Write       uint8  1=on 0=off

export function createArizerSoloAdapter(): VaporizerAdapter {
  let server: BluetoothRemoteGATTServer | null = null;
  let svc: BluetoothRemoteGATTService | null = null;
  const subs: Array<(s: DeviceState) => void> = [];
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const notifyHandlers: Array<{ char: BluetoothRemoteGATTCharacteristic; fn: (e: Event) => void }> = [];

  let cached: DeviceState = {
    connected: false, temperature: null, targetTemperature: null,
    isHeating: false, batteryLevel: null, mode: "convection", rawData: {},
  };

  async function read(uuid: string): Promise<DataView | null> {
    if (!svc) return null;
    try { return await (await svc.getCharacteristic(uuid)).readValue(); }
    catch { return null; }
  }

  async function write(uuid: string, value: Uint8Array): Promise<void> {
    if (!svc) return;
    try {
      const c = await svc.getCharacteristic(uuid);
      try { await c.writeValueWithoutResponse(value); }
      catch { await c.writeValue(value); }
    } catch (e) { console.warn(`Arizer Solo write ${uuid}:`, e); }
  }

  async function tryNotify(uuid: string, onData: (dv: DataView) => void) {
    if (!svc) return;
    try {
      const c = await svc.getCharacteristic(uuid);
      await c.startNotifications();
      const fn = (e: Event) => {
        const val = (e.target as BluetoothRemoteGATTCharacteristic).value;
        if (val) onData(val);
      };
      c.addEventListener("characteristicvaluechanged", fn);
      notifyHandlers.push({ char: c, fn });
    } catch { /* polling covers it */ }
  }

  async function fetchState(): Promise<DeviceState> {
    const [tv, tgtv, batv] = await Promise.all([
      read(SOLO_CUR_TEMP), read(SOLO_TGT_TEMP), read(SOLO_BATTERY),
    ]);
    const temp = tv ? (tv.byteLength >= 2 ? tv.getUint16(0, true) : tv.getUint8(0)) : null;
    const tgt  = tgtv ? (tgtv.byteLength >= 2 ? tgtv.getUint16(0, true) : tgtv.getUint8(0)) : null;
    cached = {
      ...cached,
      connected: server?.connected ?? false,
      temperature:       temp !== null ? temp : cached.temperature,
      targetTemperature: tgt  !== null ? tgt  : cached.targetTemperature,
      batteryLevel:      batv ? batv.getUint8(0) : cached.batteryLevel,
      isHeating:
        cached.temperature !== null && cached.targetTemperature !== null
          ? cached.temperature < cached.targetTemperature - 2
          : cached.isHeating,
      rawData: { temp_raw: temp, target_raw: tgt, battery: batv?.getUint8(0) },
    };
    return cached;
  }

  return {
    deviceType: "arizer_solo",
    displayName: "Solo 2",
    manufacturer: "Arizer",
    serviceUUIDs: [SOLO_SVC],
    nameFilter: ["ArZ", "Arizer", "Solo"],
    capabilities: {
      hasHeat: true, hasFan: false, hasLed: false, hasAutoShutoff: false,
      hasBoost: false, hasProfiles: false, hasBattery: true, hasCharging: false, hasWorkflows: false,
    },

    async connect(device) {
      const conn = await connectWithServiceFallback(device, SOLO_SVC);
      server = conn.server; svc = conn.service;
      cached = { ...cached, connected: true };

      await tryNotify(SOLO_CUR_TEMP, (dv) => {
        const temp = dv.byteLength >= 2 ? dv.getUint16(0, true) : dv.getUint8(0);
        cached = { ...cached, temperature: temp, rawData: { ...cached.rawData, temp_raw: temp } };
        subs.forEach(cb => cb({ ...cached }));
      });

      pollTimer = setInterval(async () => {
        const s = await fetchState();
        subs.forEach(cb => cb(s));
      }, 2000);
      return fetchState();
    },

    async disconnect() {
      if (pollTimer) clearInterval(pollTimer);
      for (const { char, fn } of notifyHandlers) {
        char.removeEventListener("characteristicvaluechanged", fn);
        await char.stopNotifications().catch(() => {});
      }
      server?.disconnect();
      cached = { ...cached, connected: false };
    },

    async getState() { return fetchState(); },

    async sendCommand(cmd: VaporizerCommand) {
      switch (cmd.type) {
        case "set_temperature": {
          const raw = Math.round(cmd.value ?? 185);
          const buf = new Uint8Array(2);
          new DataView(buf.buffer).setUint16(0, raw, true);
          await write(SOLO_TGT_TEMP, buf);
          cached.targetTemperature = cmd.value ?? 185;
          break;
        }
        case "toggle_heat":
          await write(SOLO_HEAT_CTRL, new Uint8Array([cached.isHeating ? 0x00 : 0x01]));
          cached.isHeating = !cached.isHeating;
          break;
        case "power_off":
          await write(SOLO_HEAT_CTRL, new Uint8Array([0x00]));
          cached.isHeating = false;
          break;
      }
      subs.forEach(cb => cb({ ...cached }));
    },

    subscribeToUpdates(cb) {
      subs.push(cb);
      return () => { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); };
    },

    async getRawData() { return cached.rawData ?? {}; },
  };
}

// ─── Arizer Air 2 ─────────────────────────────────────────────────────────────
// Uses same 00ff service family as Solo 2 (same physical GATT profile)
export function createArizerAirAdapter(): VaporizerAdapter {
  const base = createArizerSoloAdapter();
  return {
    ...base,
    deviceType: "arizer_air",
    displayName: "Air 2",
    nameFilter: ["Air 2", "ArZ-Air", "Arizer Air"],
  };
}

// ─── DaVinci IQ2 ──────────────────────────────────────────────────────────────
// Community-verified UUIDs (fff0 service family)
// Temp encoding: uint16 LE °C×10
const IQ2_SVC          = "0000fff0-0000-1000-8000-00805f9b34fb";
const IQ2_CUR_TEMP     = "0000fff1-0000-1000-8000-00805f9b34fb";  // Read/Notify uint16 LE °C×10
const IQ2_TGT_TEMP     = "0000fff2-0000-1000-8000-00805f9b34fb";  // Read/Write  uint16 LE °C×10
const IQ2_BATTERY      = "0000fff3-0000-1000-8000-00805f9b34fb";  // Read        uint8  %
const IQ2_HEAT_CTRL    = "0000fff4-0000-1000-8000-00805f9b34fb";  // Write       uint8  1=on 0=off
const IQ2_PRECISION    = "0000fff5-0000-1000-8000-00805f9b34fb";  // Read/Write  uint8 toggle

export function createDaVinciIQ2Adapter(): VaporizerAdapter {
  let server: BluetoothRemoteGATTServer | null = null;
  let svc: BluetoothRemoteGATTService | null = null;
  const subs: Array<(s: DeviceState) => void> = [];
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const notifyHandlers: Array<{ char: BluetoothRemoteGATTCharacteristic; fn: (e: Event) => void }> = [];

  let cached: DeviceState = {
    connected: false, temperature: null, targetTemperature: null,
    isHeating: false, batteryLevel: null, mode: "conduction", rawData: {},
  };

  async function read(uuid: string): Promise<DataView | null> {
    if (!svc) return null;
    try { return await (await svc.getCharacteristic(uuid)).readValue(); }
    catch { return null; }
  }

  async function write(uuid: string, value: Uint8Array): Promise<void> {
    if (!svc) return;
    try {
      const c = await svc.getCharacteristic(uuid);
      try { await c.writeValueWithoutResponse(value); }
      catch { await c.writeValue(value); }
    } catch (e) { console.warn(`IQ2 write ${uuid}:`, e); }
  }

  async function tryNotify(uuid: string, onData: (dv: DataView) => void) {
    if (!svc) return;
    try {
      const c = await svc.getCharacteristic(uuid);
      await c.startNotifications();
      const fn = (e: Event) => {
        const val = (e.target as BluetoothRemoteGATTCharacteristic).value;
        if (val) onData(val);
      };
      c.addEventListener("characteristicvaluechanged", fn);
      notifyHandlers.push({ char: c, fn });
    } catch { /* polling covers it */ }
  }

  async function fetchState(): Promise<DeviceState> {
    const [tv, tgtv, batv] = await Promise.all([
      read(IQ2_CUR_TEMP), read(IQ2_TGT_TEMP), read(IQ2_BATTERY),
    ]);
    const temp = tv ? tv.getUint16(0, true) / 10 : null;
    const tgt  = tgtv ? tgtv.getUint16(0, true) / 10 : null;
    cached = {
      ...cached,
      connected: server?.connected ?? false,
      temperature:       temp !== null ? temp : cached.temperature,
      targetTemperature: tgt  !== null ? tgt  : cached.targetTemperature,
      batteryLevel:      batv ? batv.getUint8(0) : cached.batteryLevel,
      isHeating:
        cached.temperature !== null && cached.targetTemperature !== null
          ? cached.temperature < cached.targetTemperature - 2
          : cached.isHeating,
      rawData: {
        temp_raw: tv ? tv.getUint16(0, true) : cached.rawData?.temp_raw,
        target_raw: tgtv ? tgtv.getUint16(0, true) : cached.rawData?.target_raw,
        battery: batv?.getUint8(0),
      },
    };
    return cached;
  }

  return {
    deviceType: "davinci_iq2",
    displayName: "IQ2",
    manufacturer: "DaVinci",
    serviceUUIDs: [IQ2_SVC],
    nameFilter: ["DaVinci", "IQ2", "IQ 2"],
    capabilities: {
      hasHeat: true, hasFan: false, hasLed: false, hasAutoShutoff: false,
      hasBoost: false, hasProfiles: false, hasBattery: true, hasCharging: false, hasWorkflows: false,
    },

    async connect(device) {
      const conn = await connectWithServiceFallback(device, IQ2_SVC);
      server = conn.server; svc = conn.service;
      cached = { ...cached, connected: true };

      await tryNotify(IQ2_CUR_TEMP, (dv) => {
        const temp = dv.getUint16(0, true) / 10;
        cached = { ...cached, temperature: temp, rawData: { ...cached.rawData, temp_raw: dv.getUint16(0, true) } };
        subs.forEach(cb => cb({ ...cached }));
      });

      pollTimer = setInterval(async () => {
        const s = await fetchState();
        subs.forEach(cb => cb(s));
      }, 2000);
      return fetchState();
    },

    async disconnect() {
      if (pollTimer) clearInterval(pollTimer);
      for (const { char, fn } of notifyHandlers) {
        char.removeEventListener("characteristicvaluechanged", fn);
        await char.stopNotifications().catch(() => {});
      }
      server?.disconnect();
      cached = { ...cached, connected: false };
    },

    async getState() { return fetchState(); },

    async sendCommand(cmd: VaporizerCommand) {
      switch (cmd.type) {
        case "set_temperature": {
          const raw = Math.round((cmd.value ?? 185) * 10);
          const buf = new Uint8Array(2);
          new DataView(buf.buffer).setUint16(0, raw, true);
          await write(IQ2_TGT_TEMP, buf);
          cached.targetTemperature = cmd.value ?? 185;
          break;
        }
        case "toggle_heat":
          await write(IQ2_HEAT_CTRL, new Uint8Array([cached.isHeating ? 0x00 : 0x01]));
          cached.isHeating = !cached.isHeating;
          break;
        case "power_off":
          await write(IQ2_HEAT_CTRL, new Uint8Array([0x00]));
          cached.isHeating = false;
          break;
        case "set_precision_mode": {
          const current = await read(IQ2_PRECISION);
          const cur = current ? current.getUint8(0) : 0;
          await write(IQ2_PRECISION, new Uint8Array([cur === 0 ? 1 : 0]));
          break;
        }
      }
      subs.forEach(cb => cb({ ...cached }));
    },

    subscribeToUpdates(cb) {
      subs.push(cb);
      return () => { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); };
    },

    async getRawData() { return cached.rawData ?? {}; },
  };
}

// ─── PAX 3 ────────────────────────────────────────────────────────────────────
// PAX encrypts all control writes — only temperature monitoring is possible.
// Community-documented UUIDs below are for read-only monitoring only.
const PAX3_SVC      = "8e320200-64d2-11e6-bdf4-0800200c9a66";
const PAX3_TEMP     = "8e320201-64d2-11e6-bdf4-0800200c9a66";
const PAX3_TGT_TEMP = "8e320202-64d2-11e6-bdf4-0800200c9a66";
const PAX3_BATTERY  = "8e320203-64d2-11e6-bdf4-0800200c9a66";

export function createPax3Adapter(): VaporizerAdapter {
  let server: BluetoothRemoteGATTServer | null = null;
  let svc: BluetoothRemoteGATTService | null = null;
  const subs: Array<(s: DeviceState) => void> = [];
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  let cached: DeviceState = {
    connected: false, temperature: null, targetTemperature: null,
    isHeating: false, batteryLevel: null, mode: "conduction", rawData: {},
  };

  async function read(uuid: string): Promise<DataView | null> {
    if (!svc) return null;
    try { return await (await svc.getCharacteristic(uuid)).readValue(); }
    catch { return null; }
  }

  async function fetchState(): Promise<DeviceState> {
    const [tv, tgtv, batv] = await Promise.all([
      read(PAX3_TEMP), read(PAX3_TGT_TEMP), read(PAX3_BATTERY),
    ]);
    const temp = tv ? (tv.byteLength >= 2 ? tv.getUint16(0, true) / 10 : tv.getUint8(0)) : null;
    const tgt  = tgtv ? (tgtv.byteLength >= 2 ? tgtv.getUint16(0, true) / 10 : tgtv.getUint8(0)) : null;
    cached = {
      ...cached,
      connected: server?.connected ?? false,
      temperature:       temp !== null ? temp : cached.temperature,
      targetTemperature: tgt  !== null ? tgt  : cached.targetTemperature,
      batteryLevel:      batv ? batv.getUint8(0) : cached.batteryLevel,
      isHeating:
        cached.temperature !== null && cached.targetTemperature !== null
          ? cached.temperature < cached.targetTemperature - 2
          : cached.isHeating,
    };
    return cached;
  }

  return {
    deviceType: "pax3",
    displayName: "PAX 3",
    manufacturer: "PAX",
    serviceUUIDs: [PAX3_SVC],
    nameFilter: ["PAX", "Pax 3"],
    statusNote: "Limited BLE — temperature monitoring only",
    capabilities: {
      hasHeat: false, hasFan: false, hasLed: false, hasAutoShutoff: false,
      hasBoost: false, hasProfiles: false, hasBattery: true, hasCharging: false, hasWorkflows: false,
    },

    async connect(device) {
      const conn = await connectWithServiceFallback(device, PAX3_SVC);
      server = conn.server; svc = conn.service;
      cached = { ...cached, connected: true };
      pollTimer = setInterval(async () => {
        const s = await fetchState();
        subs.forEach(cb => cb(s));
      }, 2000);
      return fetchState();
    },

    async disconnect() {
      if (pollTimer) clearInterval(pollTimer);
      server?.disconnect();
      cached = { ...cached, connected: false };
    },

    async getState() { return fetchState(); },

    async sendCommand(_cmd: VaporizerCommand) {
      subs.forEach(cb => cb({ ...cached }));
    },

    subscribeToUpdates(cb) {
      subs.push(cb);
      return () => { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); };
    },

    async getRawData() { return cached.rawData ?? {}; },
  };
}
