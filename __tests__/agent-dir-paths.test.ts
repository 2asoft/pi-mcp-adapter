import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { captureEnv } from "./test-env.js";

const tempDirs: string[] = [];
const restoreEnv = captureEnv([
  "HOME",
  "MCP_OAUTH_DIR",
  "PI_CODING_AGENT_DIR",
  "PI_PACKAGE_DIR",
  "ARC_CODING_AGENT_DIR",
]);

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-mcp-adapter-"));
  tempDirs.push(dir);
  return dir;
}

describe("Pi agent dir paths", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.PI_PACKAGE_DIR;
  });

  afterEach(() => {
    restoreEnv();

    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses PI_CODING_AGENT_DIR for Pi-owned config and state files", async () => {
    const home = createTempDir();
    const agentDir = createTempDir();
    process.env.HOME = home;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    delete process.env.MCP_OAUTH_DIR;

    const { getAgentDir } = await import("../agent-dir.ts");
    const { getPiGlobalConfigPath } = await import("../config.ts");
    const { getMetadataCachePath } = await import("../metadata-cache.ts");
    const { getOnboardingStatePath } = await import("../onboarding-state.ts");
    const { getAuthEntryFilePath, saveAuthEntry } = await import("../mcp-auth.ts");

    expect(getAgentDir()).toBe(agentDir);
    expect(getPiGlobalConfigPath()).toBe(join(agentDir, "mcp.json"));
    expect(getMetadataCachePath()).toBe(join(agentDir, "mcp-cache.json"));
    expect(getOnboardingStatePath()).toBe(join(agentDir, "mcp-onboarding.json"));

    saveAuthEntry("demo", { tokens: { accessToken: "token" } }, "https://example.com/mcp");
    expect(existsSync(getAuthEntryFilePath("demo"))).toBe(false);
    expect(getAuthEntryFilePath("demo").startsWith(join(agentDir, "mcp-oauth"))).toBe(true);
    expect(existsSync(join(agentDir, "mcp-oauth", "demo", "tokens.json"))).toBe(false);
    expect(existsSync(join(home, ".pi", "agent", "mcp-oauth", "demo", "tokens.json"))).toBe(false);
  });

  it("expands tilde in PI_CODING_AGENT_DIR", async () => {
    const home = createTempDir();
    process.env.HOME = home;
    process.env.PI_CODING_AGENT_DIR = "~/custom-pi-agent";

    const { getAgentDir } = await import("../agent-dir.ts");

    expect(getAgentDir()).toBe(join(home, "custom-pi-agent"));
  });

  it("uses the branded host environment key and config directory", async () => {
    const home = createTempDir();
    const packageDir = createTempDir();
    const agentDir = createTempDir();
    process.env.HOME = home;
    writeFileSync(join(packageDir, "package.json"), JSON.stringify({ piConfig: { name: "arc", configDir: ".arc" } }));
    process.env.PI_PACKAGE_DIR = packageDir;

    const { getAgentDir } = await import("../agent-dir.ts");

    expect(getAgentDir()).toBe(join(home, ".arc", "agent"));

    process.env.ARC_CODING_AGENT_DIR = agentDir;
    expect(getAgentDir()).toBe(agentDir);

    process.env.ARC_CODING_AGENT_DIR = "~/custom-agent";
    expect(getAgentDir()).toBe(join(home, "custom-agent"));

    process.env.ARC_CODING_AGENT_DIR = "relative-agent";
    expect(getAgentDir()).toBe(join(process.cwd(), "relative-agent"));
  });

  it("keeps MCP_OAUTH_DIR as the explicit OAuth storage override", async () => {
    const home = createTempDir();
    const agentDir = createTempDir();
    const oauthDir = createTempDir();
    process.env.HOME = home;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    process.env.MCP_OAUTH_DIR = oauthDir;

    const { getAuthEntryFilePath, saveAuthEntry } = await import("../mcp-auth.ts");

    saveAuthEntry("demo", { tokens: { accessToken: "token" } }, "https://example.com/mcp");
    expect(existsSync(getAuthEntryFilePath("demo"))).toBe(false);
    expect(getAuthEntryFilePath("demo").startsWith(oauthDir)).toBe(true);
    expect(existsSync(join(oauthDir, "demo", "tokens.json"))).toBe(false);
    expect(existsSync(join(agentDir, "mcp-oauth", "demo", "tokens.json"))).toBe(false);
  });
});
