import React from 'react';
import { homedir } from 'node:os';
import { sep } from 'node:path';
import { Box, Text } from 'ink';
import { Spinner, TextInput } from '@inkjs/ui';
import cliTruncate from 'cli-truncate';
import { resolveTheme } from './theme.mjs';

const h = React.createElement;

export function statColor(count, theme) {
  if (count === 0) return theme.success;
  if (count <= 2) return theme.warning;
  return theme.danger;
}

function getEntryTags(entry) {
  return [
    entry.isMain ? 'main' : null,
    entry.detached ? 'detached' : null,
    entry.locked ? 'locked' : null,
    entry.prunable ? 'prunable' : null,
  ].filter(Boolean);
}

function getEntryTagColor(entry, theme) {
  if (entry.isMain) return theme.success;
  if (entry.prunable) return theme.warning;
  if (entry.locked) return theme.danger;
  if (entry.detached) return theme.accentStrong;
  return theme.accent;
}

function mergeableColor(mergeable, theme) {
  if (mergeable === 'clean') return theme.success;
  if (mergeable === 'conflicts') return theme.danger;
  return theme.textMuted;
}

function mergeableLabel(mergeable) {
  if (mergeable === 'clean') return 'no conflicts';
  if (mergeable === 'conflicts') return 'conflicts';
  return 'unknown';
}

function variantColor(variant, theme) {
  if (variant === 'success') return theme.success;
  if (variant === 'warning') return theme.warning;
  if (variant === 'error') return theme.danger;
  return theme.accent;
}

function variantIcon(variant) {
  if (variant === 'success') return '✓';
  if (variant === 'warning') return '!';
  if (variant === 'error') return 'x';
  return 'i';
}

function ThemedAlert({ variant, title, children, theme }) {
  const color = variantColor(variant, theme);

  return h(
    Box,
    { borderStyle: 'round', borderColor: color, paddingX: 1, flexGrow: 1 },
    h(Text, { color, bold: true }, variantIcon(variant)),
    h(Text, { color: theme.textMuted }, ' '),
    h(
      Box,
      { flexDirection: 'column', flexShrink: 1 },
      title ? h(Text, { color, bold: true }, title) : null,
      h(Text, { color: theme.textPrimary, wrap: 'wrap' }, children)
    )
  );
}

function ThemedStatusMessage({ variant, children, theme }) {
  const color = variantColor(variant, theme);

  return h(
    Box,
    { flexWrap: 'wrap' },
    h(Text, { color, bold: true }, variantIcon(variant)),
    h(Text, { color: theme.textMuted }, ' '),
    h(Text, { color: theme.textPrimary, wrap: 'wrap' }, children)
  );
}

function GitStatusSummary({ details, theme }) {
  if (!details) {
    return h(Text, { color: theme.textMuted }, 'Status unavailable');
  }

  const parts = [];
  const pushPart = (key, color, text) => {
    if (parts.length > 0) parts.push(h(Text, { key: `${key}-gap`, color: theme.textMuted }, ' '));
    parts.push(h(Text, { key, color, bold: true }, text));
  };

  if ((details.stagedCount ?? 0) > 0) pushPart('staged', statColor(details.stagedCount ?? 0, theme), `+${details.stagedCount}`);
  if ((details.unstagedCount ?? 0) > 0) pushPart('unstaged', statColor(details.unstagedCount ?? 0, theme), `~${details.unstagedCount}`);
  if ((details.untrackedCount ?? 0) > 0) pushPart('untracked', statColor(details.untrackedCount ?? 0, theme), `?${details.untrackedCount}`);
  if ((details.aheadCount ?? 0) > 0) pushPart('ahead', statColor(details.aheadCount ?? 0, theme), `⇡${details.aheadCount}`);
  if ((details.behindCount ?? 0) > 0) pushPart('behind', statColor(details.behindCount ?? 0, theme), `⇣${details.behindCount}`);

  if (parts.length === 0) {
    pushPart('clean', theme.success, 'clean');
  }

  return h(Box, { flexWrap: 'wrap' }, ...parts);
}

function InlineTagList({ entry, theme }) {
  const items = getEntryTags(entry);
  if (!items.length) return h(Text, { color: theme.textMuted }, 'no tags');

  return h(
    Box,
    { flexWrap: 'wrap' },
    ...items.flatMap((item, index) => [
      index > 0 ? h(Text, { key: `${item}-sep`, color: theme.textMuted }, ' ') : null,
      h(Text, { key: item, color: getEntryTagColor(entry, theme), dimColor: true }, `[${item}]`),
    ].filter(Boolean))
  );
}

function DetailLine({ label, children, color, theme }) {
  const content = typeof children === 'string'
    ? h(Text, { color: color ?? theme.textPrimary, wrap: 'wrap' }, children)
    : children;

  return h(
    Box,
    { flexWrap: 'wrap' },
    h(Text, { color: theme.textMuted, bold: true }, `${label}: `),
    content
  );
}

function stripCommitHash(lastCommit) {
  if (!lastCommit) return 'unavailable';
  return lastCommit.replace(/^[0-9a-f]{7,40}\s+/i, '') || lastCommit;
}

function displayPath(worktreePath) {
  const home = homedir();
  const isWindows = sep === '\\';
  const pathValue = worktreePath ?? '';
  const comparablePath = isWindows ? pathValue.replaceAll('/', '\\') : pathValue;
  const comparableHome = isWindows ? home.replaceAll('/', '\\') : home;
  const homeBoundary = `${comparableHome}${sep}`;
  const homeMatch = isWindows
    ? comparablePath.toLowerCase() === comparableHome.toLowerCase()
      || comparablePath.toLowerCase().startsWith(homeBoundary.toLowerCase())
    : comparablePath === comparableHome || comparablePath.startsWith(homeBoundary);

  if (!homeMatch) return pathValue;

  const suffix = comparablePath.slice(comparableHome.length);
  if (!suffix) return '~';
  return `~${suffix}`;
}

function displayPathPortable(worktreePath) {
  return displayPath(worktreePath).replaceAll('\\', '/');
}

export function ManageHeader({ repoRoot, entryCount, staleCount, mainCount, columns, theme: themeConfig }) {
  const theme = resolveTheme(themeConfig);
  const repoLabel = cliTruncate(displayPathPortable(repoRoot), Math.max(16, columns - 34));

  return h(
    Box,
    { marginBottom: 1, flexWrap: 'wrap' },
    h(Text, { color: theme.accentStrong, bold: true }, 'wtc manage'),
    h(Text, { color: theme.textMuted }, '  '),
    h(Text, { color: theme.textMuted }, repoLabel),
    h(Text, { color: theme.textMuted }, '  '),
    h(Text, { color: theme.accent, bold: true }, `${entryCount} worktrees`),
    h(Text, { color: theme.textMuted }, '  '),
    h(Text, { color: statColor(staleCount, theme), bold: true }, `${staleCount} stale`),
    h(Text, { color: theme.textMuted }, '  '),
    h(Text, { color: statColor(entryCount - mainCount, theme), bold: true }, `${entryCount - mainCount} branches`)
  );
}

export function FilterPanel({
  query,
  searchMode,
  filteredCount,
  currentCheckout,
  setQuery,
  setSearchMode,
  setStatus,
  theme: themeConfig,
}) {
  const theme = resolveTheme(themeConfig);
  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    searchMode
      ? h(
        Box,
        { flexWrap: 'wrap' },
        h(Text, { color: theme.accentStrong, bold: true }, 'filter> '),
        h(TextInput, {
          placeholder: 'branch, path, or HEAD',
          defaultValue: query,
          onChange: setQuery,
          onSubmit: () => {
            setSearchMode(false);
            setStatus({
              variant: 'success',
              text: query ? `Showing ${filteredCount} matching worktrees.` : 'Search cleared.',
            });
          },
        })
      )
      : h(
        Box,
        { flexWrap: 'wrap' },
        h(Text, { color: theme.textMuted, bold: true }, 'filter: '),
        h(Text, { color: query ? theme.accent : theme.textMuted, bold: Boolean(query) }, query || 'Press / to filter worktrees')
      ),
    h(
      Box,
      { flexWrap: 'wrap' },
      h(Text, { color: theme.textMuted, bold: true }, 'comparing: '),
      h(Text, { color: theme.context, bold: true }, currentCheckout.label)
    )
  );
}

export function WorktreeList({ entries, selectedEntry, columns, query, windowStart, windowEnd, totalCount, theme: themeConfig }) {
  const theme = resolveTheme(themeConfig);
  if (entries.length === 0) {
    return h(
      ThemedAlert,
      { variant: 'warning', title: 'Nothing matches the current filter', theme },
      query ? 'Clear or edit the filter to see more worktrees.' : 'No worktrees found.'
    );
  }

  const showWindowMeta = totalCount > entries.length;
  const branchWidth = Math.max(12, Math.floor(columns * 0.32));
  const pathWidth = Math.max(18, columns - branchWidth - 10);

  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    showWindowMeta
      ? h(
        Box,
        { marginBottom: 1, flexWrap: 'wrap' },
        h(Text, { color: theme.textMuted, bold: true }, `showing ${windowStart + 1}-${windowEnd} of ${totalCount}`)
      )
      : null,
    ...entries.map((entry, index) => {
      const isSelected = selectedEntry?.path === entry.path;
      const branchLabel = cliTruncate(entry.branch ?? '(no branch)', branchWidth);
      const pathLabel = cliTruncate(displayPathPortable(entry.path), pathWidth);
      const tagItems = getEntryTags(entry);
      const selectedColor = isSelected ? theme.accentStrong : (entry.isMain ? theme.success : theme.textPrimary);
      const tagText = tagItems.map((item) => `[${item}]`).join(' ');

      return h(
        Box,
        {
          key: entry.path,
          flexDirection: 'column',
          marginBottom: 0,
        },
        h(
          Box,
          { flexWrap: 'wrap' },
          h(Text, { color: selectedColor, bold: isSelected }, `${isSelected ? '>' : ' '} ${branchLabel}`),
          h(Text, { color: theme.textMuted }, '  '),
          h(Text, { color: isSelected ? theme.accent : theme.textMuted, bold: isSelected }, pathLabel),
          tagText ? h(Text, { color: theme.textMuted }, '  ') : null,
          tagText ? h(Text, { color: theme.textMuted, dimColor: true }, tagText) : null,
        ),
      );
    })
  );
}

export function DetailsPane({ currentCheckout, selectedEntry, details, comparison, columns, theme: themeConfig }) {
  const theme = resolveTheme(themeConfig);
  if (!selectedEntry) {
    return h(Text, { color: theme.textMuted }, 'No worktree selected.');
  }

  const relationText = comparison.loading
    ? 'comparing...'
    : comparison.data
      ? comparison.data.sameHead
        ? `same commit as ${currentCheckout.label}`
        : `${comparison.data.selectedAhead} ahead, ${comparison.data.currentAhead} behind ${currentCheckout.label}`
      : 'comparison unavailable';
  const diffText = comparison.loading
    ? null
    : comparison.data
      ? `${comparison.data.tipDiffFiles} files differ`
      : 'comparison unavailable';
  const mergeText = comparison.loading
    ? null
    : comparison.data
      ? comparison.data.mergeable === 'clean'
        ? `no conflicts, can merge into ${currentCheckout.label}`
        : mergeableLabel(comparison.data.mergeable)
      : null;
  const tagItems = getEntryTags(selectedEntry);

  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    h(DetailLine, { label: 'commit', theme }, details.loading ? 'loading...' : stripCommitHash(details.data?.lastCommit)),
    h(DetailLine, {
      label: 'git status',
      color: details.data?.dirtyCount ? theme.warning : theme.success,
      theme,
    }, details.loading ? 'inspecting worktree state...' : h(GitStatusSummary, { details: details.data, theme })),
    h(DetailLine, { label: 'commits', color: comparison.data?.sameHead ? theme.success : theme.warning, theme }, relationText),
    (
      comparison.loading
        ? h(Spinner, { label: 'Comparing branches' })
        : h(
          Box,
          { flexDirection: 'column' },
          diffText ? h(DetailLine, { label: 'diff', color: statColor(comparison.data?.tipDiffFiles ?? 0, theme), theme }, diffText) : null,
          mergeText ? h(DetailLine, { label: 'merge', color: mergeableColor(comparison.data?.mergeable, theme), theme }, mergeText) : null,
        )
    ),
    details.loading
      ? h(Spinner, { label: 'Collecting git metadata' })
      : null,
    tagItems.length > 0
      ? h(DetailLine, { label: 'tags', theme }, h(InlineTagList, { entry: selectedEntry, theme }))
      : null
  );
}

export function DeletePrompt({ confirmAction, columns, theme: themeConfig }) {
  const theme = resolveTheme(themeConfig);
  if (!confirmAction) return null;

  const label = confirmAction.removeBranch ? 'delete worktree + branch?' : 'delete worktree?';
  const message = confirmAction.removeBranch
    ? `y: remove ${confirmAction.entry.path} and delete ${confirmAction.entry.branch}  any other key: cancel`
    : `y: remove ${confirmAction.entry.path}  any other key: cancel`;

  return h(
    Box,
    { marginTop: 1 },
    h(Text, { color: confirmAction.removeBranch ? theme.danger : theme.warning, bold: true }, label),
    h(Text, { color: theme.textMuted }, ` ${cliTruncate(message, Math.max(24, columns - 2))}`)
  );
}

export function ManageStatus({ isRefreshing, status, theme: themeConfig }) {
  const theme = resolveTheme(themeConfig);
  if (!isRefreshing && !status?.text) return null;

  return h(
    Box,
    { marginTop: 1 },
    isRefreshing
      ? h(Spinner, { label: 'Refreshing worktree inventory' })
      : h(ThemedStatusMessage, { variant: status.variant, theme }, status.text)
  );
}

export function ManageFooter({ selectedEntry, visibleCount, totalCount, theme: themeConfig }) {
  const theme = resolveTheme(themeConfig);
  const selectedLabel = selectedEntry?.branch ?? selectedEntry?.head?.slice(0, 12) ?? null;

  return h(
    Box,
    { marginTop: 1, justifyContent: 'space-between', flexWrap: 'wrap' },
    h(
      Box,
      { flexWrap: 'wrap' },
      h(Text, { color: theme.textMuted }, ' '),
      h(Text, { color: theme.accent, bold: true }, '↑↓'),
      h(Text, { color: theme.textMuted }, ' move  '),
      h(Text, { color: theme.accent, bold: true }, '/'),
      h(Text, { color: theme.textMuted }, ' filter  '),
      h(Text, { color: theme.accent, bold: true }, 'r'),
      h(Text, { color: theme.textMuted }, ' refresh  '),
      h(Text, { color: theme.accent, bold: true }, 'd'),
      h(Text, { color: theme.textMuted }, ' delete  '),
      h(Text, { color: theme.accent, bold: true }, 'q'),
      h(Text, { color: theme.textMuted }, ' quit')
    ),
    h(
      Box,
      { flexWrap: 'wrap' },
      selectedLabel ? h(Text, { color: theme.textMuted }, 'selected ') : null,
      selectedLabel ? h(Text, { color: theme.accentStrong, bold: true }, selectedLabel) : null,
      selectedLabel ? h(Text, { color: theme.textMuted }, '  ') : null,
      h(Text, { color: theme.textMuted }, 'shown '),
      h(Text, { color: theme.accent, bold: true }, `${visibleCount}/${totalCount}`)
    )
  );
}
