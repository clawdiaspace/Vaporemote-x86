import type { VaporizerAdapter, DeviceState, VaporizerCommand } from "../bluetooth";
import { connectWithServiceFallback } from "./utils";

// ─── S&B vendor UUID suffix (ASCII: STORZ&BICKEL) ────────────────────────────
const SB = "5354-4f52-5a26-4249434b454c";

// ─── Volcano Hybrid (service 10110000) ───────────────────────────────────────
// Source: firsttris/reactive-volcano-app, ckskate/Vulcan, storz-rs (all verified)
const VOL_SVC              = `10110000-${SB}`;
const VOL_CUR_TEMP         = `10110001-${SB}`;  // Read/Notify  uint16 LE °C×10
const VOL_TGT_TEMP         = `10110003-${SB}`;  // Read/Write   uint16 LE °C×10
const VOL_TEMP_UNIT        = `10110004-${SB}`;  // Read/Write   uint8  0=°C 1=°F
const VOL_LED_BRIGHTNESS   = `10110005-${SB}`;  // Read/Write   uint8  0-100
const VOL_SERIAL           = `10110007-${SB}`;  // Read         string
const VOL_FIRMWARE         = `10110008-${SB}`;  // Read         string
const VOL_BLE_FIRMWARE     = `10110009-${SB}`;  // Read         string
const VOL_STATUS           = `1011000c-${SB}`;  // Read/Notify  uint32 LE bitfield
//   status bits: 0x0001=heater on, 0x0002=fan on, 0x0010=at-temp, 0x0020=auto-shutoff
const VOL_HEAT_ON          = `10110010-${SB}`;  // Write        write 0x00 → heater ON
const VOL_HEAT_OFF         = `10110011-${SB}`;  // Write        write 0x00 → heater OFF
const VOL_FAN_ON           = `10110013-${SB}`;  // Write        write 0x00 → fan ON
const VOL_FAN_OFF          = `10110014-${SB}`;  // Write        write 0x00 → fan OFF
const VOL_AUTO_SHUTOFF     = `10110015-${SB}`;  // Read/Write   uint16 LE minutes (0=off)
const VOL_WF_STEP_COUNT    = `10110020-${SB}`;  // Read/Write   uint16 LE
const VOL_WF_STEP_DATA     = `10110021-${SB}`;  // Read/Write   8-byte step struct
const VOL_WF_CONTROL       = `10110022-${SB}`;  // Write        0x01=start 0x00=stop
const VOL_BATTERY          = `10110030-${SB}`;  // Read/Notify  uint8  0-100 %
const VOL_BATTERY_CHARGING = `10110031-${SB}`;  // Read/Notify  uint8  0=no 1=charging

// ─── Venty (service 10100000, different chars from Volcano) ──────────────────
// Source: storz-rs / reactive-volcano-app (confirmed real hardware)
const VY_SVC     = `10100000-${SB}`;
const VY_CUR_TEMP = `10100001-${SB}`;  // Read/Notify uint16 LE °C×10
const VY_TGT_TEMP = `10100003-${SB}`;  // Read/Write  uint16 LE °C×10
const VY_HEAT     = `10100031-${SB}`;  // Write       0x01=ON  0x00=OFF
const VY_BOOST    = `10100041-${SB}`;  // Read/Write  uint16 LE °C×10 (booster offset)
const VY_BATTERY  = `10110001-${SB}`;  // Read/Notify uint8  % (note: 10110 prefix)

// ─── Crafty+ ──────────────────────────────────────────────────────────────────
const CP_SVC     = "00000001-4c45-4b43-4942-265a524f5453";
const CP_TEMP    = "00000011-4c45-4b43-4942-265a524f5453";
const CP_TARGET  = "00000021-4c45-4b43-4942-265a524f5453";
const CP_BATTERY = "00000031-4c45-4b43-4942-265a524f5453";

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
  try {
    return new TextDecoder().decode(dv.buffer);
  } catch {
    return "";
  }
}

// Write with automatic fallback to write-with-response
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
      readChar(VOL_CUR_TEMP),
      readChar(VOL_TGT_TEMP),
      readChar(VOL_STATUS),
      readChar(VOL_LED_BRIGHTNESS),
      readChar(VOL_AUTO_SHUTOFF),
      readChar(VOL_BATTERY),
      readChar(VOL_BATTERY_CHARGING),
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
      readChar(VOL_FIRMWARE),
      readChar(VOL_BLE_FIRMWARE),
      readChar(VOL_SERIAL),
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

    async connect(device) {
      const conn = await connectWithServiceFallback(device, VOL_SVC);
      server = conn.server;
      svc    = conn.service;
      s = { ...s, connected: true };

      // Notifications for live temp, status, battery
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

      // Read static info once
      await readInfo();

      // Poll all dynamic state every 2 s as fallback
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
          s.isHeating = false;
          s.fanOn = false;
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
    nameFilter: ["VY"],

    async connect(device) {
      const conn = await connectWithServiceFallback(device, VY_SVC);
      server = conn.server;
      svc    = conn.service;
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
  let cached: DeviceState = {
    connected: false, temperature: null, targetTemperature: null,
    isHeating: false, batteryLevel: null, mode: "conduction",
  };

  async function read(uuid: string): Promise<DataView | null> {
    if (!svc) return null;
    try { return await (await svc.getCharacteristic(uuid)).readValue(); }
    catch { return null; }
  }

  async function fetchState(): Promise<DeviceState> {
    const [t, tgt, bat] = await Promise.all([read(CP_TEMP), read(CP_TARGET), read(CP_BATTERY)]);
    cached = {
      ...cached,
      connected:         server?.connected ?? false,
      temperature:       t   ? decodeTemp(t)   : cached.temperature,
      targetTemperature: tgt ? decodeTemp(tgt) : cached.targetTemperature,
      batteryLevel:      bat ? bat.getUint8(0) : cached.batteryLevel,
      rawData: { temp_raw: t?.getUint16(0,true), target_raw: tgt?.getUint16(0,true), battery: bat?.getUint8(0) },
    };
    return cached;
  }

  return {
    deviceType: "crafty_plus",
    displayName: "Crafty+",
    manufacturer: "Storz & Bickel",
    serviceUUIDs: [CP_SVC],
    nameFilter: ["CRAFTY"],

    async connect(device) {
      const conn = await connectWithServiceFallback(device, CP_SVC);
      server = conn.server;
      svc    = conn.service;
      cached = { ...cached, connected: true };
      pollTimer = setInterval(async () => {
        const st = await fetchState();
        subs.forEach(cb => cb(st));
      }, 2000);
      return fetchState();
    },
    async disconnect() {
      if (pollTimer) clearInterval(pollTimer);
      server?.disconnect();
      cached = { ...cached, connected: false };
    },
    async getState() { return fetchState(); },
    async sendCommand(cmd) {
      if (!svc) return;
      if (cmd.type === "set_temperature") {
        try {
          const c = await svc.getCharacteristic(CP_TARGET);
          await safeWrite(c, encodeTemp(cmd.value ?? 180));
          cached.targetTemperature = cmd.value ?? 180;
        } catch (e) { console.warn("Crafty+ write:", e); }
      } else if (cmd.type === "toggle_heat") {
        cached.isHeating = !cached.isHeating;
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

/**
 * Encode a single Volcano Hybrid workflow step (8 bytes):
 * [index:1][type:1][temp:2 LE][duration:2 LE][fan:1][pad:1]
 */
export function encodeWorkflowStep(index: number, step: WorkflowStep): Uint8Array {
  const buf = new Uint8Array(8);
  const dv  = new DataView(buf.buffer);
  dv.setUint8(0, index);
  dv.setUint8(1, 0x00); // step type = heat
  dv.setUint16(2, Math.round(step.tempC * 10), true);
  dv.setUint16(4, step.durationSeconds, true);
  dv.setUint8(6, step.fanOn ? 0x01 : 0x00);
  dv.setUint8(7, 0x00); // padding
  return buf;
}

export { VOL_SVC, VOL_WF_STEP_COUNT, VOL_WF_STEP_DATA, VOL_WF_CONTROL };
