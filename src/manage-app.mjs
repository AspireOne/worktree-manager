import React, { startTransition, useDeferredValue, useEffect, useRef, useState } from 'react';
import { Box, useApp, useInput, useWindowSize } from 'ink';
import {
  compareWorktreeRefs,
  getCurrentCheckoutContext,
  inspectWorktree,
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
  Section,
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

export function ManageApp({ repoRoot, initialEntries }) {
  const { exit } = useApp();
  const { columns } = useWindowSize();
  const [entries, setEntries] = useState(initialEntries);
  const [selectedPath, setSelectedPath] = useState(initialEntries[0]?.path ?? null);
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [status, setStatus] = useState({
    variant: 'info',
    text: 'Search with /. Refresh with r. Destructive actions require confirmation.',
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [details, setDetails] = useState({ loading: false, data: null });
  const [comparison, setComparison] = useState({ loading: false, data: null });
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
  const wideLayout = columns >= 110;
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
    { flexDirection: 'column', paddingX: 1, paddingY: 1 },
    h(ManageHeader, {
      repoRoot,
      entryCount: entries.length,
      staleCount,
      mainCount,
    }),
    h(
      Section,
      { title: 'Navigator', borderColor: searchMode ? 'cyan' : 'gray' },
      h(
        Box,
        { flexDirection: 'column' },
        h(FilterPanel, {
          query,
          searchMode,
          wideLayout,
          filteredCount: filteredEntries.length,
          selectedEntry,
          setQuery: (value) => startTransition(() => setQuery(value)),
          setSearchMode,
          setStatus,
        }),
        h(
          Box,
          { flexDirection: wideLayout ? 'row' : 'column', columnGap: 2 },
          h(
            Section,
            { title: `Worktrees (${filteredEntries.length})`, borderColor: 'blue' },
            h(WorktreeList, {
              entries: filteredEntries,
              selectedEntry,
              columns,
              query,
            })
          ),
          h(
            Section,
            { title: 'Details', borderColor: selectedEntry ? 'cyan' : 'gray' },
            h(DetailsPane, {
              currentCheckout,
              selectedEntry,
              details,
              comparison,
              columns,
            })
          )
        )
      )
    ),
    h(DeletePrompt, { confirmAction }),
    h(ManageStatus, { isRefreshing, status }),
    h(ManageFooter, { selectedEntry })
  );
}
