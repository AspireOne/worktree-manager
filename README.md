# wtc

A minimal Git worktree launcher for parallel agentic coding with [Codex CLI](https://github.com/openai/codex).

## Why

Codex CLI has no native worktree support. Running multiple agents in the same working directory causes file conflicts and makes it hard to parallelize independent tasks.

The solution is one Git worktree per task - each agent gets its own isolated directory and branch to work in, with no interference between sessions. `wtc` automates the boilerplate: create the branch, create the worktree, run repo-specific setup, and optionally launch Codex right away.

## Usage

```bash
wtc feat/auth-refactor           # create worktree + run setup, print cd command
wtc fix/login-race --now         # same, then immediately launch codex
wtc feat/thing --base develop    # branch off develop instead of main
wtc feat/auth-refactor           # already exists? reattaches idempotently
wtc init                         # write .wt.config.toml into the current directory
wtc manage                       # interactive worktree browser / remover
```

Worktrees are placed under `.trees/` in the repo root:

```
your-repo/
├── .trees/
│   ├── feat-auth-refactor/    ← isolated worktree, own branch
│   └── fix-login-race/
└── ...
```

## Install

Requires Node 18+.

For local development from this repo:

```bash
pnpm install
pnpm link --global
```

To run the local checkout without linking it globally, use either:

```bash
pnpm wtc -- manage
node ./bin/wtc.js manage
```

That exposes the `wtc` binary globally from your checked-out repo. If you later publish this package, installation becomes the usual:

```bash
pnpm add -g @aspireone/wt
```

Keep `.trees/` in your repo's `.gitignore`:

```bash
echo ".trees/" >> .gitignore
```

## Config

`wtc` looks for config in two places, merged in this order (higher overrides lower):

| File | Scope |
|---|---|
| `~/.config/wt/config.toml` | Global defaults for all repos |
| `.wt.config.toml` (repo root) | Per-repo config, commit this |

CLI flags override both.

To bootstrap a repo-local config file in the current directory, run:

```bash
wtc init
```

This creates `.wt.config.toml` from the packaged example template and refuses to overwrite an existing file.
`wtc init` keeps the file shape fixed and only auto-fills the `setup` commands when it can detect them confidently.

**Minimal `.wt.config.toml`:**

```toml
baseBranch   = "main"
worktreeRoot = ".trees"

setup = [
  # add repo-specific setup commands here
]
```

`wtc init` may emit more verbose but shell-agnostic generated commands than this minimal hand-written example so the auto-detected setup keeps working if you later switch `shell`.

### `init` detection

`wtc init` does not switch between multiple full templates. It always writes the same config file and only varies the generated `setup` list:

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

### Setup commands

Setup commands run once after the worktree is created. Three template variables are available:

| Variable | Value |
|---|---|
| `{target}` | Absolute path to the new worktree |
| `{root}` | Absolute path to the repo root |
| `{branch}` | The branch name (e.g. `feat/auth-refactor`) |

If no `setup` is configured, the CLI just creates the worktree and exits.

### All config keys

| Key | Default | Description |
|---|---|---|
| `baseBranch` | `"main"` | Branch to fork from when creating a new branch |
| `worktreeRoot` | `".trees"` | Directory under repo root where worktrees are placed |
| `shell` | system default | Shell used to run setup commands (`"bash"`, `"pwsh"`, etc.) |
| `setup` | `[]` | Ordered list of shell commands to run after worktree creation |
| `theme` | built-in palette | Optional `[theme]` table for `wtc manage` colors |

### Manage UI theme

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
- **`--now` / `-n`?** Launches `codex` inside the worktree after setup.
- **No `--now`?** Prints the `cd` + `codex` command and exits.

## Manage UI

Run `wtc manage` to open an interactive worktree navigator in the terminal.

- search by branch, path, or HEAD with `/`
- inspect the selected worktree in a dedicated details pane
- refresh the inventory with `r`
- delete the selected worktree with `d`
- delete the selected worktree and its local branch with `D`
- quit with `q`

The main checkout is visible for context but cannot be removed from this screen.

## Package Layout

```text
bin/wtc.js     npm-exposed executable
src/cli.mjs    implementation
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
