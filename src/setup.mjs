import { execSync, spawn, spawnSync } from 'node:child_process';
import { closeSync, openSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { die, log } from './log.mjs';

function interpolate(command, vars) {
  return command.replace(/\{(\w+)\}/g, (_, key) => {
    if (!(key in vars)) {
      die(`Unknown template variable '{${key}}' in setup command: ${command}`);
    }

    return vars[key];
  });
}

export function runSetup(commands, vars, shell) {
  if (!commands.length) return;

  log('Running setup...');
  for (const raw of commands) {
    const command = interpolate(raw, vars);
    log(`  $ ${command}`);

    try {
      execSync(command, { shell: shell ?? true, stdio: 'inherit', cwd: vars.target });
    } catch {
      die(`Setup command failed: ${command}`);
    }
  }
}

export function runSetupBackground(commands, vars, shell) {
  if (!commands.length) return;

  const runner = `
const { execSync } = require('node:child_process');
const commands = JSON.parse(process.argv[1]);
const cwd = process.argv[2];
const shell = JSON.parse(process.argv[3]);

for (const cmd of commands) {
  process.stdout.write(\`$ \${cmd}\\n\`);
  try {
    execSync(cmd, { cwd, shell, stdio: 'inherit' });
  } catch (error) {
    process.stderr.write(\`wt: setup command failed: \${cmd}\\n\`);
    process.exit(typeof error.status === 'number' ? error.status : 1);
  }
}
`;
  const interpolated = commands.map((raw) => interpolate(raw, vars));
  const logPath = join(vars.target, '.wt-setup.log');
  const logFd = openSync(logPath, 'a');

  log(`Setup running in background -> ${logPath}`);
  for (const command of interpolated) {
    log(`  $ ${command}`);
  }

  const child = spawn(process.execPath, ['-e', runner, JSON.stringify(interpolated), vars.target, JSON.stringify(shell ?? true)], {
    cwd: vars.target,
    shell: false,
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });

  child.on('exit', (code) => {
    if (code !== 0) writeSync(logFd, `\nwt: setup exited with code ${code}\n`);
    closeSync(logFd);
  });

  child.unref();
}

export function launchCodex(worktreePath) {
  log(`Launching codex in '${worktreePath}'...`);
  const { error } = spawnSync('codex', [], { cwd: worktreePath, stdio: 'inherit', shell: true });
  if (error) die(`Could not launch codex: ${error.message}`);
}
