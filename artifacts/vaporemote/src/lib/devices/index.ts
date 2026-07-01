import { createVolcanoHybridAdapter, createVentyAdapter, createCraftyPlusAdapter } from "./storz-bickel";
import { createPuffcoPeakAdapter, createPuffcoPeakProAdapter } from "./puffco";
import { createCartaAdapter, createCartaSportAdapter } from "./focus-v";
import { createDrDabberSwitchAdapter, createDrDabberBoostEvoAdapter } from "./dr-dabber";
import { createArizerSoloAdapter, createArizerAirAdapter, createPax3Adapter, createDaVinciIQ2Adapter } from "./additional";
import type { VaporizerAdapter, VaporizerType } from "../bluetooth";

// Re-export factory functions for use in per-device connect UI
export {
  createVolcanoHybridAdapter, createVentyAdapter, createCraftyPlusAdapter,
} from "./storz-bickel";
export {
  createPuffcoPeakProAdapter, createPuffcoPeakAdapter,
} from "./puffco";
export {
  createCartaSportAdapter, createCartaAdapter,
} from "./focus-v";
export {
  createDrDabberSwitchAdapter, createDrDabberBoostEvoAdapter,
} from "./dr-dabber";
export {
  createArizerAirAdapter, createPax3Adapter, createDaVinciIQ2Adapter,
} from "./additional";

function createVolcanoClassicPlaceholder(): VaporizerAdapter {
  return {
    deviceType: "volcano_classic",
    displayName: "Volcano Classic",
    manufacturer: "Storz & Bickel",
    serviceUUIDs: [],
    hidden: true,
    capabilities: {
      hasHeat: false, hasFan: false, hasLed: false, hasAutoShutoff: false,
      hasBoost: false, hasProfiles: false, hasBattery: false, hasCharging: false, hasWorkflows: false,
    },
    statusNote: "No BLE radio — not connectable",
    async connect() { throw new Error("Volcano Classic has no BLE radio"); },
    async disconnect() {},
    async getState() { return { connected: false, temperature: null, targetTemperature: null, isHeating: false, batteryLevel: null, mode: null }; },
    async sendCommand() {},
    subscribeToUpdates() { return () => {}; },
  };
}

export function getAllAdapters(): VaporizerAdapter[] {
  return [
    createVolcanoHybridAdapter(),
    createVentyAdapter(),
    createCraftyPlusAdapter(),
    createPuffcoPeakAdapter(),
    createPuffcoPeakProAdapter(),
    createCartaSportAdapter(),
    createCartaAdapter(),
    createDrDabberSwitchAdapter(),
    createDrDabberBoostEvoAdapter(),
    createArizerSoloAdapter(),
    createArizerAirAdapter(),
    createPax3Adapter(),
    createDaVinciIQ2Adapter(),
    createVolcanoClassicPlaceholder(),
  ].filter(a => !a.hidden);
}

export function getAllAdaptersIncludingHidden(): VaporizerAdapter[] {
  return [
    createVolcanoHybridAdapter(),
    createVentyAdapter(),
    createCraftyPlusAdapter(),
    createPuffcoPeakAdapter(),
    createPuffcoPeakProAdapter(),
    createCartaSportAdapter(),
    createCartaAdapter(),
    createDrDabberSwitchAdapter(),
    createDrDabberBoostEvoAdapter(),
    createArizerSoloAdapter(),
    createArizerAirAdapter(),
    createPax3Adapter(),
    createDaVinciIQ2Adapter(),
    createVolcanoClassicPlaceholder(),
  ];
}

export const DEVICE_DISPLAY_NAMES: Record<VaporizerType, string> = {
  volcano_hybrid:     "Volcano Hybrid",
  volcano_classic:    "Volcano Classic",
  venty:              "Venty",
  crafty_plus:        "Crafty+",
  puffco_peak:        "Peak",
  puffco_peak_pro:    "Peak Pro",
  focus_carta:        "Carta",
  focus_carta_sport:  "Carta Sport",
  dr_dabber_switch:   "Switch",
  dr_dabber_boost_evo:"Boost EVO",
  arizer_solo:        "Solo 2",
  arizer_air:         "Air 2",
  pax3:               "PAX 3",
  davinci_iq2:        "IQ2",
  unknown:            "Unknown Device",
};

export const DEVICE_MANUFACTURERS: Record<VaporizerType, string> = {
  volcano_hybrid:     "Storz & Bickel",
  volcano_classic:    "Storz & Bickel",
  venty:              "Storz & Bickel",
  crafty_plus:        "Storz & Bickel",
  puffco_peak:        "Puffco",
  puffco_peak_pro:    "Puffco",
  focus_carta:        "Focus V",
  focus_carta_sport:  "Focus V",
  dr_dabber_switch:   "Dr. Dabber",
  dr_dabber_boost_evo:"Dr. Dabber",
  arizer_solo:        "Arizer",
  arizer_air:         "Arizer",
  pax3:               "PAX",
  davinci_iq2:        "DaVinci",
  unknown:            "Unknown",
};

export const DEVICE_TEMP_RANGES: Record<VaporizerType, { min: number; max: number; step: number }> = {
  volcano_hybrid:    { min: 40, max: 230, step: 1 },
  volcano_classic:   { min: 130, max: 230, step: 5 },
  venty:             { min: 40, max: 210, step: 1 },
  crafty_plus:       { min: 40, max: 210, step: 1 },
  puffco_peak:       { min: 150, max: 320, step: 1 },
  puffco_peak_pro:   { min: 150, max: 320, step: 1 },
  focus_carta:       { min: 150, max: 320, step: 1 },
  focus_carta_sport: { min: 150, max: 320, step: 1 },
  dr_dabber_switch:  { min: 150, max: 320, step: 1 },
  dr_dabber_boost_evo:{ min: 150, max: 320, step: 1 },
  arizer_solo:       { min: 50, max: 220, step: 1 },
  arizer_air:        { min: 50, max: 220, step: 1 },
  pax3:              { min: 180, max: 215, step: 5 },
  davinci_iq2:       { min: 93, max: 221, step: 1 },
  unknown:           { min: 100, max: 250, step: 1 },
};

export type { VaporizerAdapter };
