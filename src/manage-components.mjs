import React from 'react';
import { homedir } from 'node:os';
import { sep } from 'node:path';
import { Box, Text } from 'ink';
import { Alert, Spinner, StatusMessage, TextInput } from '@inkjs/ui';
import cliTruncate from 'cli-truncate';

const h = React.createElement;

export function statColor(count) {
  if (count === 0) return 'green';
  if (count <= 2) return 'yellow';
  return 'red';
}

function getEntryTags(entry) {
  return [
    entry.isMain ? 'main' : null,
    entry.detached ? 'detached' : null,
    entry.locked ? 'locked' : null,
    entry.prunable ? 'prunable' : null,
  ].filter(Boolean);
}

function getEntryTagColor(entry) {
  if (entry.isMain) return 'green';
  if (entry.prunable) return 'yellow';
  if (entry.locked) return 'red';
  if (entry.detached) return 'cyan';
  return 'blue';
}

function mergeableColor(mergeable) {
  if (mergeable === 'clean') return 'green';
  if (mergeable === 'conflicts') return 'red';
  return 'gray';
}

function mergeableLabel(mergeable) {
  if (mergeable === 'clean') return 'no conflicts';
  if (mergeable === 'conflicts') return 'conflicts';
  return 'unknown';
}

function GitStatusSummary({ details }) {
  if (!details) {
    return h(Text, { color: 'gray' }, 'Status unavailable');
  }

  const parts = [];
  const pushPart = (key, color, text) => {
    if (parts.length > 0) parts.push(h(Text, { key: `${key}-gap`, color: 'gray' }, ' '));
    parts.push(h(Text, { key, color }, text));
  };

  if ((details.stagedCount ?? 0) > 0) pushPart('staged', statColor(details.stagedCount ?? 0), `+${details.stagedCount}`);
  if ((details.unstagedCount ?? 0) > 0) pushPart('unstaged', statColor(details.unstagedCount ?? 0), `~${details.unstagedCount}`);
  if ((details.untrackedCount ?? 0) > 0) pushPart('untracked', statColor(details.untrackedCount ?? 0), `?${details.untrackedCount}`);
  if ((details.aheadCount ?? 0) > 0) pushPart('ahead', statColor(details.aheadCount ?? 0), `⇡${details.aheadCount}`);
  if ((details.behindCount ?? 0) > 0) pushPart('behind', statColor(details.behindCount ?? 0), `⇣${details.behindCount}`);

  if (parts.length === 0) {
    pushPart('clean', 'green', 'clean');
  }

  return h(Box, { flexWrap: 'wrap' }, ...parts);
}

function InlineTagList({ entry }) {
  const items = getEntryTags(entry);
  if (!items.length) return h(Text, { color: 'gray' }, 'no tags');

  return h(
    Box,
    { flexWrap: 'wrap' },
    ...items.flatMap((item, index) => [
      index > 0 ? h(Text, { key: `${item}-sep`, color: 'gray' }, ' ') : null,
      h(Text, { key: item, color: getEntryTagColor(entry), dimColor: true }, `[${item}]`),
    ].filter(Boolean))
  );
}

function DetailLine({ label, children, color = 'white' }) {
  const content = typeof children === 'string'
    ? h(Text, { color, wrap: 'wrap' }, children)
    : children;

  return h(
    Box,
    { flexWrap: 'wrap' },
    h(Text, { color: 'gray' }, `${label}: `),
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
  const homeMatch = isWindows
    ? pathValue.toLowerCase().startsWith(home.toLowerCase())
    : pathValue.startsWith(home);

  if (!homeMatch) return pathValue;

  const suffix = pathValue.slice(home.length);
  if (!suffix) return '~';
  return `~${suffix}`;
}

export function ManageHeader({ repoRoot, entryCount, staleCount, mainCount, columns }) {
  const repoLabel = cliTruncate(repoRoot, Math.max(16, columns - 34));

  return h(
    Box,
    { marginBottom: 1, flexWrap: 'wrap' },
    h(Text, { color: 'cyan', bold: true }, 'wtc manage'),
    h(Text, { color: 'gray' }, '  '),
    h(Text, { color: 'gray' }, repoLabel),
    h(Text, { color: 'gray' }, '  '),
    h(Text, { color: 'blue' }, `${entryCount} worktrees`),
    h(Text, { color: 'gray' }, '  '),
    h(Text, { color: statColor(staleCount) }, `${staleCount} stale`),
    h(Text, { color: 'gray' }, '  '),
    h(Text, { color: statColor(entryCount - mainCount) }, `${entryCount - mainCount} branches`)
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
}) {
  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    searchMode
      ? h(
        Box,
        { flexWrap: 'wrap' },
        h(Text, { color: 'cyan' }, 'filter> '),
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
        h(Text, { color: 'gray' }, 'filter: '),
        h(Text, { color: query ? 'white' : 'gray' }, query || 'Press / to filter worktrees')
      ),
    h(
      Box,
      { flexWrap: 'wrap' },
      h(Text, { color: 'gray' }, 'comparing: '),
      h(Text, { color: 'magenta' }, currentCheckout.label)
    )
  );
}

export function WorktreeList({ entries, selectedEntry, columns, query, windowStart, windowEnd, totalCount }) {
  if (entries.length === 0) {
    return h(
      Alert,
      { variant: 'warning', title: 'Nothing matches the current filter' },
      query ? 'Clear or edit the filter to see more worktrees.' : 'No worktrees found.'
    );
  }

  const showWindowMeta = totalCount > entries.length;
  const branchWidth = Math.max(12, columns - 34);
  const pathWidth = Math.max(18, columns - 6);

  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    showWindowMeta
      ? h(
        Box,
        { marginBottom: 1, flexWrap: 'wrap' },
        h(Text, { color: 'gray' }, `showing ${windowStart + 1}-${windowEnd} of ${totalCount}`)
      )
      : null,
    ...entries.map((entry, index) => {
      const isSelected = selectedEntry?.path === entry.path;
      const branchLabel = cliTruncate(entry.branch ?? '(no branch)', branchWidth);
      const pathLabel = cliTruncate(displayPath(entry.path), pathWidth);
      const tagItems = getEntryTags(entry);
      const selectedColor = isSelected ? 'cyan' : (entry.isMain ? 'green' : 'white');
      const tagText = tagItems.map((item) => `[${item}]`).join(' ');

      return h(
        Box,
        {
          key: entry.path,
          flexDirection: 'column',
          marginBottom: index === entries.length - 1 ? 0 : 1,
        },
        h(
          Box,
          { flexWrap: 'wrap' },
          h(Text, { color: selectedColor, bold: isSelected }, `${isSelected ? '>' : ' '} ${branchLabel}`),
          tagText ? h(Text, { color: 'gray' }, '  ') : null,
          tagText ? h(Text, { color: 'gray', dimColor: true }, tagText) : null,
        ),
        h(Text, { color: 'gray' }, `  ${pathLabel}`),
      );
    })
  );
}

export function DetailsPane({ currentCheckout, selectedEntry, details, comparison, columns }) {
  if (!selectedEntry) {
    return h(Text, { color: 'gray' }, 'No worktree selected.');
  }

  const highlightedLabel = selectedEntry.branch ?? `${selectedEntry.head?.slice(0, 12) ?? 'unknown'}`;
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
    h(DetailLine, { label: 'commit' }, details.loading ? 'loading...' : stripCommitHash(details.data?.lastCommit)),
    h(DetailLine, {
      label: 'git status',
      color: details.data?.dirtyCount ? 'yellow' : 'green',
    }, details.loading ? 'inspecting worktree state...' : h(GitStatusSummary, { details: details.data })),
    h(DetailLine, { label: 'relation', color: comparison.data?.sameHead ? 'green' : 'yellow' }, relationText),
    (
      comparison.loading
        ? h(Spinner, { label: 'Comparing branches' })
        : h(
          Box,
          { flexDirection: 'column' },
          diffText ? h(DetailLine, { label: 'diff', color: statColor(comparison.data?.tipDiffFiles ?? 0) }, diffText) : null,
          mergeText ? h(DetailLine, { label: 'merge', color: mergeableColor(comparison.data?.mergeable) }, mergeText) : null,
        )
    ),
    details.loading
      ? h(Spinner, { label: 'Collecting git metadata' })
      : null,
    tagItems.length > 0 ? h(DetailLine, { label: 'tags' }, h(InlineTagList, { entry: selectedEntry })) : null
  );
}

export function DeletePrompt({ confirmAction, columns }) {
  if (!confirmAction) return null;

  const label = confirmAction.removeBranch ? 'delete worktree + branch?' : 'delete worktree?';
  const message = confirmAction.removeBranch
    ? `y: remove ${confirmAction.entry.path} and delete ${confirmAction.entry.branch}  any other key: cancel`
    : `y: remove ${confirmAction.entry.path}  any other key: cancel`;

  return h(
    Box,
    { marginTop: 1 },
    h(Text, { color: confirmAction.removeBranch ? 'red' : 'yellow', bold: true }, label),
    h(Text, { color: 'gray' }, ` ${cliTruncate(message, Math.max(24, columns - 2))}`)
  );
}

export function ManageStatus({ isRefreshing, status }) {
  return h(
    Box,
    { marginTop: 1 },
    isRefreshing
      ? h(Spinner, { label: 'Refreshing worktree inventory' })
      : h(StatusMessage, { variant: status.variant }, status.text)
  );
}

export function ManageFooter({ selectedEntry, visibleCount, totalCount }) {
  return h(
    Box,
    { marginTop: 1, justifyContent: 'space-between', flexWrap: 'wrap' },
    h(Text, { color: 'gray' }, '↑↓ move  / filter  r refresh  d delete  q quit'),
    h(Text, { color: 'gray' }, `${visibleCount}/${totalCount} shown${selectedEntry ? `  ${selectedEntry.branch ?? displayPath(selectedEntry.path)}` : ''}`)
  );
}
