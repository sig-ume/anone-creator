import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { obfuscate } from "javascript-obfuscator";
import { dirname } from "path";

const INPUT = "server/public/app.js";
const OUTPUT = "build/public/app.js";

const code = readFileSync(INPUT, "utf-8");

const result = obfuscate(code, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: false,
  debugProtection: false,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayEncoding: ["base64"],
  splitStrings: true,
  splitStringsChunkLength: 10,
  target: "browser",
});

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, result.getObfuscatedCode(), "utf-8");
console.log("Obfuscated: " + INPUT + " -> " + OUTPUT);
