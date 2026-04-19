import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { bootstrapLocalConfig, loadConfig } from './config.mjs';
import { die, log } from './log.mjs';
import { runManageUI } from './manage-ui.mjs';
import { runCommand, runSetup, runSetupBackground } from './setup.mjs';
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
      run: { type: 'string', short: 'r' },
      now: { type: 'boolean', short: 'n', default: false },
      base: { type: 'string', short: 'b' },
    },
    allowPositionals: true,
  });

  if (!positionals.length) {
    die('Usage: wtm <branch> [--base <branch>] [--run <command>|-r <command>] [--now|-n]\n       wtm init\n       wtm manage');
  }

  if (positionals[0] === 'init') {
    if (values.run || values.now) die('init does not accept --run or --now');
    return { command: 'init' };
  }

  if (positionals[0] === 'manage') {
    if (values.run || values.now) die('manage does not accept --run or --now');
    return { command: 'manage', branch: null, run: null, now: false, base: null };
  }

  if (values.now && !values.run) {
    die('--now requires --run <command>');
  }

  return { command: 'create', branch: positionals[0], run: values.run ?? null, now: values.now, base: values.base ?? null };
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

  if (cli.run) {
    if (createdWorktree) {
      if (cli.now) runSetupBackground(config.setup, vars, config.shell);
      else runSetup(config.setup, vars, config.shell);
    }
    runCommand(cli.run, worktreePath);
    return;
  }

  if (createdWorktree) runSetup(config.setup, vars, config.shell);
  log('Done. Worktree ready:');
  log(`  cd "${worktreePath}"`);
}
