---
name: Venty BLE Protocol
description: Confirmed GATT UUID map for Storz & Bickel Venty (storz-rs verified)
---

SB_SUFFIX = `5354-4f52-5a26-4249434b454c`
Service UUID: `10100000-SB_SUFFIX` (different from Volcano's 10110000!)

## Characteristics
- `10100001` — Current temp, Read/Notify, uint16 LE, °C×10
- `10100003` — Target temp, Read/Write, uint16 LE, °C×10
- `10100031` — Heat on/off, Write, 0x01=on 0x00=off (single char toggle, unlike Volcano)
- `10100041` — Boost temperature, Read/Write, uint16 LE, °C×10
- `10110001` — Battery level (note: 10110 prefix, not 10100), Read/Notify, uint8 %
- Name filter: `["VY"]` (devices advertise as VY___XXX)

**Why:** Venty uses a SINGLE heat char with 0/1 value, unlike Volcano's separate ON/OFF chars.
