const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");

/**
 * Lightweight screenshot service using Playwright.
 * Replaces the broken timeline-for-agent screenshot CLI.
 *
 * Two modes:
 * 1. htmlFile — serve a single HTML file and screenshot it (daily summary)
 * 2. siteDir  — serve a static site directory and screenshot it (timeline dashboard)
 */
class ScreenshotService {
  constructor({ config }) {
    this.config = config;
  }

  /**
   * Capture a screenshot of an HTML page.
   *
   * @param {object} options
   * @param {string} options.htmlFile - Absolute path to an HTML file (daily summary mode)
   * @param {string} options.siteDir  - Absolute path to a static site directory (timeline mode)
   * @param {string} options.outputFile - Where to save the PNG
   * @param {number} options.width - Viewport width (default 420)
   * @param {number} options.height - Viewport height (default 900)
   * @param {number} options.deviceScaleFactor - DPR (default 2)
   * @param {boolean} options.fullPage - Capture full scrollable page (default true)
   * @param {string} options.selector - CSS selector to wait for before screenshot
   */
  async capture({
    htmlFile = "",
    siteDir = "",
    outputFile = "",
    width = 420,
    height = 900,
    deviceScaleFactor = 2,
    fullPage = true,
    selector = "",
  } = {}) {
    const resolvedOutput = this._resolveOutput(outputFile);

    // Launch headless Chrome via Playwright
    const { chromium } = require("playwright-core");
    const chromePath = this._resolveChromePath();

    // Start a temporary HTTP server
    const server = this._createServer({ htmlFile, siteDir });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}`;

    let browser = null;
    try {
      browser = await chromium.launch({
        executablePath: chromePath || undefined,
        headless: true,
        args: [
          "--disable-dev-shm-usage",
          "--hide-scrollbars",
          "--force-color-profile=srgb",
        ],
      });

      const page = await browser.newPage({
        viewport: { width, height },
        deviceScaleFactor,
      });

      await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });

      // Wait for the specified selector or fallback to .page or body
      const waitSelector = selector || ".page";
      const found = await page.locator(waitSelector).isVisible().catch(() => false);
      if (!found && selector) {
        // If custom selector not found, wait for .page or body
        await page.waitForSelector(".page, body", { state: "visible", timeout: 10_000 });
      } else if (found) {
        await page.locator(waitSelector).waitFor({ state: "visible", timeout: 10_000 });
      }

      // Let fonts and JS settle
      await page.waitForTimeout(2000);

      // Ensure output directory exists
      const outDir = path.dirname(resolvedOutput);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      await page.screenshot({
        path: resolvedOutput,
        type: "png",
        fullPage,
        animations: "disabled",
      });

      return {
        outputFile: resolvedOutput,
        width,
        height,
        fullPage,
        url,
      };
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
      server.close();
    }
  }

  // ---- private ----

  _createServer({ htmlFile, siteDir }) {
    const htmlFilePath = String(htmlFile || "").trim();
    const siteDirPath = String(siteDir || "").trim();

    if (htmlFilePath) {
      // Single HTML file mode
      const htmlContent = fs.readFileSync(htmlFilePath, "utf8");
      return http.createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(htmlContent);
      });
    }

    if (siteDirPath) {
      // Static site directory mode
      return http.createServer((req, res) => {
        const url = req.url === "/" ? "/index.html" : (req.url || "/");
        const filePath = path.join(siteDirPath, url.split("?")[0]);
        try {
          const content = fs.readFileSync(filePath);
          const ext = path.extname(filePath).toLowerCase();
          const mime = {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript",
            ".css": "text/css",
            ".json": "application/json",
            ".png": "image/png",
            ".svg": "image/svg+xml",
          }[ext] || "text/plain";
          res.writeHead(200, { "Content-Type": mime });
          res.end(content);
        } catch {
          res.writeHead(404);
          res.end();
        }
      });
    }

    throw new Error("Either htmlFile or siteDir must be provided.");
  }

  _resolveOutput(outputFile) {
    const normalized = String(outputFile || "").trim();
    if (normalized) return path.resolve(normalized);
    // Default output
    return path.join(os.homedir(), ".cyberboss", "screenshots", `screenshot-${Date.now()}.png`);
  }

  _resolveChromePath() {
    // Check env vars
    const configured =
      String(process.env.CYBERBOSS_SCREENSHOT_CHROME_PATH || "").trim() ||
      String(process.env.TIMELINE_FOR_AGENT_CHROME_PATH || "").trim();
    if (configured && fs.existsSync(configured)) return configured;

    // Platform defaults
    if (process.platform === "win32") {
      const candidates = [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
    }
    if (process.platform === "darwin") {
      return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    }
    // Linux: rely on PATH
    return "";
  }
}

module.exports = { ScreenshotService };
