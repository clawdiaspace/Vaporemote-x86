---
name: VapoRemote architecture decisions
description: Key structural decisions and pitfalls for the VapoRemote React/Vite app
---

## Duplicate page files
The pages dir had both `Dashboard.tsx` and `dashboard.tsx` (same for Devices, Stats, Settings, Geek). TypeScript TS1261 fires on casing-only duplicates. Always remove lowercase copies when PascalCase exists.

**Why:** App.tsx imports via `@/pages/Dashboard` and TSC resolves both on case-insensitive filesystems, causing program conflicts.

## GroupCard hook-in-loop pattern
Never call `useState` inside a `.map()` — extract to a dedicated component. `GroupCard` was extracted from `GroupPanel` for exactly this reason.

**Why:** React's rules of hooks require hook calls to be at the top level of a component, not inside loops or conditionals.

## connectDevice signature
`connectDevice(adapter?: VaporizerAdapter)` — when used as an `onClick` handler without wrapping, TypeScript infers the MouseEvent as the `adapter` arg and errors. Always wrap: `onClick={() => connectDevice()}`.

## Capability flags pattern
All adapters expose `capabilities: { hasHeat, hasFan, hasLed, hasAutoShutoff, hasBoost, hasProfiles, hasBattery, hasCharging, hasWorkflows }`. Dashboard.tsx checks these before rendering buttons/sliders. PAX 3 has `hasHeat: false` and uses `statusNote` to explain why.

## DeviceStorage keys
- Known devices: `vaporemote_known_devices` (max 20, trimmed on save)
- Per-device settings: `vaporemote_device_settings_<deviceId>`
- Groups: `vaporemote_groups`
