import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execaSync } from 'execa';
import { die, log, warn } from './log.mjs';

function runGit(args, options = {}) {
  return execaSync('git', args, options);
}

function git(args, cwd, stdio = 'inherit') {
  try {
    runGit(args, { cwd, stdio });
  } catch {
    die(`git ${args[0]} failed.`);
  }
}

function gitCapture(args, cwd) {
  try {
    return runGit(args, { cwd, encoding: 'utf8' }).stdout.trimEnd();
  } catch {
    die(`git ${args[0]} failed.`);
  }
}

function tryGit(args, cwd) {
  try {
    runGit(args, { cwd, stdio: 'pipe' });
    return { ok: true, error: null };
  } catch (error) {
    const stderr = error.stderr?.toString?.().trim() ?? '';
    const stdout = error.stdout?.toString?.().trim() ?? '';
    const message = stderr || stdout || `git ${args[0]} failed.`;
    return { ok: false, error: message };
  }
}

function branchExists(branchName) {
  try {
    runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function worktreeExistsForPath(worktreePath) {
  try {
    const output = runGit(['worktree', 'list', '--porcelain'], { encoding: 'utf8' }).stdout;
    const registeredPaths = output
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => resolve(line.slice('worktree '.length).trim()));
    return registeredPaths.includes(resolve(worktreePath));
  } catch {
    return false;
  }
}

function parseWorktreeBlock(block, repoRoot) {
  const entry = {
    path: '',
    branch: null,
    head: null,
    bare: false,
    detached: false,
    locked: false,
    prunable: false,
    isMain: false,
  };

  for (const line of block.split('\n')) {
    if (line.startsWith('worktree ')) entry.path = resolve(line.slice('worktree '.length).trim());
    else if (line.startsWith('branch ')) entry.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '');
    else if (line.startsWith('HEAD ')) entry.head = line.slice('HEAD '.length).trim();
    else if (line === 'bare') entry.bare = true;
    else if (line === 'detached') entry.detached = true;
    else if (line.startsWith('locked')) entry.locked = true;
    else if (line.startsWith('prunable')) entry.prunable = true;
  }

  entry.isMain = entry.path === resolve(repoRoot);
  return entry;
}

export function getRepoRoot() {
  try {
    return runGit(['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
  } catch {
    die('Not inside a git repository.');
  }
}

export function branchToDir(branchName) {
  return branchName.replace(/\//g, '-').replace(/[^\w\-.]/g, '-');
}

export function createOrReuseBranch(branchName, baseBranch, repoRoot) {
  if (branchExists(branchName)) {
    log(`Branch '${branchName}' exists - reusing.`);
    return;
  }

  log(`Creating branch '${branchName}' from '${baseBranch}'...`);
  git(['branch', branchName, baseBranch], repoRoot);
}

export function createOrReattachWorktree(worktreePath, branchName, repoRoot) {
  const registered = worktreeExistsForPath(worktreePath);
  const dirPresent = existsSync(worktreePath);

  if (registered && dirPresent) {
    log(`Worktree '${worktreePath}' already exists - reattaching.`);
    return false;
  }

  if (registered && !dirPresent) {
    warn('Worktree registered but directory missing - pruning stale entry.');
    git(['worktree', 'prune'], repoRoot);
  }

  log(`Creating worktree at '${worktreePath}'...`);
  mkdirSync(dirname(worktreePath), { recursive: true });
  git(['worktree', 'add', worktreePath, branchName], repoRoot);
  return true;
}

export function parseWorktreeList(repoRoot) {
  const output = gitCapture(['worktree', 'list', '--porcelain'], repoRoot);
  if (!output.trim()) return [];

  return output
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => parseWorktreeBlock(block, repoRoot));
}

export function inspectWorktree(worktreePath) {
  const details = {
    branchSummary: 'clean',
    dirtyCount: 0,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    lastCommit: 'No commits',
    setupLogPresent: existsSync(join(worktreePath, '.wt-setup.log')),
  };

  try {
    const statusOutput = runGit(['status', '--short', '--branch'], { cwd: worktreePath, encoding: 'utf8' }).stdout;
    const lines = statusOutput.trim().split('\n').filter(Boolean);

    if (lines.length > 0) {
      details.branchSummary = lines[0].replace(/^##\s*/, '');
    }

    for (const line of lines.slice(1)) {
      const staged = line[0];
      const unstaged = line[1];
      const isUntracked = line.startsWith('??');

      if (!isUntracked && staged && staged !== ' ') details.stagedCount++;
      if (!isUntracked && unstaged && unstaged !== ' ') details.unstagedCount++;
      if (isUntracked) details.untrackedCount++;
      if ((staged && staged !== ' ') || (unstaged && unstaged !== ' ') || isUntracked) details.dirtyCount++;
    }
  } catch {
    details.branchSummary = 'Status unavailable';
  }

  try {
    details.lastCommit = runGit(['log', '-1', '--pretty=%h %s'], { cwd: worktreePath, encoding: 'utf8' }).stdout.trim() || 'No commits';
  } catch {
    details.lastCommit = 'No commits';
  }

  return details;
}

export function removeWorktree(entry, repoRoot, removeBranch = false) {
  if (entry.isMain) return 'Refusing to remove the main checkout.';

  if (!existsSync(entry.path)) {
    const pruned = tryGit(['worktree', 'prune'], repoRoot);
    return pruned.ok ? 'Pruned missing worktree entries.' : pruned.error;
  }

  const removed = tryGit(['worktree', 'remove', '--force', entry.path], repoRoot);
  if (!removed.ok) return removed.error;
  if (!removeBranch) return `Removed ${entry.path}`;
  if (!entry.branch) return `Removed ${entry.path}; no local branch to delete.`;

  const deletedBranch = tryGit(['branch', '-D', entry.branch], repoRoot);
  return deletedBranch.ok
    ? `Removed ${entry.path} and deleted branch ${entry.branch}`
    : `Removed ${entry.path}; branch delete failed: ${deletedBranch.error}`;
}
