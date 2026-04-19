import { execSync, spawn, spawnSync } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { die, log } from './log.mjs';

function interpolate(command, vars) {
  return command.replace(/\{(\w+)\}/g, (_, key) => {
    if (!(key in vars)) {
      die(`Unknown template variable '{${key}}' in setup value: ${command}`);
    }

    return vars[key];
  });
}

function interpolateValue(value, vars, field) {
  if (typeof value !== 'string') die(`Setup field '${field}' must be a string`);
  return interpolate(value, vars);
}

function resolveConfiguredPath(value, vars, baseDir, field) {
  const interpolated = interpolateValue(value, vars, field);
  return isAbsolute(interpolated) ? interpolated : resolve(baseDir, interpolated);
}

function isSubpath(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function resolveCopyDestination(step, sourcePath, vars) {
  if (step.to !== undefined) {
    return resolveConfiguredPath(step.to, vars, vars.target, 'to');
  }

  if (isSubpath(vars.root, sourcePath)) {
    return resolve(vars.target, relative(vars.root, sourcePath));
  }

  return resolve(vars.target, basename(sourcePath));
}

function getSetupAction(step) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    die('Each setup entry must be a [[setup]] table');
  }

  const actions = ['copy', 'run'].filter((action) => step[action] !== undefined);
  if (actions.length !== 1) {
    die('Each setup step must contain exactly one action: copy or run');
  }

  return actions[0];
}

function runCopyStep(step, vars) {
  const sourcePath = resolveConfiguredPath(step.copy, vars, vars.root, 'copy');
  const targetPath = resolveCopyDestination(step, sourcePath, vars);
  const overwrite = step.overwrite === true;

  if (step.overwrite !== undefined && typeof step.overwrite !== 'boolean') {
    die("Setup field 'overwrite' must be a boolean");
  }

  if (!existsSync(sourcePath)) {
    die(`Setup copy source does not exist: ${sourcePath}`);
  }

  mkdirSync(dirname(targetPath), { recursive: true });

  if (!overwrite && existsSync(targetPath)) {
    log(`  copy skipped ${targetPath}`);
    return;
  }

  copyFileSync(sourcePath, targetPath);
  log(`  copy ${sourcePath} -> ${targetPath}`);
}

function runCommandStep(step, vars, shell) {
  const command = interpolateValue(step.run, vars, 'run');
  const cwd = step.cwd === undefined
    ? vars.target
    : resolveConfiguredPath(step.cwd, vars, vars.target, 'cwd');

  log(`  $ ${command}`);

  try {
    execSync(command, { shell: shell ?? true, stdio: 'inherit', cwd });
  } catch {
    die(`Setup command failed: ${command}`);
  }
}

function runSetupStep(step, vars, shell) {
  const action = getSetupAction(step);

  if (action === 'copy') {
    runCopyStep(step, vars);
    return;
  }

  if (action === 'run') {
    runCommandStep(step, vars, shell);
    return;
  }

  die(`Unknown setup action: ${action}`);
}

export function runSetup(steps, vars, shell) {
  if (!steps.length) return;

  log('Running setup...');
  for (const step of steps) {
    runSetupStep(step, vars, shell);
  }
}

export function runSetupBackground(steps, vars, shell) {
  if (!steps.length) return;

  const runner = `
const { copyFileSync, existsSync, mkdirSync } = require('node:fs');
const { execSync } = require('node:child_process');
const { basename, dirname, isAbsolute, relative, resolve } = require('node:path');
const steps = JSON.parse(process.argv[1]);
const cwd = process.argv[2];
const shell = JSON.parse(process.argv[3]);
const root = process.argv[4];
const branch = process.argv[5];
const vars = { target: cwd, root, branch };

function fail(message) {
  process.stderr.write(\`wtm: \${message}\\n\`);
  process.exit(1);
}

function interpolate(value, field) {
  if (typeof value !== 'string') fail(\`setup field '\${field}' must be a string\`);
  return value.replace(/\\{(\\w+)\\}/g, (_, key) => {
    if (!(key in vars)) fail(\`unknown template variable '{\${key}}' in setup \${field}\`);
    return vars[key];
  });
}

function resolvePath(value, baseDir, field) {
  const interpolated = interpolate(value, field);
  return isAbsolute(interpolated) ? interpolated : resolve(baseDir, interpolated);
}

function isSubpath(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function actionFor(step) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) fail('each setup entry must be a [[setup]] table');
  const actions = ['copy', 'run'].filter((action) => step[action] !== undefined);
  if (actions.length !== 1) fail('each setup step must contain exactly one action: copy or run');
  return actions[0];
}

for (const step of steps) {
  const action = actionFor(step);

  if (action === 'copy') {
    const sourcePath = resolvePath(step.copy, root, 'copy');
    const targetPath = step.to === undefined
      ? (isSubpath(root, sourcePath) ? resolve(cwd, relative(root, sourcePath)) : resolve(cwd, basename(sourcePath)))
      : resolvePath(step.to, cwd, 'to');
    const overwrite = step.overwrite === true;

    if (step.overwrite !== undefined && typeof step.overwrite !== 'boolean') fail("setup field 'overwrite' must be a boolean");
    if (!existsSync(sourcePath)) fail(\`setup copy source does not exist: \${sourcePath}\`);

    mkdirSync(dirname(targetPath), { recursive: true });
    if (!overwrite && existsSync(targetPath)) {
      process.stdout.write(\`copy skipped \${targetPath}\\n\`);
      continue;
    }

    copyFileSync(sourcePath, targetPath);
    process.stdout.write(\`copy \${sourcePath} -> \${targetPath}\\n\`);
    continue;
  }

  if (action === 'run') {
    const command = interpolate(step.run, 'run');
    const commandCwd = step.cwd === undefined ? cwd : resolvePath(step.cwd, cwd, 'cwd');
    process.stdout.write(\`$ \${command}\\n\`);
    try {
      execSync(command, { cwd: commandCwd, shell, stdio: 'inherit' });
    } catch (error) {
      process.stderr.write(\`wtm: setup command failed: \${command}\\n\`);
      process.exit(typeof error.status === 'number' ? error.status : 1);
    }
  }
}
`;
  const logPath = join(vars.target, '.wtm-setup.log');
  const logFd = openSync(logPath, 'a');

  log(`Setup running in background -> ${logPath}`);
  for (const step of steps) {
    const action = getSetupAction(step);
    if (action === 'copy') {
      const sourcePath = resolveConfiguredPath(step.copy, vars, vars.root, 'copy');
      const targetPath = resolveCopyDestination(step, sourcePath, vars);
      log(`  copy ${sourcePath} -> ${targetPath}`);
    } else if (action === 'run') {
      log(`  $ ${interpolateValue(step.run, vars, 'run')}`);
    }
  }

  const child = spawn(process.execPath, ['-e', runner, JSON.stringify(steps), vars.target, JSON.stringify(shell ?? true), vars.root, vars.branch], {
    cwd: vars.target,
    shell: false,
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });

  child.on('exit', (code) => {
    if (code !== 0) writeSync(logFd, `\nwtm: setup exited with code ${code}\n`);
    closeSync(logFd);
  });

  child.unref();
}

export function runCommand(command, worktreePath) {
  log(`Running '${command}' in '${worktreePath}'...`);
  const { error, signal, status } = spawnSync(command, [], { cwd: worktreePath, stdio: 'inherit', shell: true });
  if (error) die(`Could not run command: ${error.message}`);
  if (signal) die(`Command terminated by signal: ${signal}`);
  if (status !== 0) die(`Command exited with status ${status}`);
}
