// ─── Timeout helper — prevents infinite hang on wrong/unresponsive device ─────
const CONNECT_TIMEOUT_MS = 12000; // 12 s for gatt.connect()
const SERVICE_TIMEOUT_MS = 8000;  // 8 s per service lookup

function raceTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let tid: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    tid = setTimeout(() => reject(new Error(`BLE timeout (${ms / 1000}s): ${label}`)), ms);
  });
  return Promise.race([
    promise.then((v) => { if (tid !== null) clearTimeout(tid); return v; }),
    timeout,
  ]);
}

// ─── connectWithServiceFallback ───────────────────────────────────────────────
//
// Connects to a BLE GATT server and resolves the primary service.
// Tries primaryUUID → fallbackUUIDs → getPrimaryServices().
// Hard-times out to prevent browser lock-up when a wrong device is chosen.
//
export async function connectWithServiceFallback(
  device: BluetoothDevice,
  primaryUUID: string,
  fallbackUUIDs: string[] = []
): Promise<{
  server: BluetoothRemoteGATTServer;
  service: BluetoothRemoteGATTService | null;
  serviceUUID: string | null;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const server: any = await raceTimeout(
    device.gatt!.connect() as Promise<unknown>,
    CONNECT_TIMEOUT_MS,
    `gatt.connect() for "${device.name ?? "unknown"}"`
  );

  for (const uuid of [primaryUUID, ...fallbackUUIDs]) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const service: any = await raceTimeout(
        server.getPrimaryService(uuid) as Promise<unknown>,
        SERVICE_TIMEOUT_MS,
        `getPrimaryService(${uuid})`
      );
      return { server, service, serviceUUID: uuid };
    } catch { /* try next */ }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const services: any[] = await raceTimeout(
      server.getPrimaryServices() as Promise<unknown[]>,
      SERVICE_TIMEOUT_MS,
      "getPrimaryServices()"
    );
    if (services.length > 0) {
      const svc = services[0];
      console.warn(`[BLE] Expected ${primaryUUID}, using first found: ${svc.uuid}`);
      return { server, service: svc, serviceUUID: svc.uuid };
    }
  } catch { /* can't enumerate */ }

  console.warn(`[BLE] No service found. Expected: ${primaryUUID}`);
  return { server, service: null, serviceUUID: null };
}
