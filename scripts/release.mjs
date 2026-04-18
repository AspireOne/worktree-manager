import { execSync } from 'node:child_process';

const bump = process.argv[2] ?? 'patch';

function die(message) {
  console.error(`wtm  error: ${message}`);
  process.exit(1);
}

function run(step, command) {
  console.log(`wtm  ${step}`);
  try {
    execSync(command, { stdio: 'inherit', shell: true });
  } catch (error) {
    die(`${step} failed.`);
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

run('pack check', 'pnpm run pack:check');
run('version bump', `pnpm version ${bump} -m "chore(release): %s"`);
run('publish', 'pnpm publish');
