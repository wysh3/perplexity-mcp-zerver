#!/usr/bin/env node
/**
 * Perplexity Pro Account Login Script
 *
 * This script opens a browser window for users to manually log into their
 * Perplexity Pro account. The session is saved to a persistent profile
 * that will be used by the MCP server.
 *
 * Usage: bun run login
 */

import { existsSync, mkdirSync } from "node:fs";
import puppeteer from "puppeteer";
import { CONFIG } from "./server/config.js";
import { generateBrowserArgs } from "./utils/puppeteer-logic.js";

const PERPLEXITY_URL = "https://www.perplexity.ai";

// Same evasion setup as the main server (from puppeteer.ts)
async function setupBrowserEvasion(page: import("puppeteer").Page) {
    await page.evaluateOnNewDocument(() => {
        Object.defineProperties(navigator, {
            webdriver: { get: () => undefined },
            hardwareConcurrency: { get: () => 8 },
            deviceMemory: { get: () => 8 },
            platform: { get: () => "Win32" },
            languages: { get: () => ["en-US", "en"] },
            permissions: {
                get: () => ({
                    query: async () => ({ state: "prompt" }),
                }),
            },
        });
        if (typeof window.chrome === "undefined") {
            (window as any).chrome = {
                app: {
                    InstallState: { DISABLED: "disabled", INSTALLED: "installed", NOT_INSTALLED: "not_installed" },
                    RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" },
                    getDetails: () => { },
                    getIsInstalled: () => { },
                    installState: () => { },
                    isInstalled: false,
                    runningState: () => { },
                },
                runtime: {
                    OnInstalledReason: { CHROME_UPDATE: "chrome_update", INSTALL: "install", SHARED_MODULE_UPDATE: "shared_module_update", UPDATE: "update" },
                    PlatformArch: { ARM: "arm", ARM64: "arm64", MIPS: "mips", MIPS64: "mips64", X86_32: "x86-32", X86_64: "x86-64" },
                    PlatformNaclArch: { ARM: "arm", MIPS: "mips", PNACL: "pnacl", X86_32: "x86-32", X86_64: "x86-64" },
                    PlatformOs: { ANDROID: "android", CROS: "cros", LINUX: "linux", MAC: "mac", OPENBSD: "openbsd", WIN: "win" },
                    RequestUpdateCheckStatus: { NO_UPDATE: "no_update", THROTTLED: "throttled", UPDATE_AVAILABLE: "update_available" },
                    connect: () => ({ postMessage: () => { }, onMessage: { addListener: () => { }, removeListener: () => { } }, disconnect: () => { } }),
                },
            };
        }
    });
}

async function main() {
    console.log("🔐 Perplexity Pro Account Login\n");

    // Ensure profile directory exists
    const profileDir = CONFIG.BROWSER_DATA_DIR;
    if (!existsSync(profileDir)) {
        mkdirSync(profileDir, { recursive: true });
        console.log(`📁 Created profile directory: ${profileDir}`);
    }

    console.log(`📂 Using profile directory: ${profileDir}\n`);
    console.log("🌐 Opening browser...\n");

    // Use minimal args for interactive login - avoid aggressive flags that break UI
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-infobars",
            "--window-size=1280,720",
            "--disable-blink-features=AutomationControlled", // Critical for Cloudflare
            "--disable-web-security", // Critical for CORS (Perplexity assets)
            "--disable-features=IsolateOrigins,site-per-process", // Critical for CORS
        ],
        userDataDir: profileDir,
        ignoreDefaultArgs: ["--enable-automation"], // Hide "Chrome is being controlled by automated test software"
    });

    // Use the existing page (don't create a new one - that leaves about:blank open)
    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());

    // Apply same evasion as main server
    await setupBrowserEvasion(page);

    // Same viewport and user agent as main server
    await page.setViewport({
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
    });
    await page.setUserAgent(CONFIG.USER_AGENT);
    page.setDefaultNavigationTimeout(CONFIG.PAGE_TIMEOUT);

    console.log("📍 Navigating to Perplexity...");
    console.log(`   URL: ${PERPLEXITY_URL}\n`);

    try {
        await page.goto(PERPLEXITY_URL, {
            waitUntil: "domcontentloaded",
            timeout: CONFIG.PAGE_TIMEOUT,
        });
        console.log("✅ Navigation successful!\n");
    } catch (err) {
        console.log(`⚠️  Navigation issue: ${err instanceof Error ? err.message : err}`);
        console.log("   The browser is ready - you can navigate manually if needed.\n");
    }
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("║                                                             ║");
    console.log("║   👋 INSTRUCTIONS:                                          ║");
    console.log("║                                                             ║");
    console.log("║   1. Complete any Cloudflare verification if shown          ║");
    console.log("║   2. Log into your Perplexity Pro account                   ║");
    console.log("║   3. Once logged in, close the browser window               ║");
    console.log("║   4. Your session will be saved automatically               ║");
    console.log("║                                                             ║");
    console.log("═══════════════════════════════════════════════════════════════\n");

    // Wait for browser to close
    await new Promise<void>((resolve) => {
        browser.on("disconnected", () => resolve());
    });

    console.log("\n✅ Login session saved successfully!");
    console.log("🚀 You can now use the MCP server with your Pro account.\n");
}

main().catch((error) => {
    console.error("❌ Login failed:", error.message);
    process.exit(1);
});
