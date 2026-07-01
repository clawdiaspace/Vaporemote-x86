import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import {
  requestBluetoothDevice,
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

export interface ConnectedDevice {
  id: string;
  name: string;
  deviceType: VaporizerType;
  manufacturer: string;
  displayName: string;
  state: DeviceState;
  adapter: VaporizerAdapter;
  activeSession: Session | null;
  addedAt: number;
}

interface DeviceContextValue {
  devices: ConnectedDevice[];
  isConnecting: boolean;
  connectError: string | null;
  bluetoothSupported: boolean;
  bluetoothUnsupportedReason: string | null;
  connectDevice: () => Promise<void>;
  disconnectDevice: (deviceId: string) => Promise<void>;
  sendCommand: (deviceId: string, cmd: VaporizerCommand) => Promise<void>;
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

  const bluetoothSupported = isWebBluetoothSupported();
  const bluetoothUnsupportedReason = getUnsupportedReason();

  useEffect(() => {
    return () => {
      Object.values(unsubscribersRef.current).forEach(fn => fn());
    };
  }, []);

  const connectDevice = useCallback(async () => {
    setIsConnecting(true);
    setConnectError(null);
    try {
      const result = await requestBluetoothDevice(adaptersRef.current);
      if (!result) { setIsConnecting(false); return; }

      const { device, adapter } = result;
      const deviceId = generateDeviceId(device);

      setDevices(prev => prev.filter(d => d.id !== deviceId));
      if (unsubscribersRef.current[deviceId]) {
        unsubscribersRef.current[deviceId]();
        delete unsubscribersRef.current[deviceId];
      }

      const initialState = await adapter.connect(device);
      const deviceType = adapter.deviceType;

      const connectedDevice: ConnectedDevice = {
        id: deviceId,
        name: device.name ?? adapter.displayName,
        deviceType,
        manufacturer: DEVICE_MANUFACTURERS[deviceType] ?? adapter.manufacturer,
        displayName: DEVICE_DISPLAY_NAMES[deviceType] ?? adapter.displayName,
        state: { ...DEFAULT_DEVICE_STATE, ...initialState, connected: true },
        adapter,
        activeSession: null,
        addedAt: Date.now(),
      };

      const unsub = adapter.subscribeToUpdates((state) => {
        setDevices(prev => prev.map(d =>
          d.id === deviceId ? { ...d, state: { ...d.state, ...state } } : d
        ));
      });
      unsubscribersRef.current[deviceId] = unsub;

      device.addEventListener("gattserverdisconnected", () => {
        setDevices(prev => prev.map(d =>
          d.id === deviceId ? { ...d, state: { ...d.state, connected: false } } : d
        ));
      });

      setDevices(prev => {
        const filtered = prev.filter(d => d.id !== deviceId);
        return [...filtered, connectedDevice];
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      setConnectError(msg);
    } finally {
      setIsConnecting(false);
    }
  }, []);

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
    const session = startSession(
      deviceId,
      device.deviceType,
      device.displayName,
      device.state.targetTemperature ?? 185
    );
    setDevices(prev => prev.map(d =>
      d.id === deviceId ? { ...d, activeSession: session } : d
    ));
  }, [devices]);

  const stopHeatingSession = useCallback((deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device?.activeSession) return;
    const finished = endSession(device.activeSession);
    const updated = [...allSessions, finished];
    setAllSessions(updated);
    saveSessions(updated);
    setDevices(prev => prev.map(d =>
      d.id === deviceId ? { ...d, activeSession: null } : d
    ));
  }, [devices, allSessions]);

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
