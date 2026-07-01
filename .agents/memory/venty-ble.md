---
name: Venty BLE Protocol
description: Confirmed BLE UUIDs and advertising name for Storz & Bickel Venty
---

# Storz & Bickel Venty BLE Protocol

**Source:** firsttris/reactive-volcano-app (verified with real hardware)

## BLE Advertising Name
- Advertises as `"VY<serial>"` where serial = last 3+ chars of device serial number
- nameFilter MUST be `"VY"` (namePrefix), NOT "VENTY"

## Service UUID
- `00000001-5354-4f52-5a26-4249434b454c`
- (Volcano Hybrid uses `10100000-5354-4f52-5a26-4249434b454c` — completely different)

## Characteristics (same S&B suffix `5354-4f52-5a26-4249434b454c`)
| Char | UUID prefix | Access |
|---|---|---|
| Current Temp | `00000011` | Read/Notify |
| Target Temp | `00000021` | Read/Write |
| Heat On/Off | `00000031` | Write |
| Battery | `00000041` | Read/Notify |

## Encoding
- Temperature: uint16 LE, value = °C × 10
- Heat/bool: 0x00 = off, 0x01 = on

## Volcano Hybrid (for comparison)
- Service: `10100000-5354-4f52-5a26-4249434b454c`
- Temp: `10110001`, Target: `10110003`, Heat: `1011000f`, Fan: `10110013`, FanSpeed: `10110012`, Battery: `10110007`

**Why:** The Venty uses a different GATT profile family than the Volcano, though both use the S&B vendor suffix. Using Volcano UUIDs on a Venty will silently fail at getPrimaryService.
