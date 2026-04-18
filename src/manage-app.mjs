import React, { startTransition, useDeferredValue, useEffect, useRef, useState } from 'react';
import { Box, useApp, useInput, useWindowSize } from 'ink';
import {
  compareWorktreeRefs,
  getCurrentCheckoutContext,
  inspectWorktree,
  mergeWorktreeIntoCurrent,
  parseWorktreeList,
  removeWorktree,
} from './worktree.mjs';
import {
  DeletePrompt,
  DetailsPane,
  FilterPanel,
  ManageFooter,
  ManageHeader,
  ManageStatus,
  WorktreeList,
} from './manage-components.mjs';

const h = React.createElement;

function searchEntries(entries, query) {
  if (!query.trim()) return entries;

  const needle = query.trim().toLowerCase();
  return entries.filter((entry) =>
    (entry.branch ?? '').toLowerCase().includes(needle) ||
    entry.path.toLowerCase().includes(needle) ||
    (entry.head ?? '').toLowerCase().includes(needle)
  );
}

export function ManageApp({ repoRoot, initialEntries, theme }) {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const [entries, setEntries] = useState(initialEntries);
  const [selectedPath, setSelectedPath] = useState(initialEntries[0]?.path ?? null);
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [status, setStatus] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [details, setDetails] = useState({ loading: false, data: null });
  const [comparison, setComparison] = useState({ loading: false, data: null });
  const [isMerging, setIsMerging] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [currentCheckout, setCurrentCheckout] = useState(() => getCurrentCheckoutContext(repoRoot));
  const detailCacheRef = useRef(new Map());
  const comparisonCacheRef = useRef(new Map());

  const deferredQuery = useDeferredValue(query);
  const filteredEntries = searchEntries(entries, deferredQuery);
  const selectedEntry = filteredEntries.find((entry) => entry.path === selectedPath) ?? filteredEntries[0] ?? null;
  const selectedIndex = selectedEntry ? filteredEntries.findIndex((entry) => entry.path === selectedEntry.path) : -1;
  const currentEntry = entries.find((entry) => entry.isMain) ?? null;
  const staleCount = entries.filter((entry) => entry.prunable).length;
  const mainCount = entries.filter((entry) => entry.isMain).length;
  const reservedLines = searchMode ? 13 : 11;
  const visibleCount = Math.max(3, Math.floor((rows - reservedLines) / 2));
  const windowStart = selectedIndex === -1
    ? 0
    : Math.max(0, Math.min(filteredEntries.length - visibleCount, selectedIndex - Math.floor(visibleCount / 2)));
  const visibleEntries = filteredEntries.slice(windowStart, windowStart + visibleCount);
  const windowEnd = Math.min(filteredEntries.length, windowStart + visibleCount);
  const detailKey = selectedEntry
    ? `${refreshTick}:${selectedEntry.path}:${selectedEntry.head ?? selectedEntry.branch ?? ''}`
    : null;
  const comparisonKey = currentEntry && selectedEntry
    ? `${refreshTick}:${currentEntry.path}:${currentEntry.head ?? currentEntry.branch ?? ''}:${selectedEntry.path}:${selectedEntry.head ?? selectedEntry.branch ?? ''}`
    : null;

  useEffect(() => {
    if (selectedEntry && selectedEntry.path !== selectedPath) {
      setSelectedPath(selectedEntry.path);
      return;
    }

    if (!selectedEntry && selectedPath !== null) {
      setSelectedPath(null);
    }
  }, [selectedEntry, selectedPath]);

  useEffect(() => {
    if (!selectedEntry) {
      setDetails({ loading: false, data: null });
      return;
    }

    const cached = detailCacheRef.current.get(detailKey);
    if (cached) {
      setDetails({ loading: false, data: cached });
      return;
    }

    let active = true;
    setDetails({ loading: true, data: null });
    const timer = setTimeout(() => {
      const data = inspectWorktree(selectedEntry.path);
      detailCacheRef.current.set(detailKey, data);
      if (active) setDetails({ loading: false, data });
    }, 120);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [detailKey, selectedEntry]);

  useEffect(() => {
    if (!currentEntry || !selectedEntry) {
      setComparison({ loading: false, data: null });
      return;
    }

    const cached = comparisonCacheRef.current.get(comparisonKey);
    if (cached) {
      setComparison({ loading: false, data: cached });
      return;
    }

    let active = true;
    setComparison({ loading: true, data: null });
    const timer = setTimeout(async () => {
      const data = await compareWorktreeRefs(repoRoot, currentEntry, selectedEntry);
      if (!active) return;
      comparisonCacheRef.current.set(comparisonKey, data);
      setComparison({ loading: false, data });
    }, 120);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [comparisonKey, currentEntry, repoRoot, selectedEntry]);

  const refresh = (nextStatus = { variant: 'success', text: 'Worktree list refreshed.' }) => {
    setIsRefreshing(true);
    Promise.resolve().then(() => {
      detailCacheRef.current.clear();
      comparisonCacheRef.current.clear();
      setEntries(parseWorktreeList(repoRoot));
      setCurrentCheckout(getCurrentCheckoutContext(repoRoot));
      setRefreshTick((value) => value + 1);
      setIsRefreshing(false);
      setStatus(nextStatus);
    });
  };

  const moveSelection = (offset) => {
    if (!filteredEntries.length) return;

    const currentIndex = selectedIndex === -1 ? 0 : selectedIndex;
    const nextIndex = Math.max(0, Math.min(filteredEntries.length - 1, currentIndex + offset));
    setSelectedPath(filteredEntries[nextIndex].path);
  };

  const requestDelete = (removeBranch) => {
    if (!selectedEntry) {
      setStatus({ variant: 'warning', text: 'No worktree selected.' });
      return;
    }

    if (selectedEntry.isMain) {
      setStatus({ variant: 'warning', text: 'Main checkout cannot be removed here.' });
      return;
    }

    if (removeBranch && !selectedEntry.branch) {
      setStatus({ variant: 'warning', text: 'Selected worktree has no local branch to delete.' });
      return;
    }

    setConfirmAction({ removeBranch, entry: selectedEntry });
  };

  const confirmDelete = () => {
    if (!confirmAction) return;

    const message = removeWorktree(confirmAction.entry, repoRoot, confirmAction.removeBranch);
    setConfirmAction(null);
    setStatus({
      variant: message.startsWith('Removed') || message.startsWith('Pruned') ? 'success' : 'warning',
      text: message,
    });
    refresh({
      variant: message.startsWith('Removed') || message.startsWith('Pruned') ? 'success' : 'warning',
      text: message,
    });
  };

  const requestMerge = () => {
    if (isMerging) return;

    if (!selectedEntry || !currentEntry) {
      setStatus({ variant: 'warning', text: 'No worktree selected to merge.' });
      return;
    }

    setIsMerging(true);
    setStatus({ variant: 'info', text: `Checking whether ${selectedEntry.branch ?? selectedEntry.head ?? 'selection'} can be merged...` });

    Promise.resolve()
      .then(() => mergeWorktreeIntoCurrent(repoRoot, currentEntry, selectedEntry))
      .then((message) => {
        setIsMerging(false);
        refresh(message);
      })
      .catch((error) => {
        setIsMerging(false);
        setStatus({ variant: 'error', text: error.message ?? 'Merge failed.' });
        refresh({ variant: 'error', text: error.message ?? 'Merge failed.' });
      });
  };

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    if (confirmAction) {
      if (input === 'y' || input === 'Y') {
        confirmDelete();
        return;
      }

      setConfirmAction(null);
      setStatus({ variant: 'info', text: 'Delete cancelled.' });
      return;
    }

    if (isMerging) {
      setStatus({ variant: 'info', text: 'Merge is still running.' });
      return;
    }

    if (searchMode) {
      if (key.escape) {
        setSearchMode(false);
        setStatus({
          variant: 'info',
          text: query ? 'Search retained. Press / to edit or Backspace in search mode to clear.' : 'Exited search mode.',
        });
      }
      return;
    }

    if (input === 'q') {
      exit();
      return;
    }

    if (input === '/') {
      setSearchMode(true);
      setStatus({ variant: 'info', text: 'Filtering worktrees. Press Enter to leave search mode.' });
      return;
    }

    if (input === 'r') {
      refresh();
      return;
    }

    if (input === 'd') {
      requestDelete(false);
      return;
    }

    if (input === 'D') {
      requestDelete(true);
      return;
    }

    if (input === 'M') {
      requestMerge();
      return;
    }

    if (key.upArrow) {
      moveSelection(-1);
      return;
    }

    if (key.downArrow) {
      moveSelection(1);
      return;
    }

    if (key.home) {
      if (filteredEntries[0]) setSelectedPath(filteredEntries[0].path);
      return;
    }

    if (key.end && filteredEntries.at(-1)) {
      setSelectedPath(filteredEntries.at(-1).path);
    }
  }, { isActive: true });

  return h(
    Box,
    { flexDirection: 'column', paddingX: 1, paddingTop: 1, paddingBottom: 1 },
    h(ManageHeader, {
      repoRoot,
      entryCount: entries.length,
      staleCount,
      mainCount,
      columns,
      theme,
    }),
    h(FilterPanel, {
      query,
      searchMode,
      filteredCount: filteredEntries.length,
      currentCheckout,
      setQuery: (value) => startTransition(() => setQuery(value)),
      setSearchMode,
      setStatus,
      theme,
    }),
    h(WorktreeList, {
      entries: visibleEntries,
      selectedEntry,
      columns,
      query,
      windowStart,
      windowEnd,
      totalCount: filteredEntries.length,
      theme,
    }),
    h(DetailsPane, {
      currentCheckout,
      selectedEntry,
      details,
      comparison,
      columns,
      theme,
    }),
    h(DeletePrompt, { confirmAction, columns, theme }),
    h(ManageStatus, {
      isRefreshing: isRefreshing || isMerging,
      activityLabel: isMerging ? 'Merging selected worktree' : 'Refreshing worktree inventory',
      status,
      theme,
    }),
    h(ManageFooter, {
      theme,
    })
  );
}
