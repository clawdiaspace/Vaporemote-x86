import type { VaporizerAdapter, DeviceState, VaporizerCommand } from "../bluetooth";
import { connectWithServiceFallback } from "./utils";

// ─── S&B vendor UUID suffix (ASCII: STORZ&BICKEL) ────────────────────────────
const SB = "5354-4f52-5a26-4249434b454c";

// ─── Volcano Hybrid (service 10110000) ───────────────────────────────────────
const VOL_SVC              = `10110000-${SB}`;
const VOL_CUR_TEMP         = `10110001-${SB}`;
const VOL_TGT_TEMP         = `10110003-${SB}`;
const VOL_TEMP_UNIT        = `10110004-${SB}`;
const VOL_LED_BRIGHTNESS   = `10110005-${SB}`;
const VOL_SERIAL           = `10110007-${SB}`;
const VOL_FIRMWARE         = `10110008-${SB}`;
const VOL_BLE_FIRMWARE     = `10110009-${SB}`;
const VOL_STATUS           = `1011000c-${SB}`;
const VOL_HEAT_ON          = `10110010-${SB}`;
const VOL_HEAT_OFF         = `10110011-${SB}`;
const VOL_FAN_ON           = `10110013-${SB}`;
const VOL_FAN_OFF          = `10110014-${SB}`;
const VOL_AUTO_SHUTOFF     = `10110015-${SB}`;
const VOL_WF_STEP_COUNT    = `10110020-${SB}`;
const VOL_WF_STEP_DATA     = `10110021-${SB}`;
const VOL_WF_CONTROL       = `10110022-${SB}`;
const VOL_BATTERY          = `10110030-${SB}`;
const VOL_BATTERY_CHARGING = `10110031-${SB}`;

// ─── Venty (service 10100000) ─────────────────────────────────────────────────
const VY_SVC      = `10100000-${SB}`;
const VY_CUR_TEMP = `10100001-${SB}`;
const VY_TGT_TEMP = `10100003-${SB}`;
const VY_HEAT     = `10100031-${SB}`;
const VY_BOOST    = `10100041-${SB}`;
const VY_BATTERY  = `10110001-${SB}`;

// ─── Crafty+ ──────────────────────────────────────────────────────────────────
// Community-RE'd GATT profile (service: 00000001-4c45-4b43-4942-265a524f5453)
const CP_SVC       = "00000001-4c45-4b43-4942-265a524f5453";
const CP_TEMP      = "00000011-4c45-4b43-4942-265a524f5453";  // Read/Notify uint16 LE °C×10
const CP_TARGET    = "00000021-4c45-4b43-4942-265a524f5453";  // Read/Write  uint16 LE °C×10
const CP_BATTERY   = "00000031-4c45-4b43-4942-265a524f5453";  // Read        uint8  %
const CP_HEAT      = "00000041-4c45-4b43-4942-265a524f5453";  // Write       uint8  1=on 0=off
const CP_BOOST_TMP = "00000051-4c45-4b43-4942-265a524f5453";  // Read/Write  uint16 LE °C×10

// ─── Helpers ─────────────────────────────────────────────────────────────────

function encodeTemp(celsius: number): Uint8Array {
  const buf = new Uint8Array(2);
  new DataView(buf.buffer).setUint16(0, Math.round(celsius * 10), true);
  return buf;
}

function decodeTemp(dv: DataView): number {
  return dv.getUint16(0, true) / 10;
}

function decodeStr(dv: DataView): string {
  try { return new TextDecoder().decode(dv.buffer); }
  catch { return ""; }
}

async function safeWrite(char: BluetoothRemoteGATTCharacteristic, value: Uint8Array): Promise<void> {
  try { await char.writeValueWithoutResponse(value); }
  catch { await char.writeValue(value); }
}

// ─── Volcano Hybrid ───────────────────────────────────────────────────────────

export function createVolcanoHybridAdapter(): VaporizerAdapter {
  let server: BluetoothRemoteGATTServer | null = null;
  let svc: BluetoothRemoteGATTService | null = null;
  const subs: Array<(s: DeviceState) => void> = [];
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const notifyHandlers: Array<{ char: BluetoothRemoteGATTCharacteristic; fn: (e: Event) => void }> = [];

  let s: DeviceState = {
    connected: false, temperature: null, targetTemperature: null,
    isHeating: false, batteryLevel: null, mode: "hybrid",
    fanOn: false, isReady: false, isCharging: false,
    ledBrightness: null, autoShutoffMinutes: null,
    firmwareVersion: null, serial: null, rawData: {},
  };

  async function getChar(uuid: string): Promise<BluetoothRemoteGATTCharacteristic | null> {
    if (!svc) return null;
    try { return await svc.getCharacteristic(uuid); }
    catch { return null; }
  }

  async function readChar(uuid: string): Promise<DataView | null> {
    const c = await getChar(uuid);
    if (!c) return null;
    try { return await c.readValue(); }
    catch { return null; }
  }

  async function writeChar(uuid: string, value: Uint8Array): Promise<void> {
    const c = await getChar(uuid);
    if (!c) { console.warn(`Volcano: char ${uuid} not found`); return; }
    try { await safeWrite(c, value); }
    catch (e) { console.warn(`Volcano write ${uuid}:`, e); }
  }

  function parseStatus(dv: DataView) {
    const bits = dv.getUint32(0, true);
    return {
      isHeating: !!(bits & 0x0001),
      fanOn:     !!(bits & 0x0002),
      isReady:   !!(bits & 0x0010),
    };
  }

  async function fetchState(): Promise<DeviceState> {
    const [tRaw, tgtRaw, statusRaw, ledRaw, shutoffRaw, batRaw, chargRaw] = await Promise.all([
      readChar(VOL_CUR_TEMP), readChar(VOL_TGT_TEMP), readChar(VOL_STATUS),
      readChar(VOL_LED_BRIGHTNESS), readChar(VOL_AUTO_SHUTOFF),
      readChar(VOL_BATTERY), readChar(VOL_BATTERY_CHARGING),
    ]);

    const status = statusRaw ? parseStatus(statusRaw) : null;

    s = {
      ...s,
      connected: server?.connected ?? false,
      temperature:         tRaw      ? decodeTemp(tRaw)                : s.temperature,
      targetTemperature:   tgtRaw    ? decodeTemp(tgtRaw)              : s.targetTemperature,
      isHeating:           status    ? status.isHeating                : s.isHeating,
      fanOn:               status    ? status.fanOn                    : s.fanOn,
      isReady:             status    ? status.isReady                  : s.isReady,
      ledBrightness:       ledRaw    ? ledRaw.getUint8(0)              : s.ledBrightness,
      autoShutoffMinutes:  shutoffRaw ? shutoffRaw.getUint16(0, true)  : s.autoShutoffMinutes,
      batteryLevel:        batRaw    ? batRaw.getUint8(0)              : s.batteryLevel,
      isCharging:          chargRaw  ? chargRaw.getUint8(0) === 1      : s.isCharging,
      rawData: {
        temp_raw:    tRaw      ? tRaw.getUint16(0, true)    : s.rawData?.temp_raw,
        target_raw:  tgtRaw    ? tgtRaw.getUint16(0, true)  : s.rawData?.target_raw,
        status_bits: statusRaw ? statusRaw.getUint32(0, true).toString(16) : s.rawData?.status_bits,
        battery:     batRaw    ? batRaw.getUint8(0)          : s.rawData?.battery,
        led:         ledRaw    ? ledRaw.getUint8(0)           : s.rawData?.led,
        shutoff_min: shutoffRaw ? shutoffRaw.getUint16(0, true) : s.rawData?.shutoff_min,
        charging:    chargRaw  ? chargRaw.getUint8(0)         : s.rawData?.charging,
        firmware:    s.firmwareVersion,
        serial:      s.serial,
      },
    };
    return s;
  }

  async function tryNotify(uuid: string, onData: (dv: DataView) => void) {
    const c = await getChar(uuid);
    if (!c) return;
    try {
      await c.startNotifications();
      const fn = (e: Event) => {
        const val = (e.target as BluetoothRemoteGATTCharacteristic).value;
        if (val) onData(val);
      };
      c.addEventListener("characteristicvaluechanged", fn);
      notifyHandlers.push({ char: c, fn });
    } catch { /* polling covers it */ }
  }

  async function readInfo() {
    const [fwRaw, bleFwRaw, snRaw] = await Promise.all([
      readChar(VOL_FIRMWARE), readChar(VOL_BLE_FIRMWARE), readChar(VOL_SERIAL),
    ]);
    s = {
      ...s,
      firmwareVersion: fwRaw ? decodeStr(fwRaw) : s.firmwareVersion,
      serial:          snRaw  ? decodeStr(snRaw) : s.serial,
      rawData: {
        ...s.rawData,
        firmware:     fwRaw    ? decodeStr(fwRaw)    : s.rawData?.firmware,
        ble_firmware: bleFwRaw ? decodeStr(bleFwRaw) : s.rawData?.ble_firmware,
        serial:       snRaw    ? decodeStr(snRaw)     : s.rawData?.serial,
      },
    };
  }

  return {
    deviceType: "volcano_hybrid",
    displayName: "Volcano Hybrid",
    manufacturer: "Storz & Bickel",
    serviceUUIDs: [VOL_SVC],
    nameFilter: ["VOLCANO", "Volcano"],
    capabilities: {
      hasHeat: true, hasFan: true, hasLed: true, hasAutoShutoff: true,
      hasBoost: false, hasProfiles: false, hasBattery: true, hasCharging: true, hasWorkflows: true,
    },

    async connect(device) {
      const conn = await connectWithServiceFallback(device, VOL_SVC);
      server = conn.server; svc = conn.service;
      s = { ...s, connected: true };

      await tryNotify(VOL_CUR_TEMP, (dv) => {
        s = { ...s, temperature: decodeTemp(dv), rawData: { ...s.rawData, temp_raw: dv.getUint16(0, true) } };
        subs.forEach(cb => cb({ ...s }));
      });
      await tryNotify(VOL_STATUS, (dv) => {
        const st = parseStatus(dv);
        s = { ...s, ...st, rawData: { ...s.rawData, status_bits: dv.getUint32(0, true).toString(16) } };
        subs.forEach(cb => cb({ ...s }));
      });
      await tryNotify(VOL_BATTERY, (dv) => {
        s = { ...s, batteryLevel: dv.getUint8(0), rawData: { ...s.rawData, battery: dv.getUint8(0) } };
        subs.forEach(cb => cb({ ...s }));
      });
      await tryNotify(VOL_BATTERY_CHARGING, (dv) => {
        s = { ...s, isCharging: dv.getUint8(0) === 1 };
        subs.forEach(cb => cb({ ...s }));
      });

      await readInfo();
      pollTimer = setInterval(async () => {
        const st = await fetchState();
        subs.forEach(cb => cb(st));
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
      s = { ...s, connected: false };
    },

    async getState() { return fetchState(); },

    async sendCommand(cmd: VaporizerCommand) {
      switch (cmd.type) {
        case "set_temperature":
          await writeChar(VOL_TGT_TEMP, encodeTemp(cmd.value ?? 185));
          s.targetTemperature = cmd.value ?? 185;
          break;
        case "toggle_heat":
          if (s.isHeating) {
            await writeChar(VOL_HEAT_OFF, new Uint8Array([0x00]));
            s.isHeating = false;
          } else {
            await writeChar(VOL_HEAT_ON, new Uint8Array([0x00]));
            s.isHeating = true;
          }
          break;
        case "toggle_fan":
          if (s.fanOn) {
            await writeChar(VOL_FAN_OFF, new Uint8Array([0x00]));
            s.fanOn = false;
          } else {
            await writeChar(VOL_FAN_ON, new Uint8Array([0x00]));
            s.fanOn = true;
          }
          break;
        case "set_led_brightness": {
          const bri = Math.max(0, Math.min(100, Math.round(cmd.value ?? 50)));
          await writeChar(VOL_LED_BRIGHTNESS, new Uint8Array([bri]));
          s.ledBrightness = bri;
          break;
        }
        case "set_auto_shutoff": {
          const mins = Math.max(0, Math.round(cmd.value ?? 0));
          const buf = new Uint8Array(2);
          new DataView(buf.buffer).setUint16(0, mins, true);
          await writeChar(VOL_AUTO_SHUTOFF, buf);
          s.autoShutoffMinutes = mins;
          break;
        }
        case "power_off":
          await writeChar(VOL_HEAT_OFF, new Uint8Array([0x00]));
          await writeChar(VOL_FAN_OFF,  new Uint8Array([0x00]));
          s.isHeating = false; s.fanOn = false;
          break;
      }
      subs.forEach(cb => cb({ ...s }));
    },

    subscribeToUpdates(cb) {
      subs.push(cb);
      return () => { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); };
    },

    async getRawData() { return s.rawData ?? {}; },
  };
}

// ─── Venty ────────────────────────────────────────────────────────────────────

export function createVentyAdapter(): VaporizerAdapter {
  let server: BluetoothRemoteGATTServer | null = null;
  let svc: BluetoothRemoteGATTService | null = null;
  const subs: Array<(s: DeviceState) => void> = [];
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const notifyHandlers: Array<{ char: BluetoothRemoteGATTCharacteristic; fn: (e: Event) => void }> = [];

  let cached: DeviceState = {
    connected: false, temperature: null, targetTemperature: null,
    isHeating: false, batteryLevel: null, mode: "convection",
    boostTemperature: null, rawData: {},
  };

  async function readChar(uuid: string): Promise<DataView | null> {
    if (!svc) return null;
    try { return await (await svc.getCharacteristic(uuid)).readValue(); }
    catch { return null; }
  }

  async function writeChar(uuid: string, value: Uint8Array): Promise<void> {
    if (!svc) return;
    try {
      const c = await svc.getCharacteristic(uuid);
      await safeWrite(c, value);
    } catch (e) { console.warn(`Venty write ${uuid}:`, e); }
  }

  async function fetchState(): Promise<DeviceState> {
    const [tRaw, tgtRaw, boostRaw, batRaw] = await Promise.all([
      readChar(VY_CUR_TEMP), readChar(VY_TGT_TEMP),
      readChar(VY_BOOST),    readChar(VY_BATTERY),
    ]);
    cached = {
      ...cached,
      connected:         server?.connected ?? false,
      temperature:       tRaw    ? decodeTemp(tRaw)       : cached.temperature,
      targetTemperature: tgtRaw  ? decodeTemp(tgtRaw)     : cached.targetTemperature,
      boostTemperature:  boostRaw ? decodeTemp(boostRaw)  : cached.boostTemperature,
      batteryLevel:      batRaw  ? batRaw.getUint8(0)     : cached.batteryLevel,
      rawData: {
        temp_raw:   tRaw    ? tRaw.getUint16(0, true)    : cached.rawData?.temp_raw,
        target_raw: tgtRaw  ? tgtRaw.getUint16(0, true)  : cached.rawData?.target_raw,
        boost_raw:  boostRaw ? boostRaw.getUint16(0, true) : cached.rawData?.boost_raw,
        battery:    batRaw  ? batRaw.getUint8(0)          : cached.rawData?.battery,
      },
    };
    return cached;
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

  return {
    deviceType: "venty",
    displayName: "Venty",
    manufacturer: "Storz & Bickel",
    serviceUUIDs: [VY_SVC],
    nameFilter: ["VENTY", "Venty", "VY", "STORZ&BICKEL"],
    capabilities: {
      hasHeat: true, hasFan: false, hasLed: false, hasAutoShutoff: false,
      hasBoost: true, hasProfiles: false, hasBattery: true, hasCharging: false, hasWorkflows: false,
    },

    async connect(device) {
      const conn = await connectWithServiceFallback(device, VY_SVC);
      server = conn.server; svc = conn.service;
      cached = { ...cached, connected: true };

      await tryNotify(VY_CUR_TEMP, (dv) => {
        cached = { ...cached, temperature: decodeTemp(dv), rawData: { ...cached.rawData, temp_raw: dv.getUint16(0, true) } };
        subs.forEach(cb => cb({ ...cached }));
      });
      await tryNotify(VY_BATTERY, (dv) => {
        cached = { ...cached, batteryLevel: dv.getUint8(0) };
        subs.forEach(cb => cb({ ...cached }));
      });

      pollTimer = setInterval(async () => {
        const st = await fetchState();
        subs.forEach(cb => cb(st));
      }, 3000);

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
        case "set_temperature":
          await writeChar(VY_TGT_TEMP, encodeTemp(cmd.value ?? 185));
          cached.targetTemperature = cmd.value ?? 185;
          break;
        case "set_boost_temperature":
          await writeChar(VY_BOOST, encodeTemp(cmd.value ?? 15));
          cached.boostTemperature = cmd.value ?? 15;
          break;
        case "toggle_heat":
          await writeChar(VY_HEAT, new Uint8Array([cached.isHeating ? 0x00 : 0x01]));
          cached.isHeating = !cached.isHeating;
          break;
        case "power_off":
          await writeChar(VY_HEAT, new Uint8Array([0x00]));
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

// ─── Crafty+ ──────────────────────────────────────────────────────────────────

export function createCraftyPlusAdapter(): VaporizerAdapter {
  let server: BluetoothRemoteGATTServer | null = null;
  let svc: BluetoothRemoteGATTService | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const subs: Array<(s: DeviceState) => void> = [];
  const notifyHandlers: Array<{ char: BluetoothRemoteGATTCharacteristic; fn: (e: Event) => void }> = [];

  let cached: DeviceState = {
    connected: false, temperature: null, targetTemperature: null,
    isHeating: false, batteryLevel: null, mode: "conduction",
    boostTemperature: null,
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
      await safeWrite(c, value);
    } catch (e) { console.warn(`Crafty+ write ${uuid}:`, e); }
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
    const [t, tgt, bat, boost] = await Promise.all([
      read(CP_TEMP), read(CP_TARGET), read(CP_BATTERY), read(CP_BOOST_TMP),
    ]);
    cached = {
      ...cached,
      connected:         server?.connected ?? false,
      temperature:       t     ? decodeTemp(t)     : cached.temperature,
      targetTemperature: tgt   ? decodeTemp(tgt)   : cached.targetTemperature,
      batteryLevel:      bat   ? bat.getUint8(0)   : cached.batteryLevel,
      boostTemperature:  boost ? decodeTemp(boost) : cached.boostTemperature,
      rawData: {
        temp_raw:   t     ? t.getUint16(0, true)     : cached.rawData?.temp_raw,
        target_raw: tgt   ? tgt.getUint16(0, true)   : cached.rawData?.target_raw,
        battery:    bat   ? bat.getUint8(0)           : cached.rawData?.battery,
        boost_raw:  boost ? boost.getUint16(0, true)  : cached.rawData?.boost_raw,
      },
    };
    return cached;
  }

  return {
    deviceType: "crafty_plus",
    displayName: "Crafty+",
    manufacturer: "Storz & Bickel",
    serviceUUIDs: [CP_SVC],
    nameFilter: ["CRAFTY"],
    capabilities: {
      hasHeat: true, hasFan: false, hasLed: false, hasAutoShutoff: false,
      hasBoost: true, hasProfiles: false, hasBattery: true, hasCharging: false, hasWorkflows: false,
    },

    async connect(device) {
      const conn = await connectWithServiceFallback(device, CP_SVC);
      server = conn.server; svc = conn.service;
      cached = { ...cached, connected: true };

      await tryNotify(CP_TEMP, (dv) => {
        cached = { ...cached, temperature: decodeTemp(dv), rawData: { ...cached.rawData, temp_raw: dv.getUint16(0, true) } };
        subs.forEach(cb => cb({ ...cached }));
      });

      pollTimer = setInterval(async () => {
        const st = await fetchState();
        subs.forEach(cb => cb(st));
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

    async sendCommand(cmd) {
      switch (cmd.type) {
        case "set_temperature":
          await write(CP_TARGET, encodeTemp(cmd.value ?? 180));
          cached.targetTemperature = cmd.value ?? 180;
          break;
        case "set_boost_temperature":
          await write(CP_BOOST_TMP, encodeTemp(cmd.value ?? 195));
          cached.boostTemperature = cmd.value ?? 195;
          break;
        case "toggle_heat":
          await write(CP_HEAT, new Uint8Array([cached.isHeating ? 0x00 : 0x01]));
          cached.isHeating = !cached.isHeating;
          break;
        case "power_off":
          await write(CP_HEAT, new Uint8Array([0x00]));
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

// ─── Volcano Workflow Helpers (exported for VolcanoRoutines component) ─────────

export interface WorkflowStep {
  tempC: number;
  durationSeconds: number;
  fanOn: boolean;
}

export function encodeWorkflowStep(index: number, step: WorkflowStep): Uint8Array {
  const buf = new Uint8Array(8);
  const dv  = new DataView(buf.buffer);
  dv.setUint8(0, index);
  dv.setUint8(1, 0x00);
  dv.setUint16(2, Math.round(step.tempC * 10), true);
  dv.setUint16(4, step.durationSeconds, true);
  dv.setUint8(6, step.fanOn ? 0x01 : 0x00);
  dv.setUint8(7, 0x00);
  return buf;
}

export { VOL_SVC, VOL_WF_STEP_COUNT, VOL_WF_STEP_DATA, VOL_WF_CONTROL };
