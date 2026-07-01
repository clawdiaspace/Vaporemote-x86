---
name: VapoRemote BLE adapter patterns
description: UUIDs, protocol notes, and architecture decisions for all VapoRemote vaporizer adapters
---

# VapoRemote BLE Protocol Notes

## Key Architecture
- BLE adapters live in `artifacts/vaporemote/src/lib/devices/`
- `connectWithServiceFallback` in `utils.ts` is the shared connect helper — has 12s/8s timeouts
- All adapters must implement `VaporizerAdapter` from `bluetooth.ts`
- `requestBluetoothDeviceForAdapter` uses `namePrefix` filters (NOT `acceptAllDevices`)

## Storz & Bickel (storz-bickel.ts)
- SB_SUFFIX: `5354-4f52-5a26-4249434b454c` (ASCII STORZ&BICKEL)
- Volcano service: `10110000-SB_SUFFIX` — heat ON char: `10110010`, heat OFF: `10110011`, fan ON: `10110013`, fan OFF: `10110014`
- Venty service: `10100000-SB_SUFFIX` — different service!
- Status bitfield char: `1011000c`, battery: `10110030`
- LED brightness char: `10110005`, auto-shutoff: `10110060`
- Volcano uses SEPARATE on/off chars for heat and fan (not toggle — write 0x00 to dedicated char)

## Focus V Carta Sport (focus-v.ts)
- Service: `0000fee9`, write char: `d44bc439-...-129600`, notify: `...9601`
- Commands: `[0xef, sub_byte, payload...]`
- Official profiles (factory default): Blue 480°F/60s, Yellow 495°F/55s, Green 515°F/50s, Purple 535°F/45s, Red 565°F/40s
- set_profile command also sends LED RGB (`0xef, 0x0b, r, g, b`) and timer (`0xef, 0x09, secs`)
- Temperature encoded as °C × 10, big-endian
- Carta (original): same service UUIDs, no preset profiles

## Puffco Peak Pro (puffco.ts)
- Service: `f0cd1900-0951-4504-bfd9-eb0b66e1c6e0` (community source)
- Chars: temp `f0cd1400-...`, profile temp `f0cd1500-...`, state `f0cd0300-...`, heat cmd `f0cd0400-...`, battery `f0cd0900-...`
- **Warning**: Fr0st3h RE uses base `f9a98c15-c651-4f34-b656-d100bf5800XX` — different UUIDs, may be more accurate

## Arizer (additional.ts)
- **Solo 2: NO Bluetooth** — experimental only, uses guessed UUIDs `00ff0000`
- **Air 2**: service `0000ffe0`, single UART char `0000ffe1` (both TX and RX, notify + write)
- Air 2 protocol: binary `[0xAA, cmd, payload..., 0x55]` framing (community RE), ASCII fallback
- Air 2 nameFilter: `["Air 2", "ArZ-Air", "Arizer Air"]`

## Dr. Dabber (dr-dabber.ts)
- Switch (gen 1): NO Bluetooth. Switch² (gen 2) has BLE
- Service `000060aa-...`, write `0000eee1-...`, read `0000eee2-...`
- Command frame: `[0xaa, cmd, len, ...data, 0x55]`

## PAX 3 (additional.ts)
- Service `8e320200-64d2-11e6-bdf4-0800200c9a66`
- Has proprietary encryption — full protocol requires key derivation (not implemented)

## DeviceContext error handling
- `heatUp`, `heatOff`, `sendCommand` all have try/catch — errors toast with description
- `getState()` is always wrapped independently (soft failure — keeps last state)
- **Why**: BLE reads after command can throw if GATT is busy/disconnected, must not propagate to UI

## BLE connection timeout
- `connectWithServiceFallback` hard-times out at 12s for `gatt.connect()`, 8s per service lookup
- **Why**: Prevents infinite browser lock-up when user picks a wrong/non-supported device
