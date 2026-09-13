import { execFileSync } from "node:child_process";
import type { NextConfig } from "next";

const repositoryName = "down-to-the-stars";
const isGitHubPages = process.env.GITHUB_ACTIONS === "true";

function readGitValue(args: string[], fallback: string) {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const commitHash = readGitValue(["rev-parse", "--short=12", "HEAD"], "dev");
const commitDate = readGitValue(["show", "-s", "--format=%cI", "HEAD"], "unknown");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
    NEXT_PUBLIC_COMMIT_DATE: commitDate,
  },
  output: isGitHubPages ? "export" : undefined,
  basePath: isGitHubPages ? `/${repositoryName}` : "",
  assetPrefix: isGitHubPages ? `/${repositoryName}/` : "",
  trailingSlash: isGitHubPages,
};

export default nextConfig;
