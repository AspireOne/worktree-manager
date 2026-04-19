import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
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

function toConfigPath(filePath) {
  return filePath.split(sep).join('/');
}

function detectEnvFiles(targetDir) {
  const ignoredDirs = new Set(['.git', '.trees', 'node_modules']);
  const matches = [];

  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) visit(join(dir, entry.name));
        continue;
      }

      if (!entry.isFile()) continue;
      if (entry.name !== '.env' && !entry.name.startsWith('.env.')) continue;

      matches.push(toConfigPath(relative(targetDir, join(dir, entry.name))));
    }
  }

  visit(targetDir);
  return matches.sort();
}

function detectSetupCommands(targetDir) {
  const steps = [];
  const detections = [];
  const envFiles = detectEnvFiles(targetDir);

  for (const envFile of envFiles) {
    steps.push({ copy: envFile });
    detections.push(`env:${envFile}`);
  }

  if (!envFiles.includes('.env') && envFiles.includes('.env.example')) {
    steps.push({ copy: '.env.example', to: '.env' });
    detections.push('env:.env.example->.env');
  }

  const packageManager = detectNodePackageManager(targetDir);
  if (packageManager) {
    steps.push({ run: `${packageManager} install` });
    detections.push(`node:${packageManager}`);
  }

  return { steps, detections };
}

function renderSetupStep(step) {
  const lines = ['[[setup]]'];

  if (step.copy) {
    lines.push(`copy = ${quoteTomlString(step.copy)}`);
    if (step.to) lines.push(`to = ${quoteTomlString(step.to)}`);
    if (step.overwrite) lines.push('overwrite = true');
    return lines.join('\n');
  }

  if (step.run) {
    lines.push(`run = ${quoteTomlString(step.run)}`);
    if (step.cwd) lines.push(`cwd = ${quoteTomlString(step.cwd)}`);
    return lines.join('\n');
  }

  throw new Error(`Unsupported setup step: ${JSON.stringify(step)}`);
}

function renderSetupBlock(steps) {
  if (!steps.length) return '# Add repo-specific [[setup]] steps here.';

  return steps.map(renderSetupStep).join('\n\n');
}

export function bootstrapLocalConfig(targetDir = process.cwd()) {
  const targetPath = resolve(join(targetDir, '.wtm.config.toml'));

  if (existsSync(targetPath)) {
    die(`Config already exists at ${targetPath}`);
  }

  const template = readFileSync(LOCAL_CONFIG_TEMPLATE_URL, 'utf8');
  const { steps, detections } = detectSetupCommands(targetDir);
  const contents = template.replace(SETUP_BLOCK_TOKEN, renderSetupBlock(steps));

  writeFileSync(targetPath, contents, { encoding: 'utf8', flag: 'wx' });
  log(`Created ${targetPath}`);

  if (detections.length) {
    log(`Detected setup hints: ${detections.join(', ')}`);
    return;
  }

  log('No setup steps detected; wrote an empty setup list.');
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
