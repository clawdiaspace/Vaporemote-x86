---
name: VapoRemote Architecture
description: Key architectural decisions for the VapoRemote PWA
---

# VapoRemote Architecture

## Device Connection Flow
- User opens DevicePickerModal → selects device type → `connectDevice(adapter)` called
- `requestBluetoothDeviceForAdapter(adapter)` uses only that adapter's name filters + service UUIDs
- This ensures correct `optionalServices` are declared before GATT connect
- Without pre-selection, BLE service discovery fails silently (Web BT won't let you access undeclared services)

## Error Handling
- Connection errors shown as toasts (useToast hook) AND stored in `connectError`
- GATT disconnect events shown as toast with device name

## Carta Sport
- BLE name: "CARTA SPORT" (confirmed)
- No public BLE protocol documentation — trying `0000fee9-0000-1000-8000-00805f9b34fb` as service UUID
- If getPrimaryService fails → shows error toast with friendly message

## TS Type Warnings (pre-existing)
- Web Bluetooth types (BluetoothDevice, BluetoothRemoteGATTServer, etc.) show TS errors
- This is pre-existing — Vite transpiles fine, types are available at runtime in Chrome/Bluefy
- File casing conflicts (Dashboard.tsx vs dashboard.tsx) also pre-existing

**Why device picker:** Auto-detecting device type from BLE name is unreliable (Venty is "VY+serial", not "VENTY"). Pre-selection guarantees the right adapter and service UUIDs are used.
