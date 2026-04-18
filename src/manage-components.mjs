import React from 'react';
import { Box, Text } from 'ink';
import { Alert, Badge, Spinner, StatusMessage, TextInput } from '@inkjs/ui';
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

export function Section({ title, children, borderColor = 'gray' }) {
  return h(
    Box,
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor,
      paddingX: 1,
      paddingY: 0,
      flexGrow: 1,
    },
    h(Box, { marginBottom: 1 }, h(Text, { bold: true, color: 'cyan' }, title)),
    children
  );
}

export function EntryBadges({ entry }) {
  const items = getEntryTags(entry);
  if (!items.length) return null;

  return h(
    Box,
    { flexWrap: 'wrap', columnGap: 1 },
    ...items.map((item) => h(Badge, { key: item, color: getEntryTagColor(entry) }, item))
  );
}

export function DetailRow({ label, value, color = 'white' }) {
  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    h(Text, { color: 'gray' }, label),
    h(Text, { color, wrap: 'wrap' }, value)
  );
}

function mergeableColor(mergeable) {
  if (mergeable === 'clean') return 'green';
  if (mergeable === 'conflicts') return 'red';
  return 'gray';
}

function mergeableLabel(mergeable) {
  if (mergeable === 'clean') return 'merge check clean';
  if (mergeable === 'conflicts') return 'merge check conflicts';
  return 'merge check unknown';
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

  if ((details.stagedCount ?? 0) > 0) {
    pushPart('staged', statColor(details.stagedCount ?? 0), `+${details.stagedCount}`);
  }

  if ((details.unstagedCount ?? 0) > 0) {
    pushPart('unstaged', statColor(details.unstagedCount ?? 0), `~${details.unstagedCount}`);
  }

  if ((details.untrackedCount ?? 0) > 0) {
    pushPart('untracked', statColor(details.untrackedCount ?? 0), `?${details.untrackedCount}`);
  }

  if ((details.aheadCount ?? 0) > 0) {
    pushPart('ahead', statColor(details.aheadCount ?? 0), `⇡${details.aheadCount}`);
  }

  if ((details.behindCount ?? 0) > 0) {
    pushPart('behind', statColor(details.behindCount ?? 0), `⇣${details.behindCount}`);
  }

  if (parts.length === 0) {
    pushPart('clean', 'green', 'clean');
  }

  return h(Box, { flexWrap: 'wrap' }, ...parts);
}

function BulletLine({ color = 'gray', children }) {
  const content = typeof children === 'string'
    ? h(Text, { color, wrap: 'wrap' }, children)
    : children;

  return h(
    Box,
    { marginBottom: 1, flexWrap: 'wrap' },
    h(Text, { color: 'gray' }, '• '),
    content
  );
}

function ComparisonSummary({ comparison }) {
  if (!comparison) {
    return h(Text, { color: 'gray' }, 'Comparison unavailable');
  }

  return h(
    Box,
    { flexWrap: 'wrap' },
    h(Text, { color: statColor(comparison.tipDiffFiles) }, `${comparison.tipDiffFiles} files differ`),
    h(Text, { color: 'gray' }, '  '),
    h(Text, { color: mergeableColor(comparison.mergeable) }, mergeableLabel(comparison.mergeable))
  );
}

export function ManageHeader({ repoRoot, entryCount, staleCount, mainCount }) {
  return h(
    Box,
    { justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 1 },
    h(
      Box,
      { flexDirection: 'column', marginRight: 2 },
      h(Text, { color: 'cyan', bold: true }, 'wtc manage'),
      h(Text, { color: 'gray' }, repoRoot)
    ),
    h(
      Box,
      { columnGap: 1, flexWrap: 'wrap' },
      h(Badge, { color: 'blue' }, `${entryCount} worktrees`),
      h(Badge, { color: statColor(staleCount) }, `${staleCount} stale`),
      h(Badge, { color: statColor(entryCount - mainCount) }, `${entryCount - mainCount} branches`)
    )
  );
}

export function FilterPanel({
  query,
  searchMode,
  wideLayout,
  filteredCount,
  selectedEntry,
  setQuery,
  setSearchMode,
  setStatus,
}) {
  const queryLabel = searchMode ? 'Filter mode' : 'Filter';

  return h(
    Box,
    { marginBottom: 1, flexDirection: wideLayout ? 'row' : 'column' },
    h(
      Box,
      { flexDirection: 'column', flexGrow: 1, marginRight: wideLayout ? 2 : 0 },
      h(Text, { color: 'gray' }, `${queryLabel}: branch, path, or HEAD`),
      h(TextInput, {
        placeholder: 'Press / to filter worktrees',
        defaultValue: query,
        onChange: setQuery,
        onSubmit: () => {
          setSearchMode(false);
          setStatus({
            variant: 'success',
            text: query ? `Showing ${filteredCount} matching worktrees.` : 'Search cleared.',
          });
        },
        isDisabled: !searchMode,
      })
    ),
    h(
      Box,
      { flexDirection: 'column', marginTop: wideLayout ? 0 : 1 },
      h(Text, { color: 'gray' }, 'Selection'),
      h(Text, { color: selectedEntry ? 'white' : 'gray', bold: Boolean(selectedEntry) }, selectedEntry?.branch ?? 'No match')
    )
  );
}

export function WorktreeList({ entries, selectedEntry, columns, query }) {
  if (entries.length === 0) {
    return h(
      Alert,
      { variant: 'warning', title: 'Nothing matches the current filter' },
      query ? 'Clear or edit the filter to see more worktrees.' : 'No worktrees found.'
    );
  }

  return h(
    Box,
    { flexDirection: 'column' },
    ...entries.map((entry, index) => {
      const isSelected = selectedEntry?.path === entry.path;
      const branchLabel = cliTruncate(entry.branch ?? '(no branch)', Math.max(12, columns - 70));
      const pathLabel = cliTruncate(entry.path, Math.max(20, columns - 52));

      return h(
        Box,
        {
          key: entry.path,
          flexDirection: 'column',
          marginBottom: index === entries.length - 1 ? 0 : 1,
          borderStyle: 'round',
          borderColor: isSelected ? 'cyan' : 'gray',
          paddingX: 1,
        },
        h(
          Box,
          { justifyContent: 'space-between' },
          h(Text, { color: isSelected ? 'cyan' : 'white', bold: isSelected }, `${isSelected ? '>' : ' '} ${branchLabel}`),
          h(EntryBadges, { entry })
        ),
        h(Text, { color: 'gray' }, pathLabel),
        entry.head ? h(Text, { color: 'gray' }, `HEAD ${entry.head.slice(0, 12)}`) : null
      );
    })
  );
}

export function DetailsPane({ currentCheckout, selectedEntry, details, comparison, columns }) {
  if (!selectedEntry) {
    return h(Alert, { variant: 'info', title: 'No worktree selected' }, 'Adjust the filter or refresh the list.');
  }

  const selectedPathText = cliTruncate(selectedEntry.path, Math.max(24, columns - 70));
  const highlightedLabel = selectedEntry.branch ?? `${selectedEntry.head?.slice(0, 12) ?? 'unknown'}`;
  const relationText = comparison.loading
    ? 'Comparing current checkout to highlighted branch...'
    : comparison.data
      ? comparison.data.sameHead
        ? 'same commit as current'
        : `${comparison.data.selectedAhead} ahead, ${comparison.data.currentAhead} behind`
      : 'Comparison unavailable for this selection.';

  return h(
    Box,
    { flexDirection: 'column' },
    h(DetailRow, { label: 'Branch', value: selectedEntry.branch ?? '(no branch)', color: 'cyan' }),
    h(DetailRow, { label: 'Path', value: selectedPathText }),
    h(DetailRow, { label: 'Commit', value: details.loading ? 'Loading...' : (details.data?.lastCommit ?? 'Unavailable') }),
    h(DetailRow, {
      label: 'Status',
      value: details.loading ? 'Inspecting worktree state...' : (details.data?.branchSummary ?? 'Unavailable'),
      color: details.data?.dirtyCount ? 'yellow' : 'green',
    }),
    h(DetailRow, {
      label: 'Compare',
      value: `${currentCheckout.label} -> ${highlightedLabel}`,
      color: 'magenta',
    }),
    comparison.loading
      ? h(Spinner, { label: 'Comparing branches' })
      : comparison.data
        ? h(
          Box,
          { flexDirection: 'column' },
          h(BulletLine, { color: comparison.data.sameHead ? 'green' : 'yellow' }, relationText),
          details.loading
            ? h(Spinner, { label: 'Collecting git metadata' })
            : h(BulletLine, null, h(GitStatusSummary, { details: details.data })),
          h(BulletLine, null, h(ComparisonSummary, { comparison: comparison.data }))
        )
        : null,
    !comparison.loading && !comparison.data && (
      details.loading
        ? h(Spinner, { label: 'Collecting git metadata' })
        : h(BulletLine, null, h(GitStatusSummary, { details: details.data }))
    ),
    h(EntryBadges, { entry: selectedEntry })
  );
}

export function DeletePrompt({ confirmAction }) {
  if (!confirmAction) return null;

  return h(
    Box,
    { marginTop: 1 },
    h(
      Alert,
      {
        variant: confirmAction.removeBranch ? 'error' : 'warning',
        title: confirmAction.removeBranch ? 'Delete worktree and branch' : 'Delete worktree',
      },
      confirmAction.removeBranch
        ? `Press y to remove ${confirmAction.entry.path} and delete ${confirmAction.entry.branch}. Any other key cancels.`
        : `Press y to remove ${confirmAction.entry.path}. Any other key cancels.`
    )
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

export function ManageFooter({ selectedEntry }) {
  return h(
    Box,
    { marginTop: 1, justifyContent: 'space-between', flexWrap: 'wrap' },
    h(Text, { color: 'gray' }, 'Keys: ↑ ↓ move  / filter  r refresh  d delete  D delete+branch  q quit'),
    h(Text, { color: 'gray' }, selectedEntry ? `Selected: ${selectedEntry.branch ?? selectedEntry.path}` : 'Selected: none')
  );
}
