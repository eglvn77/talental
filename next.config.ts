import type { NextConfig } from "next";

// Anchor Turbopack's workspace root to the cwd where `next` was invoked.
// Without this, the presence of multiple package-lock.json files (e.g. the
// main repo's lockfile alongside a Claude Code worktree's lockfile) causes
// Turbopack to pick the wrong root and resolve modules from the sibling
// node_modules — which doesn't have the deps the active branch needs.
const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
