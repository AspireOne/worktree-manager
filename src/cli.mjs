import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { bootstrapLocalConfig, loadConfig } from './config.mjs';
import { die, log } from './log.mjs';
import { runManageUI } from './manage-ui.mjs';
import { launchCodex, runSetup } from './setup.mjs';
import {
  branchToDir,
  createOrReattachWorktree,
  createOrReuseBranch,
  getRepoRoot,
} from './worktree.mjs';

function parseCLI() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      now: { type: 'boolean', short: 'n', default: false },
      base: { type: 'string', short: 'b' },
    },
    allowPositionals: true,
  });

  if (!positionals.length) {
    die('Usage: wtm <branch> [--base <branch>] [--now|-n]\n       wtm init\n       wtm manage');
  }

  if (positionals[0] === 'init') {
    return { command: 'init' };
  }

  if (positionals[0] === 'manage') {
    return { command: 'manage', branch: null, now: false, base: null };
  }

  return { command: 'create', branch: positionals[0], now: values.now, base: values.base ?? null };
}

export async function main() {
  const cli = parseCLI();

  if (cli.command === 'init') {
    bootstrapLocalConfig();
    return;
  }

  const repoRoot = getRepoRoot();
  const config = loadConfig(repoRoot);

  if (cli.command === 'manage') {
    try {
      await runManageUI(repoRoot, config.theme);
      return;
    } catch (error) {
      die(error.message);
    }
  }

  const baseBranch = cli.base ?? config.baseBranch;
  const branchName = cli.branch;
  const worktreePath = resolve(join(repoRoot, config.worktreeRoot, branchToDir(branchName)));
  const vars = { target: worktreePath, branch: branchName, root: repoRoot };

  log(`branch   -> ${branchName}`);
  log(`worktree -> ${worktreePath}`);
  log(`base     -> ${baseBranch}`);

  createOrReuseBranch(branchName, baseBranch, repoRoot);
  const createdWorktree = createOrReattachWorktree(worktreePath, branchName, repoRoot);

  if (cli.now) {
    if (createdWorktree) runSetup(config.setup, vars, config.shell);
    launchCodex(worktreePath);
    return;
  }

  if (createdWorktree) runSetup(config.setup, vars, config.shell);
  log('Done. To start codex:');
  log(`  cd "${worktreePath}" && codex`);
}
