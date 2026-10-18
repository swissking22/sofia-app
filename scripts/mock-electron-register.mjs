/**
 * ESM register hook so scripts can import Electron-bound main modules.
 * Usage:
 *   node --import ./scripts/mock-electron-register.mjs --import tsx scripts/pushSunriseStaffMobile.ts --dev
 */
import { register } from "node:module";

register("./mock-electron-hook.mjs", import.meta.url);
