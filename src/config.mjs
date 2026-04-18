import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseTomlDocument } from 'toml';
import { die, log, warn } from './log.mjs';
import { DEFAULT_THEME, resolveTheme } from './theme.mjs';

const LOCAL_CONFIG_TEMPLATE_URL = new URL('../.wtm.config.toml.example', import.meta.url);
const SETUP_BLOCK_TOKEN = '__SETUP_BLOCK__';

const DEFAULTS = {
  baseBranch: 'main',
  worktreeRoot: '.trees',
  shell: true,
  setup: [],
  theme: DEFAULT_THEME,
};

export function parseToml(src) {
  return parseTomlDocument(src);
}

function loadConfigFile(filePath) {
  if (!existsSync(filePath)) return {};

  try {
    return parseToml(readFileSync(filePath, 'utf8'));
  } catch (error) {
    warn(`Could not parse config at ${filePath}: ${error.message}`);
    return {};
  }
}

function quoteTomlString(value) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function quoteShellArg(value) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function buildNodeEvalCommand(script, args) {
  const quotedArgs = args.map((arg) => quoteShellArg(arg)).join(' ');
  return `node -e ${quoteShellArg(script)}${quotedArgs ? ` ${quotedArgs}` : ''}`;
}

function buildInstallCommand(packageManager) {
  return buildNodeEvalCommand(
    "const { spawnSync } = require('node:child_process'); const [pm, cwd] = process.argv.slice(1); const { status, error } = spawnSync(pm, ['install'], { cwd, stdio: 'inherit', shell: process.platform === 'win32' }); if (error) throw error; process.exit(status ?? 0);",
    [packageManager, '{target}'],
  );
}

function detectNodePackageManager(targetDir) {
  const packageJsonPath = join(targetDir, 'package.json');
  if (!existsSync(packageJsonPath)) return null;

  const lockfileDetectors = [
    { file: 'pnpm-lock.yaml', preset: 'pnpm' },
    { file: 'package-lock.json', preset: 'npm' },
    { file: 'npm-shrinkwrap.json', preset: 'npm' },
    { file: 'yarn.lock', preset: 'yarn' },
    { file: 'bun.lockb', preset: 'bun' },
    { file: 'bun.lock', preset: 'bun' },
  ];

  for (const { file, preset } of lockfileDetectors) {
    if (existsSync(join(targetDir, file))) return preset;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const packageManager = packageJson.packageManager;
    if (typeof packageManager === 'string') {
      if (packageManager.startsWith('pnpm@')) return 'pnpm';
      if (packageManager.startsWith('npm@')) return 'npm';
      if (packageManager.startsWith('yarn@')) return 'yarn';
      if (packageManager.startsWith('bun@')) return 'bun';
    }
  } catch (error) {
    warn(`Could not inspect ${packageJsonPath}: ${error.message}`);
  }

  return null;
}

function detectSetupCommands(targetDir) {
  const commands = [];
  const detections = [];

  if (existsSync(join(targetDir, '.env.example'))) {
    commands.push(buildNodeEvalCommand(
      "require('node:fs').copyFileSync(process.argv[1], process.argv[2])",
      ['{target}/.env.example', '{target}/.env'],
    ));
    detections.push('.env.example');
  }

  const packageManager = detectNodePackageManager(targetDir);
  if (packageManager) {
    commands.push(buildInstallCommand(packageManager));
    detections.push(`node:${packageManager}`);
  }

  return { commands, detections };
}

function renderSetupBlock(commands) {
  if (!commands.length) return 'setup = []';

  const lines = commands.map((command) => `  ${quoteTomlString(command)},`);
  return `setup = [\n${lines.join('\n')}\n]`;
}

export function bootstrapLocalConfig(targetDir = process.cwd()) {
  const targetPath = resolve(join(targetDir, '.wtm.config.toml'));

  if (existsSync(targetPath)) {
    die(`Config already exists at ${targetPath}`);
  }

  const template = readFileSync(LOCAL_CONFIG_TEMPLATE_URL, 'utf8');
  const { commands, detections } = detectSetupCommands(targetDir);
  const contents = template.replace(SETUP_BLOCK_TOKEN, renderSetupBlock(commands));

  writeFileSync(targetPath, contents, { encoding: 'utf8', flag: 'wx' });
  log(`Created ${targetPath}`);

  if (detections.length) {
    log(`Detected setup hints: ${detections.join(', ')}`);
    return;
  }

  log('No setup commands detected; wrote an empty setup list.');
}

export function loadConfig(repoRoot) {
  const global = loadConfigFile(join(homedir(), '.config', 'wtm', 'config.toml'));
  const local = loadConfigFile(join(repoRoot, '.wtm.config.toml'));
  return {
    ...DEFAULTS,
    ...global,
    ...local,
    theme: resolveTheme({
      ...(global.theme && typeof global.theme === 'object' ? global.theme : {}),
      ...(local.theme && typeof local.theme === 'object' ? local.theme : {}),
    }),
  };
}
