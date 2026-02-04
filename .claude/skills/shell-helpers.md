---
name: shell-helpers
description: Useful shell functions for Claude Code workflows - add these to your ~/.bashrc or ~/.zshrc
invocable: true
---

# Shell Helper Functions

Add these to `~/.bashrc` or `~/.zshrc`, then run `source ~/.bashrc` to activate.

## Worktree Launcher

Create a git worktree and start Claude in one command:

```bash
clx() {
    local branch="${1:-worktree-$(date +%Y%m%d-%H%M%S)}"
    git worktree add "../$branch" -b "$branch" && cd "../$branch" && claude
}
```

**Usage:**
```bash
clx feature-auth    # Named worktree
clx                 # Auto-timestamped name
```

## Quick Claude Modes

```bash
# Plan mode - read-only exploration
alias claude-plan='claude --permission-mode plan'

# Continue last session
alias claude-cont='claude --continue'

# Resume session picker
alias claude-pick='claude --resume'
```

## Project Navigation

```bash
# Jump to scaffold project
alias scaffold='cd ~/dev/scaffold && claude'
```

## After Adding

Reload your shell:
```bash
source ~/.bashrc
# or
source ~/.zshrc
```
