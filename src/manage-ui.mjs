import { render } from 'ink';
import React from 'react';
import { ManageApp } from './manage-app.mjs';
import { parseWorktreeList } from './worktree.mjs';

const h = React.createElement;

export async function runManageUI(repoRoot, theme) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('wtc manage requires an interactive terminal.');
  }

  const initialEntries = parseWorktreeList(repoRoot);
  const app = render(h(ManageApp, { repoRoot, initialEntries, theme }), {
    alternateScreen: true,
    incrementalRendering: true,
  });

  await app.waitUntilExit();
}
