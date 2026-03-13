import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const sourceDir = resolve(repoRoot, 'extensions', 'openclaw-orchestrator');

function parseArgs(argv) {
  const result = { force: false, target: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--force') {
      result.force = true;
      continue;
    }
    if (arg === '--target') {
      result.target = argv[index + 1] ? resolve(argv[index + 1]) : null;
      index += 1;
      continue;
    }
  }
  return result;
}

function resolveDefaultTarget() {
  return resolve(os.homedir(), '.openclaw', 'extensions', 'openclaw-orchestrator');
}

const args = parseArgs(process.argv.slice(2));
const targetDir = args.target ?? resolveDefaultTarget();

if (!existsSync(sourceDir)) {
  console.error(`Plugin source not found: ${sourceDir}`);
  process.exit(1);
}

if (existsSync(targetDir)) {
  if (!args.force) {
    console.error(`Target already exists: ${targetDir}\nUse --force to overwrite.`);
    process.exit(1);
  }
  rmSync(targetDir, { recursive: true, force: true });
}

mkdirSync(dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, {
  recursive: true,
  force: true,
  filter: (entry) => !entry.includes(`${sourceDir}${requireSeparator()}node_modules`),
});

console.log(`Installed openclaw-orchestrator plugin to ${targetDir}`);
console.log('Next: cd into the target directory and run npm install --omit=dev if your OpenClaw extension loader does not do it automatically.');

function requireSeparator() {
  return process.platform === 'win32' ? '\\' : '/';
}
