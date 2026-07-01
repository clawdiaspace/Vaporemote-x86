---
name: Volcano Hybrid BLE Protocol
description: Full verified GATT UUID map for Storz & Bickel Volcano Hybrid, sourced from community RE
---

SB_SUFFIX = `5354-4f52-5a26-4249434b454c` (ASCII: STORZ&BICKEL)
Service UUID: `10110000-SB_SUFFIX` (NOT 10100000 — that is Venty's service)

## Characteristics (all under 10110000 service)
- `10110001` — Current temp, Read/Notify, uint16 LE, °C×10
- `10110003` — Target temp, Read/Write, uint16 LE, °C×10
- `10110004` — Temp unit, Read/Write, uint8 0=°C 1=°F
- `10110005` — LED brightness, Read/Write, uint8 0–100
- `10110007` — Serial number, Read, string (NOT battery!)
- `10110008` — Firmware version, Read, string
- `10110009` — BLE firmware, Read, string
- `1011000c` — Status bitfield, Read/Notify, uint32 LE
  - bits: 0x0001=heater on, 0x0002=fan on, 0x0010=at temp, 0x0020=auto-shutoff
- `10110010` — Heater ON, Write 0x00 (separate from OFF!)
- `10110011` — Heater OFF, Write 0x00
- `10110013` — Fan ON, Write 0x00
- `10110014` — Fan OFF, Write 0x00
- `10110015` — Auto-shutoff, Read/Write, uint16 LE minutes (0=disabled)
- `10110020` — Workflow step count, Read/Write, uint16 LE
- `10110021` — Workflow step data, Write, 8 bytes: [idx:1][type:1][temp:2 LE][duration:2 LE][fan:1][pad:1]
- `10110022` — Workflow control, Write, 0x01=start 0x00=stop
- `10110030` — Battery level, Read/Notify, uint8 0–100%
- `10110031` — Battery charging, Read/Notify, uint8 0=no 1=yes

**Why:** Heat/fan use SEPARATE ON and OFF characteristics (not a single toggle). Writing 0x00 to the ON char activates it, 0x00 to OFF deactivates. State read from bitfield at 1011000c.

**How to apply:** Always check adapter state before choosing ON vs OFF char. Status notifications give real-time heater/fan/ready state without polling.
