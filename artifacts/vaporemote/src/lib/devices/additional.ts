import type { VaporizerAdapter, DeviceState, VaporizerCommand } from "../bluetooth";

function createGenericPollingAdapter(config: {
  deviceType: "arizer_solo" | "arizer_air" | "pax3" | "davinci_iq2";
  displayName: string;
  manufacturer: string;
  nameFilter: string | string[];
  serviceUUID: string;
  tempCharUUID: string;
  targetCharUUID: string;
  batteryCharUUID?: string;
  tempDivisor?: number;
}): VaporizerAdapter {
  let server: BluetoothRemoteGATTServer | null = null;
  let service: BluetoothRemoteGATTService | null = null;
  const subscribers: Array<(s: DeviceState) => void> = [];
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  const { tempDivisor = 10 } = config;

  let cached: DeviceState = {
    connected: false, temperature: null, targetTemperature: null,
    isHeating: false, batteryLevel: null, mode: "conduction", rawData: {},
  };

  async function read(uuid: string): Promise<DataView | null> {
    if (!service) return null;
    try { return await (await service.getCharacteristic(uuid)).readValue(); }
    catch { return null; }
  }

  async function fetchState(): Promise<DeviceState> {
    const temps = await Promise.all([
      read(config.tempCharUUID),
      read(config.targetCharUUID),
      config.batteryCharUUID ? read(config.batteryCharUUID) : Promise.resolve(null),
    ]);
    const [tv, tgtv, batv] = temps;
    const raw: Record<string, unknown> = {};
    if (tv) raw.temp_raw = tv.byteLength >= 2 ? tv.getUint16(0, true) : tv.getUint8(0);
    if (tgtv) raw.target_raw = tgtv.byteLength >= 2 ? tgtv.getUint16(0, true) : tgtv.getUint8(0);
    if (batv) raw.battery_raw = batv.getUint8(0);

    cached = {
      ...cached,
      connected: server?.connected ?? false,
      temperature: tv
        ? ((tv.byteLength >= 2 ? tv.getUint16(0, true) : tv.getUint8(0)) / tempDivisor)
        : cached.temperature,
      targetTemperature: tgtv
        ? ((tgtv.byteLength >= 2 ? tgtv.getUint16(0, true) : tgtv.getUint8(0)) / tempDivisor)
        : cached.targetTemperature,
      batteryLevel: batv ? batv.getUint8(0) : cached.batteryLevel,
      isHeating:
        cached.temperature !== null &&
        cached.targetTemperature !== null &&
        cached.temperature < cached.targetTemperature - 2,
      rawData: raw,
    };
    return cached;
  }

  return {
    deviceType: config.deviceType,
    displayName: config.displayName,
    manufacturer: config.manufacturer,
    serviceUUIDs: [config.serviceUUID],
    nameFilter: config.nameFilter,

    async connect(device) {
      server = await device.gatt!.connect();
      service = await server.getPrimaryService(config.serviceUUID);
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

    async sendCommand(cmd: VaporizerCommand) {
      if (!service) return;
      if (cmd.type === "set_temperature") {
        const raw = Math.round((cmd.value ?? 200) * tempDivisor);
        const buf = new Uint8Array(2);
        new DataView(buf.buffer).setUint16(0, raw, true);
        try {
          const ch = await service.getCharacteristic(config.targetCharUUID);
          await ch.writeValueWithoutResponse(buf);
          cached.targetTemperature = cmd.value ?? 200;
        } catch (e) { console.error("Set temp error:", e); }
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

export function createArizerSoloAdapter(): VaporizerAdapter {
  return createGenericPollingAdapter({
    deviceType: "arizer_solo",
    displayName: "Solo 2",
    manufacturer: "Arizer",
    nameFilter: ["ArZ", "Arizer", "Solo"],
    serviceUUID: "00ff0000-0000-1000-8000-00805f9b34fb",
    tempCharUUID: "0000ff01-0000-1000-8000-00805f9b34fb",
    targetCharUUID: "0000ff03-0000-1000-8000-00805f9b34fb",
    batteryCharUUID: "0000ff05-0000-1000-8000-00805f9b34fb",
  });
}

export function createArizerAirAdapter(): VaporizerAdapter {
  const base = createArizerSoloAdapter();
  return { ...base, deviceType: "arizer_air", displayName: "Air 2", nameFilter: ["Air"] };
}

export function createPax3Adapter(): VaporizerAdapter {
  return createGenericPollingAdapter({
    deviceType: "pax3",
    displayName: "PAX 3",
    manufacturer: "PAX",
    nameFilter: ["PAX", "Pax 3"],
    serviceUUID: "8e320200-64d2-11e6-bdf4-0800200c9a66",
    tempCharUUID: "8e320201-64d2-11e6-bdf4-0800200c9a66",
    targetCharUUID: "8e320202-64d2-11e6-bdf4-0800200c9a66",
    batteryCharUUID: "8e320203-64d2-11e6-bdf4-0800200c9a66",
  });
}

export function createDaVinciIQ2Adapter(): VaporizerAdapter {
  return createGenericPollingAdapter({
    deviceType: "davinci_iq2",
    displayName: "IQ2",
    manufacturer: "DaVinci",
    nameFilter: ["DaVinci", "IQ2", "IQ 2"],
    serviceUUID: "0000fff0-0000-1000-8000-00805f9b34fb",
    tempCharUUID: "0000fff1-0000-1000-8000-00805f9b34fb",
    targetCharUUID: "0000fff2-0000-1000-8000-00805f9b34fb",
    batteryCharUUID: "0000fff3-0000-1000-8000-00805f9b34fb",
  });
}
