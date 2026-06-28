/** Sync CLI model registry into web for builds that only copy web/ (e.g. Docker). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = path.join(root, "packages/cli/data/models.json");
const destDir = path.join(root, "web/src/data");
const dest = path.join(destDir, "oi-models.json");

if (fs.existsSync(src)) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`Synced ${src} → ${dest}`);
} else if (fs.existsSync(dest)) {
  console.log(`Using existing ${dest}`);
} else {
  console.error(`Missing oi catalog — expected ${src} or ${dest}`);
  process.exit(1);
}
