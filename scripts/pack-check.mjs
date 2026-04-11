import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDir = mkdtempSync(join(tmpdir(), 'wtc-pack-'));

try {
  execSync(`pnpm pack --pack-destination "${tempDir}"`, { stdio: 'inherit', shell: true });
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
