#!/usr/bin/env node
/**
 * Fail the build if published dist/ still references the private schemas package
 * (doc 22 §4.6 / §6).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const NEEDLE = "@anaxer/schemas";

function walk(dir) {
  /** @type {string[]} */
  const files = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files.push(...walk(p));
    else files.push(p);
  }
  return files;
}

const hits = [];
for (const file of walk(distDir)) {
  if (readFileSync(file, "utf8").includes(NEEDLE)) hits.push(file);
}

if (hits.length > 0) {
  console.error(`assert-dist-clean: found "${NEEDLE}" in:`);
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}

console.log("assert-dist-clean: ok");
