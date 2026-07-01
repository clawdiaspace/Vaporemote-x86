import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import {
  requestBluetoothDevice,
  requestBluetoothDeviceForAdapter,
  generateDeviceId,
  DEFAULT_DEVICE_STATE,
  isWebBluetoothSupported,
  getUnsupportedReason,
} from "@/lib/bluetooth";
import type { DeviceState, VaporizerType, VaporizerCommand } from "@/lib/bluetooth";
import { getAllAdapters } from "@/lib/devices";
import type { VaporizerAdapter } from "@/lib/devices";
import { DEVICE_DISPLAY_NAMES, DEVICE_MANUFACTURERS } from "@/lib/devices";
import {
  loadSessions, saveSessions, startSession, updateSession, endSession
} from "@/lib/stats";
import type { Session } from "@/lib/stats";
import { useToast } from "@/hooks/use-toast";

export interface ConnectedDevice {
  id: string;
  name: string;
  deviceType: VaporizerType;
  manufacturer: string;
  displayName: string;
  state: DeviceState;
  adapter: VaporizerAdapter;
  activeSession: Session | null;
  sessionMaxDuration: number;
  addedAt: number;
}

interface DeviceContextValue {
  devices: ConnectedDevice[];
  isConnecting: boolean;
  connectError: string | null;
  bluetoothSupported: boolean;
  bluetoothUnsupportedReason: string | null;
  connectDevice: (adapter?: VaporizerAdapter) => Promise<void>;
  disconnectDevice: (deviceId: string) => Promise<void>;
  sendCommand: (deviceId: string, cmd: VaporizerCommand) => Promise<void>;
  heatUp: (deviceId: string) => Promise<void>;
  heatOff: (deviceId: string) => Promise<void>;
  extendSession: (deviceId: string, extraSeconds: number) => void;
  setSessionMaxDuration: (deviceId: string, seconds: number) => void;
  startHeatingSession: (deviceId: string) => void;
  stopHeatingSession: (deviceId: string) => void;
  allSessions: Session[];
  clearError: () => void;
}

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [allSessions, setAllSessions] = useState<Session[]>(() => loadSessions());
  const adaptersRef = useRef(getAllAdapters());
  const unsubscribersRef = useRef<Record<string, () => void>>({});
  const { toast } = useToast();

  const bluetoothSupported = isWebBluetoothSupported();
  const bluetoothUnsupportedReason = getUnsupportedReason();

  useEffect(() => {
    return () => { Object.values(unsubscribersRef.current).forEach(fn => fn()); };
  }, []);

  const connectDevice = useCallback(async (preselectedAdapter?: VaporizerAdapter) => {
    setIsConnecting(true);
    setConnectError(null);
    try {
      let device: BluetoothDevice | null = null;
      let adapter: VaporizerAdapter;

      if (preselectedAdapter) {
        device = await requestBluetoothDeviceForAdapter(preselectedAdapter);
        if (!device) { setIsConnecting(false); return; }
        adapter = preselectedAdapter;
      } else {
        const result = await requestBluetoothDevice(adaptersRef.current);
        if (!result) { setIsConnecting(false); return; }
        device = result.device;
        adapter = result.adapter;
      }

      const deviceId = generateDeviceId(device);
      setDevices(prev => prev.filter(d => d.id !== deviceId));
      if (unsubscribersRef.current[deviceId]) {
        unsubscribersRef.current[deviceId]();
        delete unsubscribersRef.current[deviceId];
      }

      const deviceType = adapter.deviceType;
      const displayName = DEVICE_DISPLAY_NAMES[deviceType] ?? adapter.displayName;

      let initialState: DeviceState = { ...DEFAULT_DEVICE_STATE };
      let connectFailed = false;
      let connectErrMsg = "";

      try {
        initialState = await adapter.connect(device);
      } catch (connectErr: unknown) {
        connectFailed = true;
        const msg = connectErr instanceof Error ? connectErr.message : "Verbindung fehlgeschlagen";
        connectErrMsg = msg.includes("GATT") || msg.includes("service") || msg.includes("getPrimary")
          ? `Service nicht gefunden — prüfe ob der richtige Gerätetyp gewählt wurde. (${msg})`
          : msg;
        setConnectError(connectErrMsg);
        toast({
          title: `${displayName} — Verbindungsfehler`,
          description: connectErrMsg,
          variant: "destructive",
        });
      }

      const connectedDevice: ConnectedDevice = {
        id: deviceId,
        name: device.name ?? adapter.displayName,
        deviceType,
        manufacturer: DEVICE_MANUFACTURERS[deviceType] ?? adapter.manufacturer,
        displayName,
        state: { ...DEFAULT_DEVICE_STATE, ...initialState, connected: !connectFailed },
        adapter,
        activeSession: null,
        sessionMaxDuration: 300,
        addedAt: Date.now(),
      };

      if (!connectFailed) {
        const unsub = adapter.subscribeToUpdates((state) => {
          setDevices(prev => prev.map(d =>
            d.id === deviceId ? { ...d, state: { ...d.state, ...state } } : d
          ));
        });
        unsubscribersRef.current[deviceId] = unsub;
      }

      device.addEventListener("gattserverdisconnected", () => {
        setDevices(prev => prev.map(d =>
          d.id === deviceId ? { ...d, state: { ...d.state, connected: false } } : d
        ));
        toast({ title: `${displayName} getrennt`, description: "Bluetooth-Verbindung unterbrochen." });
      });

      setDevices(prev => [...prev.filter(d => d.id !== deviceId), connectedDevice]);

      if (!connectFailed) {
        toast({ title: `${displayName} verbunden`, description: "Gerät erfolgreich verbunden." });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Verbindung fehlgeschlagen";
      if (!(e instanceof DOMException && e.name === "NotFoundError")) {
        setConnectError(msg);
        toast({ title: "Fehler", description: msg, variant: "destructive" });
      }
    } finally {
      setIsConnecting(false);
    }
  }, [toast]);

  const disconnectDevice = useCallback(async (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;
    if (unsubscribersRef.current[deviceId]) {
      unsubscribersRef.current[deviceId]();
      delete unsubscribersRef.current[deviceId];
    }
    await device.adapter.disconnect();
    setDevices(prev => prev.filter(d => d.id !== deviceId));
  }, [devices]);

  const sendCommand = useCallback(async (deviceId: string, cmd: VaporizerCommand) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;
    await device.adapter.sendCommand(cmd);
    const newState = await device.adapter.getState();

    setDevices(prev => prev.map(d => {
      if (d.id !== deviceId) return d;
      let session = d.activeSession;
      if (session && newState.temperature) {
        session = updateSession(session, newState.temperature);
      }
      return { ...d, state: { ...d.state, ...newState }, activeSession: session };
    }));
  }, [devices]);

  const startHeatingSession = useCallback((deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device || device.activeSession) return;
    const session = startSession(deviceId, device.deviceType, device.displayName, device.state.targetTemperature ?? 185);
    setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, activeSession: session } : d));
  }, [devices]);

  const stopHeatingSession = useCallback((deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device?.activeSession) return;
    const finished = endSession(device.activeSession);
    const updated = [...allSessions, finished];
    setAllSessions(updated);
    saveSessions(updated);
    setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, activeSession: null } : d));
  }, [devices, allSessions]);

  const heatUp = useCallback(async (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device || !device.state.connected) return;
    if (!device.state.isHeating) {
      await device.adapter.sendCommand({ type: "toggle_heat" });
      const newState = await device.adapter.getState();
      const session = startSession(deviceId, device.deviceType, device.displayName, device.state.targetTemperature ?? 185);
      setDevices(prev => prev.map(d =>
        d.id === deviceId ? { ...d, state: { ...d.state, ...newState }, activeSession: session } : d
      ));
    }
  }, [devices]);

  const heatOff = useCallback(async (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device || !device.state.connected) return;
    if (device.state.isHeating) {
      await device.adapter.sendCommand({ type: "toggle_heat" });
    }
    const newState = await device.adapter.getState();
    let updated = [...allSessions];
    if (device.activeSession) {
      const finished = endSession(device.activeSession);
      updated = [...allSessions, finished];
      setAllSessions(updated);
      saveSessions(updated);
    }
    setDevices(prev => prev.map(d =>
      d.id === deviceId
        ? { ...d, state: { ...d.state, ...newState, isHeating: false }, activeSession: null }
        : d
    ));
  }, [devices, allSessions]);

  const extendSession = useCallback((deviceId: string, extraSeconds: number) => {
    setDevices(prev => prev.map(d =>
      d.id === deviceId ? { ...d, sessionMaxDuration: d.sessionMaxDuration + extraSeconds } : d
    ));
  }, []);

  const setSessionMaxDuration = useCallback((deviceId: string, seconds: number) => {
    setDevices(prev => prev.map(d =>
      d.id === deviceId ? { ...d, sessionMaxDuration: seconds } : d
    ));
  }, []);

  return (
    <DeviceContext.Provider value={{
      devices,
      isConnecting,
      connectError,
      bluetoothSupported,
      bluetoothUnsupportedReason,
      connectDevice,
      disconnectDevice,
      sendCommand,
      heatUp,
      heatOff,
      extendSession,
      setSessionMaxDuration,
      startHeatingSession,
      stopHeatingSession,
      allSessions,
      clearError: () => setConnectError(null),
    }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevices() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error("useDevices must be used within DeviceProvider");
  return ctx;
}
