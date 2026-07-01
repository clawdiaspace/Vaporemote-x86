import type { VaporizerAdapter, DeviceState, VaporizerCommand, HeatingMode } from "../bluetooth";

const SB_PRIMARY_SERVICE = "10110000-5354-4f52-5a26-4249434b454c";
const SB_CLIMATE_SERVICE = "10100000-5354-4f52-5a26-4249434b454c";

const SB_CHAR_TEMPERATURE = "10110001-5354-4f52-5a26-4249434b454c";
const SB_CHAR_TARGET_TEMP  = "10110003-5354-4f52-5a26-4249434b454c";
const SB_CHAR_HEAT_ON_OFF  = "1011000f-5354-4f52-5a26-4249434b454c";
const SB_CHAR_FAN_ON_OFF   = "10110013-5354-4f52-5a26-4249434b454c";
const SB_CHAR_FAN_SPEED    = "10110012-5354-4f52-5a26-4249434b454c";
const SB_CHAR_BATTERY      = "10110007-5354-4f52-5a26-4249434b454c";

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

  async function readCharacteristic(uuid: string): Promise<DataView | null> {
    if (!primaryService) return null;
    try {
      const char = await primaryService.getCharacteristic(uuid);
      return await char.readValue();
    } catch {
      return null;
    }
  }

  async function writeCharacteristic(uuid: string, value: Uint8Array): Promise<void> {
    if (!primaryService) return;
    try {
      const char = await primaryService.getCharacteristic(uuid);
      await char.writeValueWithoutResponse(value);
    } catch (e) {
      console.error("Write error:", e);
    }
  }

  async function fetchState(): Promise<DeviceState> {
    const [tempVal, targetVal, heatVal, fanVal, fanSpeedVal, battVal] = await Promise.all([
      readCharacteristic(SB_CHAR_TEMPERATURE),
      readCharacteristic(SB_CHAR_TARGET_TEMP),
      readCharacteristic(SB_CHAR_HEAT_ON_OFF),
      readCharacteristic(SB_CHAR_FAN_ON_OFF),
      readCharacteristic(SB_CHAR_FAN_SPEED),
      readCharacteristic(SB_CHAR_BATTERY),
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
    serviceUUIDs: [SB_PRIMARY_SERVICE, SB_CLIMATE_SERVICE],
    nameFilter: ["VOLCANO"],

    async connect(device) {
      server = await device.gatt!.connect();
      primaryService = await server.getPrimaryService(SB_PRIMARY_SERVICE);
      cachedState = { ...cachedState, connected: true };

      pollingInterval = setInterval(async () => {
        const state = await fetchState();
        subscribers.forEach((cb) => cb(state));
      }, 2000);

      return fetchState();
    },

    async disconnect() {
      if (pollingInterval) clearInterval(pollingInterval);
      server?.disconnect();
      cachedState = { ...cachedState, connected: false };
    },

    async getState() {
      return fetchState();
    },

    async sendCommand(cmd: VaporizerCommand) {
      switch (cmd.type) {
        case "set_temperature": {
          const raw = Math.round((cmd.value ?? 185) * 10);
          const buf = new Uint8Array(2);
          const view = new DataView(buf.buffer);
          view.setUint16(0, raw, true);
          await writeCharacteristic(SB_CHAR_TARGET_TEMP, buf);
          break;
        }
        case "toggle_heat":
          await writeCharacteristic(SB_CHAR_HEAT_ON_OFF, new Uint8Array([cachedState.isHeating ? 0 : 1]));
          cachedState.isHeating = !cachedState.isHeating;
          break;
        case "toggle_fan":
          await writeCharacteristic(SB_CHAR_FAN_ON_OFF, new Uint8Array([cachedState.fanOn ? 0 : 1]));
          cachedState.fanOn = !cachedState.fanOn;
          break;
        case "set_fan_speed":
          await writeCharacteristic(SB_CHAR_FAN_SPEED, new Uint8Array([cmd.value ?? 5]));
          cachedState.fanSpeed = cmd.value ?? 5;
          break;
        case "power_off":
          await writeCharacteristic(SB_CHAR_HEAT_ON_OFF, new Uint8Array([0]));
          await writeCharacteristic(SB_CHAR_FAN_ON_OFF, new Uint8Array([0]));
          break;
      }
      subscribers.forEach((cb) => cb({ ...cachedState }));
    },

    subscribeToUpdates(callback) {
      subscribers.push(callback);
      return () => {
        const idx = subscribers.indexOf(callback);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    },

    async getRawData() {
      return cachedState.rawData ?? {};
    },
  };
}

export function createVentyAdapter(): VaporizerAdapter {
  const base = createVolcanoHybridAdapter();
  return {
    ...base,
    deviceType: "venty",
    displayName: "Venty",
    manufacturer: "Storz & Bickel",
    nameFilter: ["VENTY"],
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
