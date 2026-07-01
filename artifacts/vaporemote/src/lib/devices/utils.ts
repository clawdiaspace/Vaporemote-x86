export async function connectWithServiceFallback(
  device: BluetoothDevice,
  primaryUUID: string,
  fallbackUUIDs: string[] = []
): Promise<{
  server: BluetoothRemoteGATTServer;
  service: BluetoothRemoteGATTService | null;
  serviceUUID: string | null;
}> {
  const server = await device.gatt!.connect();

  for (const uuid of [primaryUUID, ...fallbackUUIDs]) {
    try {
      const service = await server.getPrimaryService(uuid);
      return { server, service, serviceUUID: uuid };
    } catch { /* try next */ }
  }

  try {
    const services = await server.getPrimaryServices();
    if (services.length > 0) {
      const service = services[0];
      console.warn(`[BLE] Expected ${primaryUUID}, got ${service.uuid}`);
      return { server, service, serviceUUID: service.uuid };
    }
  } catch { /* can't enumerate */ }

  console.warn(`[BLE] Connected, no accessible service. Expected: ${primaryUUID}`);
  return { server, service: null, serviceUUID: null };
}
