import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mockUrl = pathToFileURL(path.join(here, "mock-electron-module.mjs")).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "electron") {
    return {
      shortCircuit: true,
      url: mockUrl,
    };
  }
  return nextResolve(specifier, context);
}
