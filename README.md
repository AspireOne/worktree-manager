# wt

A minimal Git worktree launcher for parallel agentic coding with [Codex CLI](https://github.com/openai/codex).

## Why

Codex CLI has no native worktree support. Running multiple agents in the same working directory causes file conflicts and makes it hard to parallelize independent tasks.

The solution is one Git worktree per task — each agent gets its own isolated directory and branch to work in, with no interference between sessions. `wt` automates the boilerplate: create the branch, create the worktree, run repo-specific setup, and optionally launch Codex right away.

## Usage

```bash
wt feat/auth-refactor           # create worktree + run setup, print cd command
wt fix/login-race --now         # same, then immediately launch codex
wt feat/thing --base develop    # branch off develop instead of main
wt feat/auth-refactor           # already exists? reattaches idempotently
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

```bash
chmod +x wt.mjs
ln -s $(pwd)/wt.mjs /usr/local/bin/wt
```

Add `.trees/` to your `.gitignore`:

```bash
echo ".trees/" >> .gitignore
```

## Config

`wt` looks for config in two places, merged in this order (higher overrides lower):

| File | Scope |
|---|---|
| `~/.config/wt/config.toml` | Global defaults for all repos |
| `.wt.config.toml` (repo root) | Per-repo config, commit this |

CLI flags override both.

**Example `.wt.config.toml`:**

```toml
baseBranch   = "main"
worktreeRoot = ".trees"

setup = [
  "cp {root}/.env.example {target}/.env",
  "cd {target} && pnpm install",
]
```

### Setup commands

Setup commands run once after the worktree is created. Three template variables are available:

| Variable | Value |
|---|---|
| `{target}` | Absolute path to the new worktree |
| `{root}` | Absolute path to the repo root |
| `{branch}` | The branch name (e.g. `feat/auth-refactor`) |

If no `setup` is configured, the script just creates the worktree and exits.

### All config keys

| Key | Default | Description |
|---|---|---|
| `baseBranch` | `"main"` | Branch to fork from when creating a new branch |
| `worktreeRoot` | `".trees"` | Directory under repo root where worktrees are placed |
| `shell` | system default | Shell used to run setup commands (`"bash"`, `"pwsh"`, etc.) |
| `setup` | `[]` | Ordered list of shell commands to run after worktree creation |

## Behavior

- **Branch exists?** Reused as-is.
- **Worktree exists?** Reattached, setup skipped.
- **Worktree registered but directory missing?** Stale entry pruned, worktree recreated.
- **`--now` / `-n`?** Launches `codex` inside the worktree after setup.
- **No `--now`?** Prints the `cd` + `codex` command and exits.
