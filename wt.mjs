#!/usr/bin/env node
// wt.mjs — git worktree launcher for agentic workflows
// Usage: wt <branch> [--base <branch>] [--now]
// Requires: Node 18+, git

import { execSync, spawnSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, createWriteStream } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';


// ── Logging ───────────────────────────────────────────────────────────────────

const log  = (msg) => console.log(`\x1b[36mwt\x1b[0m  ${msg}`);
const warn = (msg) => console.warn(`\x1b[33mwt  warn: ${msg}\x1b[0m`);
const die  = (msg) => { console.error(`\x1b[31mwt  error: ${msg}\x1b[0m`); process.exit(1); };


// ── Minimal TOML parser ───────────────────────────────────────────────────────
// Supports: string, boolean, number, array-of-strings (inline or multiline).

function parseToml(src) {
  const out   = {};
  const lines = src.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) { i++; continue; }

    const eq = line.indexOf('=');
    if (eq === -1) { i++; continue; }

    const key    = line.slice(0, eq).trim();
    const valRaw = line.slice(eq + 1).trim();

    // Array — collect lines until the closing ]
    if (valRaw.startsWith('[')) {
      let collected = valRaw;
      while (!collected.includes(']') && i + 1 < lines.length) {
        i++;
        collected += '\n' + lines[i];
      }
      const inner = collected.slice(collected.indexOf('[') + 1, collected.lastIndexOf(']'));
      // Extract every double-quoted string in the inner content
      out[key] = [...inner.matchAll(/"([^"]*)"/g)].map(m => m[1]);
      i++; continue;
    }

    // String (double or single quoted)
    if (valRaw.startsWith('"') || valRaw.startsWith("'")) {
      out[key] = valRaw.replace(/^["']|["']$/g, '');
      i++; continue;
    }

    // Boolean
    if (valRaw === 'true')  { out[key] = true;  i++; continue; }
    if (valRaw === 'false') { out[key] = false; i++; continue; }

    // Number (strip trailing inline comment before parsing)
    const numStr = valRaw.split('#')[0].trim();
    const n = Number(numStr);
    if (numStr && !isNaN(n)) { out[key] = n; i++; continue; }

    i++;
  }

  return out;
}


// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  baseBranch:   'main',
  worktreeRoot: '.trees',
  shell:        true,   // true = system default shell; or e.g. "bash" / "pwsh"
  setup:        [],
};

function loadConfigFile(filePath) {
  if (!existsSync(filePath)) return {};
  try {
    return parseToml(readFileSync(filePath, 'utf8'));
  } catch (e) {
    warn(`Could not parse config at ${filePath}: ${e.message}`);
    return {};
  }
}

// Precedence (lowest → highest): defaults < global < repo < CLI flags
function loadConfig(repoRoot) {
  const global = loadConfigFile(join(homedir(), '.config', 'wt', 'config.toml'));
  const local  = loadConfigFile(join(repoRoot, '.wt.config.toml'));
  return { ...DEFAULTS, ...global, ...local };
}


// ── Git helpers ───────────────────────────────────────────────────────────────

function getRepoRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    die('Not inside a git repository.');
  }
}

function branchExists(name) {
  try {
    execSync(`git show-ref --verify --quiet refs/heads/${name}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function worktreeExistsForPath(absPath) {
  try {
    const out = execSync('git worktree list --porcelain', { encoding: 'utf8', stdio: 'pipe' });
    const registeredPaths = out.split('\n')
      .filter(l => l.startsWith('worktree '))
      .map(l => resolve(l.slice('worktree '.length).trim()));
    return registeredPaths.includes(resolve(absPath));
  } catch {
    return false;
  }
}

function git(cmd, cwd) {
  try {
    execSync(`git ${cmd}`, { cwd, stdio: 'inherit' });
  } catch {
    die(`git ${cmd.split(' ')[0]} failed.`);
  }
}

function createOrReuseBranch(branchName, baseBranch, repoRoot) {
  if (branchExists(branchName)) {
    log(`Branch '${branchName}' exists — reusing.`);
    return;
  }
  log(`Creating branch '${branchName}' from '${baseBranch}'...`);
  git(`branch ${branchName} ${baseBranch}`, repoRoot);
}

function createOrReattachWorktree(worktreePath, branchName, repoRoot) {
  const registered = worktreeExistsForPath(worktreePath);
  const dirPresent = existsSync(worktreePath);

  if (registered && dirPresent) {
    log(`Worktree '${worktreePath}' already exists — reattaching.`);
    return;
  }

  if (registered && !dirPresent) {
    // Directory was manually deleted; prune the stale entry and recreate.
    warn(`Worktree registered but directory missing — pruning stale entry.`);
    git('worktree prune', repoRoot);
  }

  log(`Creating worktree at '${worktreePath}'...`);
  mkdirSync(dirname(worktreePath), { recursive: true });
  git(`worktree add "${worktreePath}" ${branchName}`, repoRoot);
}


// ── Setup ─────────────────────────────────────────────────────────────────────

// Replace {target}, {branch}, {root} in a command string.
function interpolate(cmd, vars) {
  return cmd.replace(/\{(\w+)\}/g, (_, k) => {
    if (!(k in vars)) die(`Unknown template variable '{${k}}' in setup command: ${cmd}`);
    return vars[k];
  });
}

// Foreground: run sequentially, inherit stdio, die on failure.
function runSetup(commands, vars, shell) {
  if (!commands.length) return;
  log('Running setup...');
  for (const raw of commands) {
    const cmd = interpolate(raw, vars);
    log(`  $ ${cmd}`);
    try {
      execSync(cmd, { shell: shell ?? true, stdio: 'inherit', cwd: vars.root });
    } catch {
      die(`Setup command failed: ${cmd}`);
    }
  }
}

// Background: join all commands with &&, spawn detached, pipe output to log file.
// Used with --now so codex launches immediately without waiting for setup.
function runSetupBackground(commands, vars, shell) {
  if (!commands.length) return;

  const script  = commands.map(raw => interpolate(raw, vars)).join(' && ');
  const logPath = join(vars.target, '.wt-setup.log');
  const out     = createWriteStream(logPath);

  log(`Setup running in background → ${logPath}`);
  log(`  $ ${script}`);

  const child = spawn(script, [], {
    cwd:      vars.root,
    shell:    shell ?? true,
    stdio:    ['ignore', out, out],
    detached: true,
  });

  child.on('exit', code => {
    if (code !== 0) out.write(`\nwt: setup exited with code ${code}\n`);
    out.end();
  });

  // Detach so wt.mjs doesn't wait for setup when it exits after codex quits.
  child.unref();
}


// ── Launch ────────────────────────────────────────────────────────────────────

function launchCodex(worktreePath) {
  log(`Launching codex in '${worktreePath}'...`);
  const { error } = spawnSync('codex', [], { cwd: worktreePath, stdio: 'inherit', shell: true });
  if (error) die(`Could not launch codex: ${error.message}`);
}


// ── Path helpers ──────────────────────────────────────────────────────────────

// "feat/my-thing" → "feat-my-thing"  (safe for filesystem use)
function branchToDir(branch) {
  return branch.replace(/\//g, '-').replace(/[^\w\-.]/g, '-');
}


// ── CLI args ──────────────────────────────────────────────────────────────────

function parseCLI() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      now:  { type: 'boolean', short: 'n', default: false },
      base: { type: 'string',  short: 'b' },
    },
    allowPositionals: true,
  });

  if (!positionals.length) {
    console.error('Usage: wt <branch> [--base <branch>] [--now|-n]');
    process.exit(1);
  }

  return { branch: positionals[0], now: values.now, base: values.base ?? null };
}


// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const cli      = parseCLI();
  const repoRoot = getRepoRoot();
  const config   = loadConfig(repoRoot);

  const baseBranch   = cli.base ?? config.baseBranch;
  const branchName   = cli.branch;
  const worktreePath = resolve(join(repoRoot, config.worktreeRoot, branchToDir(branchName)));

  // Template variables available in setup commands
  const vars = { target: worktreePath, branch: branchName, root: repoRoot };

  log(`branch   → ${branchName}`);
  log(`worktree → ${worktreePath}`);
  log(`base     → ${baseBranch}`);

  createOrReuseBranch(branchName, baseBranch, repoRoot);
  createOrReattachWorktree(worktreePath, branchName, repoRoot);

  if (cli.now) {
    // Kick off setup in background, then immediately open codex.
    // Setup will finish long before the first prompt is written.
    runSetupBackground(config.setup, vars, config.shell);
    launchCodex(worktreePath);
  } else {
    runSetup(config.setup, vars, config.shell);
    log('Done. To start codex:');
    log(`  cd "${worktreePath}" && codex`);
  }
}

main();
