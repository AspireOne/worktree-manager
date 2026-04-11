import { execSync, spawnSync } from 'node:child_process';

const bump = process.argv[2] ?? 'patch';
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function die(message) {
  console.error(`wt  error: ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

try {
  const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  if (status) {
    die('Working tree must be clean before releasing.');
  }
} catch (error) {
  die(`Unable to inspect git status: ${error.message}`);
}

run(npmCmd, ['run', 'pack:check']);
run(npmCmd, ['version', bump, '-m', 'chore(release): %s']);
run(npmCmd, ['publish']);
