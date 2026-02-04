---
name: worktree
description: Quick reference for git worktrees - parallel Claude Code sessions with isolated working directories
invocable: true
---

# Git Worktree Quick Reference

Use git worktrees to run parallel Claude Code sessions with complete code isolation.

## Create a Worktree

```bash
# New worktree with new branch
git worktree add ../feature-name -b feature-name

# New worktree with existing branch
git worktree add ../bugfix-123 bugfix-123
```

## Start Claude in Worktree

```bash
cd ../feature-name
claude
```

Now you have an isolated Claude session. Changes here won't affect your main directory.

## Manage Worktrees

```bash
# List all worktrees
git worktree list

# Remove when done (after merging)
git worktree remove ../feature-name

# Clean up stale references
git worktree prune
```

## Complete Workflow Example

```bash
# 1. Create worktree for a feature
git worktree add ../auth-refactor -b auth-refactor
cd ../auth-refactor
npm install  # or your project's setup

# 2. Start Claude and work
claude

# 3. When done, go back and merge
cd ../scaffold  # main repo
git merge auth-refactor
git worktree remove ../auth-refactor
git branch -d auth-refactor
```

## Shell Shortcut

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Create worktree and start Claude
clx() {
    local branch="${1:-worktree-$(date +%Y%m%d-%H%M%S)}"
    git worktree add "../$branch" -b "$branch" && cd "../$branch" && claude
}
```

Usage: `clx feature-name` or just `clx` for auto-timestamped name.

## Tips

- Each worktree needs its own `npm install` / dependency setup
- Worktrees share git history and remotes
- Use descriptive names so you know what each is for
- Great for: parallel features, experiments, long-running tasks
