import type { VaporizerAdapter, DeviceState, VaporizerCommand } from "../bluetooth";
import { connectWithServiceFallback } from "./utils";

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
      const conn = await connectWithServiceFallback(device, config.serviceUUID);
      server = conn.server;
      service = conn.service;
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

// Arizer Air 2 uses a dedicated UART-over-BLE stack (TI CC254x / HM-10 pattern).
// Service: 0000FFE0, TX+RX char: 0000FFE1 (single char for both write and notify).
// Protocol: binary framing [0xAA, cmd, ...payload, 0x55] — best-effort RE.
export function createArizerAir2Adapter(): VaporizerAdapter {
  const AIR2_SERVICE = "0000ffe0-0000-1000-8000-00805f9b34fb";
  const AIR2_UART    = "0000ffe1-0000-1000-8000-00805f9b34fb";

  let server: BluetoothRemoteGATTServer | null = null;
  let uartChar: BluetoothRemoteGATTCharacteristic | null = null;
  const subscribers: Array<(s: DeviceState) => void> = [];
  let notifyHandler: ((e: Event) => void) | null = null;
  let pollingInterval: ReturnType<typeof setInterval> | null = null;

  let cached: DeviceState = {
    connected: false, temperature: null, targetTemperature: null,
    isHeating: false, batteryLevel: null, mode: "convection", rawData: {},
  };

  function notify() { subscribers.forEach(cb => cb({ ...cached })); }

  async function send(data: Uint8Array): Promise<void> {
    if (!uartChar) return;
    try { await uartChar.writeValueWithoutResponse(data); }
    catch (e) { console.warn("Arizer Air 2 write:", e); }
  }

  function parsePacket(dv: DataView): void {
    if (dv.byteLength < 1) return;
    const bytes = new Uint8Array(dv.buffer);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(" ");
    const raw: Record<string, unknown> = { packet_hex: hex };

    // Binary framing 0xAA … 0x55 (community-documented pattern)
    if (bytes[0] === 0xaa && dv.byteLength >= 4) {
      const tempRaw = dv.getUint16(1, false);
      if (tempRaw > 0 && tempRaw < 5000) {
        cached.temperature = tempRaw / 10;
        raw.temp_raw = tempRaw;
      }
      if (dv.byteLength >= 6) {
        const tgtRaw = dv.getUint16(3, false);
        if (tgtRaw > 0 && tgtRaw < 5000) {
          cached.targetTemperature = tgtRaw / 10;
          raw.target_raw = tgtRaw;
        }
      }
      if (dv.byteLength >= 7) {
        const bat = bytes[5];
        if (bat <= 100) { cached.batteryLevel = bat; raw.battery = bat; }
      }
    }

    // ASCII fallback: "T=XXX.X S=XXX.X B=XX" style
    try {
      const text = new TextDecoder().decode(dv).trim();
      if (/[a-zA-Z=]/.test(text)) {
        raw.text = text;
        const tm = text.match(/T=([\d.]+)/); if (tm) cached.temperature = parseFloat(tm[1]);
        const sm = text.match(/S=([\d.]+)/); if (sm) cached.targetTemperature = parseFloat(sm[1]);
        const bm = text.match(/B=(\d+)/);    if (bm) cached.batteryLevel = parseInt(bm[1]);
      }
    } catch { /* not ASCII */ }

    if (cached.temperature !== null && cached.targetTemperature !== null) {
      cached.isHeating = cached.temperature < cached.targetTemperature - 2;
    }
    cached.rawData = { ...cached.rawData, ...raw };
  }

  return {
    deviceType: "arizer_air",
    displayName: "Air 2",
    manufacturer: "Arizer",
    serviceUUIDs: [AIR2_SERVICE],
    nameFilter: ["Air 2", "ArZ-Air", "Arizer Air"],

    async connect(device) {
      const conn = await connectWithServiceFallback(device, AIR2_SERVICE);
      server = conn.server;
      const service = conn.service;
      cached = { ...cached, connected: true };
      if (!service) return { ...cached };
      try {
        uartChar = await service.getCharacteristic(AIR2_UART);
        await uartChar.startNotifications();
        notifyHandler = (e) => {
          const ch = e.target as BluetoothRemoteGATTCharacteristic;
          if (ch.value) { parsePacket(ch.value); notify(); }
        };
        uartChar.addEventListener("characteristicvaluechanged", notifyHandler);
      } catch (e) { console.warn("Arizer Air 2: UART setup failed:", e); }
      pollingInterval = setInterval(() => send(new Uint8Array([0xaa, 0x01, 0x55])), 3000);
      await send(new Uint8Array([0xaa, 0x01, 0x55]));
      return { ...cached };
    },

    async disconnect() {
      if (pollingInterval) clearInterval(pollingInterval);
      if (uartChar && notifyHandler) {
        uartChar.removeEventListener("characteristicvaluechanged", notifyHandler);
        await uartChar.stopNotifications().catch(() => {});
      }
      server?.disconnect();
      cached = { ...cached, connected: false };
    },

    async getState() { return { ...cached }; },

    async sendCommand(cmd: VaporizerCommand) {
      switch (cmd.type) {
        case "set_temperature": {
          const raw = Math.round((cmd.value ?? 185) * 10);
          await send(new Uint8Array([0xaa, 0x11, (raw >> 8) & 0xff, raw & 0xff, 0x55]));
          cached.targetTemperature = cmd.value ?? 185;
          break;
        }
        case "toggle_heat":
          await send(new Uint8Array([0xaa, 0x12, cached.isHeating ? 0x00 : 0x01, 0x55]));
          cached.isHeating = !cached.isHeating;
          break;
        case "power_off":
          await send(new Uint8Array([0xaa, 0x12, 0x00, 0x55]));
          cached.isHeating = false;
          break;
      }
      notify();
    },

    subscribeToUpdates(cb) {
      subscribers.push(cb);
      return () => { const i = subscribers.indexOf(cb); if (i >= 0) subscribers.splice(i, 1); };
    },

    async getRawData() { return cached.rawData ?? {}; },
  };
}

// Legacy alias — kept for registry compatibility
export function createArizerAirAdapter(): VaporizerAdapter { return createArizerAir2Adapter(); }

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
