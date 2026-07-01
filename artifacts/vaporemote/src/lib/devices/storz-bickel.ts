import type { VaporizerAdapter, DeviceState, VaporizerCommand } from "../bluetooth";

const SB_SUFFIX = "5354-4f52-5a26-4249434b454c";

const VOL_PRIMARY_SERVICE  = `10100000-${SB_SUFFIX}`;
const VOL_CHAR_TEMPERATURE = `10110001-${SB_SUFFIX}`;
const VOL_CHAR_TARGET_TEMP = `10110003-${SB_SUFFIX}`;
const VOL_CHAR_HEAT_ON_OFF = `1011000f-${SB_SUFFIX}`;
const VOL_CHAR_FAN_ON_OFF  = `10110013-${SB_SUFFIX}`;
const VOL_CHAR_FAN_SPEED   = `10110012-${SB_SUFFIX}`;
const VOL_CHAR_BATTERY     = `10110007-${SB_SUFFIX}`;

const VENTY_SERVICE      = `00000001-${SB_SUFFIX}`;
const VENTY_CHAR_TEMP    = `00000011-${SB_SUFFIX}`;
const VENTY_CHAR_TARGET  = `00000021-${SB_SUFFIX}`;
const VENTY_CHAR_HEAT    = `00000031-${SB_SUFFIX}`;
const VENTY_CHAR_BATTERY = `00000041-${SB_SUFFIX}`;

export function createVolcanoHybridAdapter(): VaporizerAdapter {
  let server: BluetoothRemoteGATTServer | null = null;
  let primaryService: BluetoothRemoteGATTService | null = null;
  const subscribers: Array<(state: DeviceState) => void> = [];
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  let cachedState: DeviceState = {
    connected: false,
    temperature: null,
    targetTemperature: null,
    isHeating: false,
    batteryLevel: null,
    mode: "hybrid",
    fanOn: false,
    fanSpeed: 0,
  };

  async function readChar(uuid: string): Promise<DataView | null> {
    if (!primaryService) return null;
    try {
      const char = await primaryService.getCharacteristic(uuid);
      return await char.readValue();
    } catch { return null; }
  }

  async function writeChar(uuid: string, value: Uint8Array): Promise<void> {
    if (!primaryService) return;
    try {
      const char = await primaryService.getCharacteristic(uuid);
      await char.writeValueWithoutResponse(value);
    } catch (e) { console.error("Volcano write error:", e); }
  }

  async function fetchState(): Promise<DeviceState> {
    const [tempVal, targetVal, heatVal, fanVal, fanSpeedVal, battVal] = await Promise.all([
      readChar(VOL_CHAR_TEMPERATURE),
      readChar(VOL_CHAR_TARGET_TEMP),
      readChar(VOL_CHAR_HEAT_ON_OFF),
      readChar(VOL_CHAR_FAN_ON_OFF),
      readChar(VOL_CHAR_FAN_SPEED),
      readChar(VOL_CHAR_BATTERY),
    ]);

    cachedState = {
      ...cachedState,
      connected: server?.connected ?? false,
      temperature: tempVal ? tempVal.getUint16(0, true) / 10 : cachedState.temperature,
      targetTemperature: targetVal ? targetVal.getUint16(0, true) / 10 : cachedState.targetTemperature,
      isHeating: heatVal ? heatVal.getUint8(0) === 1 : cachedState.isHeating,
      fanOn: fanVal ? fanVal.getUint8(0) === 1 : cachedState.fanOn,
      fanSpeed: fanSpeedVal ? fanSpeedVal.getUint8(0) : cachedState.fanSpeed,
      batteryLevel: battVal ? battVal.getUint8(0) : cachedState.batteryLevel,
      rawData: {
        temperature_raw: tempVal ? tempVal.getUint16(0, true) : null,
        target_temp_raw: targetVal ? targetVal.getUint16(0, true) : null,
        heat_raw: heatVal ? heatVal.getUint8(0) : null,
        fan_raw: fanVal ? fanVal.getUint8(0) : null,
        fan_speed_raw: fanSpeedVal ? fanSpeedVal.getUint8(0) : null,
        battery_raw: battVal ? battVal.getUint8(0) : null,
      },
    };
    return cachedState;
  }

  return {
    deviceType: "volcano_hybrid",
    displayName: "Volcano Hybrid",
    manufacturer: "Storz & Bickel",
    serviceUUIDs: [VOL_PRIMARY_SERVICE],
    nameFilter: ["VOLCANO"],

    async connect(device) {
      server = await device.gatt!.connect();
      try {
        primaryService = await server.getPrimaryService(VOL_PRIMARY_SERVICE);
      } catch {
        const allServices = await server.getPrimaryServices();
        primaryService = allServices[0] ?? null;
      }
      cachedState = { ...cachedState, connected: true };

      pollingInterval = setInterval(async () => {
        const state = await fetchState();
        subscribers.forEach(cb => cb(state));
      }, 2000);

      return fetchState();
    },

    async disconnect() {
      if (pollingInterval) clearInterval(pollingInterval);
      server?.disconnect();
      cachedState = { ...cachedState, connected: false };
    },

    async getState() { return fetchState(); },

    async sendCommand(cmd: VaporizerCommand) {
      switch (cmd.type) {
        case "set_temperature": {
          const raw = Math.round((cmd.value ?? 185) * 10);
          const buf = new Uint8Array(2);
          new DataView(buf.buffer).setUint16(0, raw, true);
          await writeChar(VOL_CHAR_TARGET_TEMP, buf);
          break;
        }
        case "toggle_heat":
          await writeChar(VOL_CHAR_HEAT_ON_OFF, new Uint8Array([cachedState.isHeating ? 0 : 1]));
          cachedState.isHeating = !cachedState.isHeating;
          break;
        case "toggle_fan":
          await writeChar(VOL_CHAR_FAN_ON_OFF, new Uint8Array([cachedState.fanOn ? 0 : 1]));
          cachedState.fanOn = !cachedState.fanOn;
          break;
        case "set_fan_speed":
          await writeChar(VOL_CHAR_FAN_SPEED, new Uint8Array([cmd.value ?? 5]));
          cachedState.fanSpeed = cmd.value ?? 5;
          break;
        case "power_off":
          await writeChar(VOL_CHAR_HEAT_ON_OFF, new Uint8Array([0]));
          await writeChar(VOL_CHAR_FAN_ON_OFF, new Uint8Array([0]));
          cachedState.isHeating = false;
          cachedState.fanOn = false;
          break;
      }
      subscribers.forEach(cb => cb({ ...cachedState }));
    },

    subscribeToUpdates(callback) {
      subscribers.push(callback);
      return () => {
        const idx = subscribers.indexOf(callback);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    },

    async getRawData() { return cachedState.rawData ?? {}; },
  };
}

export function createVentyAdapter(): VaporizerAdapter {
  let server: BluetoothRemoteGATTServer | null = null;
  let service: BluetoothRemoteGATTService | null = null;
  const subscribers: Array<(state: DeviceState) => void> = [];
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  let notifyHandlers: Array<{ char: BluetoothRemoteGATTCharacteristic; fn: (e: Event) => void }> = [];

  let cached: DeviceState = {
    connected: false,
    temperature: null,
    targetTemperature: null,
    isHeating: false,
    batteryLevel: null,
    mode: "convection",
    rawData: {},
  };

  async function readChar(uuid: string): Promise<DataView | null> {
    if (!service) return null;
    try { return await (await service.getCharacteristic(uuid)).readValue(); }
    catch { return null; }
  }

  async function writeChar(uuid: string, value: Uint8Array): Promise<void> {
    if (!service) return;
    try {
      const char = await service.getCharacteristic(uuid);
      await char.writeValueWithoutResponse(value);
    } catch (e) { console.error("Venty write error:", e); }
  }

  function encodeTemp(celsius: number): Uint8Array {
    const raw = Math.round(celsius * 10);
    const buf = new Uint8Array(2);
    new DataView(buf.buffer).setUint16(0, raw, true);
    return buf;
  }

  async function fetchState(): Promise<DeviceState> {
    const [tRaw, tgtRaw, heatRaw, battRaw] = await Promise.all([
      readChar(VENTY_CHAR_TEMP),
      readChar(VENTY_CHAR_TARGET),
      readChar(VENTY_CHAR_HEAT),
      readChar(VENTY_CHAR_BATTERY),
    ]);
    cached = {
      ...cached,
      connected: server?.connected ?? false,
      temperature: tRaw ? tRaw.getUint16(0, true) / 10 : cached.temperature,
      targetTemperature: tgtRaw ? tgtRaw.getUint16(0, true) / 10 : cached.targetTemperature,
      isHeating: heatRaw ? heatRaw.getUint8(0) === 1 : cached.isHeating,
      batteryLevel: battRaw ? battRaw.getUint8(0) : cached.batteryLevel,
      rawData: {
        temp_raw: tRaw ? tRaw.getUint16(0, true) : null,
        target_raw: tgtRaw ? tgtRaw.getUint16(0, true) : null,
        heat_raw: heatRaw ? heatRaw.getUint8(0) : null,
        battery_raw: battRaw ? battRaw.getUint8(0) : null,
      },
    };
    return cached;
  }

  async function trySubscribeNotify(uuid: string, onData: (dv: DataView) => void) {
    if (!service) return;
    try {
      const char = await service.getCharacteristic(uuid);
      await char.startNotifications();
      const fn = (e: Event) => {
        const val = (e.target as BluetoothRemoteGATTCharacteristic).value;
        if (val) onData(val);
      };
      char.addEventListener("characteristicvaluechanged", fn);
      notifyHandlers.push({ char, fn });
    } catch { /* notifications not supported on this char, polling will handle it */ }
  }

  return {
    deviceType: "venty",
    displayName: "Venty",
    manufacturer: "Storz & Bickel",
    serviceUUIDs: [VENTY_SERVICE],
    nameFilter: ["VY"],

    async connect(device) {
      server = await device.gatt!.connect();
      service = await server.getPrimaryService(VENTY_SERVICE);
      cached = { ...cached, connected: true };

      await trySubscribeNotify(VENTY_CHAR_TEMP, (dv) => {
        const temp = dv.getUint16(0, true) / 10;
        cached = { ...cached, temperature: temp, rawData: { ...cached.rawData, temp_raw: dv.getUint16(0, true) } };
        subscribers.forEach(cb => cb({ ...cached }));
      });

      await trySubscribeNotify(VENTY_CHAR_BATTERY, (dv) => {
        cached = { ...cached, batteryLevel: dv.getUint8(0) };
        subscribers.forEach(cb => cb({ ...cached }));
      });

      pollingInterval = setInterval(async () => {
        const state = await fetchState();
        subscribers.forEach(cb => cb(state));
      }, 3000);

      return fetchState();
    },

    async disconnect() {
      if (pollingInterval) clearInterval(pollingInterval);
      for (const { char, fn } of notifyHandlers) {
        char.removeEventListener("characteristicvaluechanged", fn);
        await char.stopNotifications().catch(() => {});
      }
      notifyHandlers = [];
      server?.disconnect();
      cached = { ...cached, connected: false };
    },

    async getState() { return fetchState(); },

    async sendCommand(cmd: VaporizerCommand) {
      switch (cmd.type) {
        case "set_temperature":
          await writeChar(VENTY_CHAR_TARGET, encodeTemp(cmd.value ?? 185));
          cached.targetTemperature = cmd.value ?? 185;
          break;
        case "toggle_heat":
          await writeChar(VENTY_CHAR_HEAT, new Uint8Array([cached.isHeating ? 0 : 1]));
          cached.isHeating = !cached.isHeating;
          break;
        case "power_off":
          await writeChar(VENTY_CHAR_HEAT, new Uint8Array([0]));
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

export function createCraftyPlusAdapter(): VaporizerAdapter {
  const CRAFTY_SERVICE = "00000001-4c45-4b43-4942-265a524f5453";
  const CRAFTY_TEMP    = "00000011-4c45-4b43-4942-265a524f5453";
  const CRAFTY_TARGET  = "00000021-4c45-4b43-4942-265a524f5453";
  const CRAFTY_BATTERY = "00000031-4c45-4b43-4942-265a524f5453";

  let server: BluetoothRemoteGATTServer | null = null;
  let service: BluetoothRemoteGATTService | null = null;
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  const subscribers: Array<(s: DeviceState) => void> = [];
  let cached: DeviceState = {
    connected: false, temperature: null, targetTemperature: null,
    isHeating: false, batteryLevel: null, mode: "conduction",
  };

  async function read(uuid: string): Promise<DataView | null> {
    if (!service) return null;
    try { return await (await service.getCharacteristic(uuid)).readValue(); }
    catch { return null; }
  }

  async function fetchState(): Promise<DeviceState> {
    const [t, tgt, bat] = await Promise.all([read(CRAFTY_TEMP), read(CRAFTY_TARGET), read(CRAFTY_BATTERY)]);
    cached = {
      ...cached,
      connected: server?.connected ?? false,
      temperature: t ? t.getUint16(0, true) / 10 : cached.temperature,
      targetTemperature: tgt ? tgt.getUint16(0, true) / 10 : cached.targetTemperature,
      batteryLevel: bat ? bat.getUint8(0) : cached.batteryLevel,
      rawData: { temp_raw: t?.getUint16(0, true), target_raw: tgt?.getUint16(0, true), battery_raw: bat?.getUint8(0) },
    };
    return cached;
  }

  return {
    deviceType: "crafty_plus",
    displayName: "Crafty+",
    manufacturer: "Storz & Bickel",
    serviceUUIDs: [CRAFTY_SERVICE],
    nameFilter: ["CRAFTY"],

    async connect(device) {
      server = await device.gatt!.connect();
      service = await server.getPrimaryService(CRAFTY_SERVICE);
      cached = { ...cached, connected: true };
      pollingInterval = setInterval(async () => {
        const s = await fetchState();
        subscribers.forEach(cb => cb(s));
      }, 2000);
      return fetchState();
    },
    async disconnect() {
      if (pollingInterval) clearInterval(pollingInterval);
      server?.disconnect();
      cached = { ...cached, connected: false };
    },
    async getState() { return fetchState(); },
    async sendCommand(cmd) {
      if (!service) return;
      if (cmd.type === "set_temperature") {
        const raw = Math.round((cmd.value ?? 180) * 10);
        const buf = new Uint8Array(2);
        new DataView(buf.buffer).setUint16(0, raw, true);
        const char = await service.getCharacteristic(CRAFTY_TARGET);
        await char.writeValueWithoutResponse(buf);
        cached.targetTemperature = cmd.value ?? 180;
      } else if (cmd.type === "toggle_heat") {
        cached.isHeating = !cached.isHeating;
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
