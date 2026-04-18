# wtm

A small, standalone Git worktree manager for creating, preparing, browsing, removing, and merging isolated worktrees.

![wtm demo screenshot](https://github.com/AspireOne/worktree-manager/blob/main/demo-screenshot.png)

## Why

Git worktrees are useful whenever you need multiple independent checkouts of the same repository:

- working on several branches at once
- testing a fix without disturbing your current checkout
- reviewing another branch while keeping local work in place
- running parallel automation or coding-agent sessions in isolated directories

The raw `git worktree` commands are powerful, but the everyday workflow is repetitive: choose a branch, create a safe directory name, add the worktree, run repo-specific setup, remember where it lives, clean it up later, and merge it back when ready.

`wtm` wraps that workflow in a focused CLI. It creates one worktree per branch under a predictable directory, runs optional setup commands, and provides an interactive terminal UI for managing active worktrees.

## Usage

```bash
wtm feat/auth-refactor           # create a worktree, run setup, print the path
wtm fix/login-race --base main   # branch off a specific base branch
wtm feat/auth-refactor           # already exists? reattach idempotently
wtm init                         # write .wtm.config.toml into the current repo
wtm manage                       # browse, remove, inspect, and merge worktrees
```

Worktrees are placed under `.trees/` in the repo root by default:

```text
your-repo/
├── .trees/
│   ├── feat-auth-refactor/    # isolated worktree, own branch
│   └── fix-login-race/
└── ...
```

Each worktree is a normal Git checkout. You can use any editor, terminal, automation, or agent inside it:

```bash
cd .trees/feat-auth-refactor
```

There is also a convenience shortcut:

```bash
wtm feat/auth-refactor --now
```

Currently `--now` launches `codex` inside the created worktree. The worktree management itself is not Codex-specific; this shortcut is just a launcher convenience for users who have that CLI installed.

## Install

Requires Node 18+ and Git. The `wtm manage` merge action requires a Git version with `git merge-tree --write-tree` support.

For local development from this repo:

```bash
pnpm install
pnpm link --global
```

To run the local checkout without linking it globally, use either:

```bash
pnpm wtm -- manage
node ./bin/wtm.js manage
```

To expose the `wtm` binary globally from your checked-out repo, use `pnpm link --global`. If you later publish this package, installation becomes the usual:

```bash
pnpm add -g @aspireone/wtm
```

Keep `.trees/` in your repo's `.gitignore`:

```bash
echo ".trees/" >> .gitignore
```

## Config

`wtm` looks for config in two places, merged in this order. Higher entries override lower entries.

| File | Scope |
|---|---|
| `~/.config/wtm/config.toml` | Global defaults for all repos |
| `.wtm.config.toml` in the repo root | Per-repo config, commit this |

CLI flags override both.

To bootstrap a repo-local config file in the current directory, run:

```bash
wtm init
```

This creates `.wtm.config.toml` from the packaged example template and refuses to overwrite an existing file.
`wtm init` keeps the file shape fixed and only auto-fills the `setup` commands when it can detect them confidently.

**Minimal `.wtm.config.toml`:**

```toml
baseBranch   = "main"
worktreeRoot = ".trees"

setup = [
  # add repo-specific setup commands here
]
```

`wtm init` may emit more verbose but shell-agnostic generated commands than this minimal hand-written example so the auto-detected setup keeps working if you later switch `shell`.

### `init` Detection

`wtm init` does not switch between multiple full templates. It always writes the same config file and only varies the generated `setup` list:

- if `.env.example` exists, it adds a shell-agnostic copy command for `.env`
- if `package.json` exists and the package manager can be inferred from a lockfile or `packageManager`, it adds the matching install command
- if neither signal is present, it writes `setup = []`

The generated commands are quoted and avoid shell-specific builtins like `cp` or `copy`, so they are more portable across the supported shells. They still assume the configured shell can invoke quoted `node -e "..."` commands.

Current package-manager detection order:

- `pnpm-lock.yaml` -> `pnpm install`
- `package-lock.json` or `npm-shrinkwrap.json` -> `npm install`
- `yarn.lock` -> `yarn install`
- `bun.lock` or `bun.lockb` -> `bun install`
- otherwise, `package.json#packageManager`

### Setup Commands

Setup commands run once after the worktree is created. Three template variables are available:

| Variable | Value |
|---|---|
| `{target}` | Absolute path to the new worktree |
| `{root}` | Absolute path to the repo root |
| `{branch}` | The branch name, such as `feat/auth-refactor` |

If no `setup` is configured, the CLI just creates the worktree and exits.

### All Config Keys

| Key | Default | Description |
|---|---|---|
| `baseBranch` | `"main"` | Branch to fork from when creating a new branch |
| `worktreeRoot` | `".trees"` | Directory under repo root where worktrees are placed |
| `shell` | system default | Shell used to run setup commands, such as `"bash"` or `"pwsh"` |
| `setup` | `[]` | Ordered list of shell commands to run after worktree creation |
| `theme` | built-in palette | Optional `[theme]` table for `wtm manage` colors |

### Manage UI Theme

You can override the interactive manage UI colors from either config file:

```toml
[theme]
accent = "#91a7ff"
accentStrong = "#c1ccff"
context = "#aebbd0"
success = "#7fd38b"
warning = "#f0b85a"
danger = "#f07f7f"
textPrimary = "#f4f7fb"
textLabel = "#cbd7e3"
textMuted = "#9aa8b7"
textDim = "#657386"
```

These values map directly to Ink text colors. Named colors, hex colors, `rgb(...)`, and `ansi256(...)` values are supported.

## Behavior

- **Branch exists?** Reused as-is.
- **Worktree exists?** Reattached, setup skipped.
- **Worktree registered but directory missing?** Stale entry pruned, worktree recreated.
- **Setup configured?** Commands run once after a new worktree is created.
- **`--now` / `-n`?** Launches `codex` inside the worktree after setup.
- **No `--now`?** Prints the worktree path and a suggested next command, then exits.

## Manage UI

Run `wtm manage` to open an interactive worktree navigator in the terminal.

- search by branch, path, or HEAD with `/`
- inspect the selected worktree in a dedicated details pane
- refresh the inventory with `r`
- delete the selected worktree with `d`
- delete the selected worktree and its local branch with `D`
- merge the selected worktree into the current checkout with `M`
- quit with `q`

The main checkout is visible for context but cannot be removed from this screen.
The details pane compares each selected worktree against the current checkout and reports commit distance, changed files, and whether Git's static merge check sees conflicts.

`M` is intentionally guarded. It only merges when:

- the current checkout and selected worktree are both on local branches
- the selected branch has commits that are not already in the current checkout
- the current checkout is clean
- no merge, rebase, cherry-pick, revert, or bisect operation is in progress
- the static merge check reports no conflicts
- both branch tips are unchanged between the static check and the merge

If those checks pass, `wtm` runs `git merge --no-edit` against the checked selected commit. If the selected branch has nothing new to merge, the UI reports that and leaves the repository unchanged.

## Package Layout

```text
bin/wtm.js     npm-exposed executable
src/cli.mjs    CLI entry point
src/           implementation
scripts/       release automation
package.json   npm package metadata
```

## Release

Create a new patch release, tag it, and publish it:

```bash
pnpm run release
```

For a different bump level:

```bash
pnpm run release -- minor
```

The preflight check uses `pnpm pack` in a temporary directory, so it validates the tarball contents locally without failing just because that version already exists on npm or leaving a tarball in the repo.
