---
name: Workspace package installation
description: Installing dependencies for one pnpm workspace package in this Replit monorepo
---

The package-management callback installs at the workspace root when the repository uses pnpm workspaces; package dependencies for a specific artifact must be added with a filtered pnpm command so they land in that artifact's package.json.

**Why:** A root install attempt is rejected by pnpm's workspace-root safety check and does not update the intended service.

**How to apply:** When a dependency belongs to one artifact, target that package explicitly and then run its own typecheck/build.