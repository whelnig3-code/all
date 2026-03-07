/**
 * start-background.js — Background server launcher
 *
 * Spawns start-server.js as a detached background process with hidden window.
 * Like starting a car engine and walking away — the engine keeps running.
 *
 * Logs are redirected to files so they can be viewed with view-logs.bat.
 * PID is saved so stop-server.bat can find and kill the process.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const LOGS_DIR = path.join(ROOT, "logs");
const PID_FILE = path.join(LOGS_DIR, "server.pid");
const STDOUT_LOG = path.join(LOGS_DIR, "server-stdout.log");
const STDERR_LOG = path.join(LOGS_DIR, "server-stderr.log");

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Check for already running instance
if (fs.existsSync(PID_FILE)) {
  const oldPid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
  try {
    process.kill(oldPid, 0); // test if process exists
    console.log(`[background] Server already running (PID ${oldPid})`);
    console.log(`[background] Use stop-server.bat to stop it first.`);
    process.exit(1);
  } catch {
    // Process doesn't exist — stale PID file, clean it up
    fs.unlinkSync(PID_FILE);
  }
}

// Open log files for writing
const stdout = fs.openSync(STDOUT_LOG, "a");
const stderr = fs.openSync(STDERR_LOG, "a");

// Write startup marker to log
const marker = `\n${"=".repeat(60)}\n[${new Date().toISOString()}] Server starting in background mode\n${"=".repeat(60)}\n`;
fs.writeSync(stdout, marker);

// Spawn server as detached background process
const tsxCliMjs = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const child = spawn(process.execPath, [tsxCliMjs, "server.ts"], {
  cwd: ROOT,
  detached: true,
  windowsHide: true,
  stdio: ["ignore", stdout, stderr],
  env: { ...process.env, NODE_ENV: "development" },
});

// Save PID for stop-server.bat
fs.writeFileSync(PID_FILE, String(child.pid), "utf-8");

// Detach child — let it run independently
child.unref();

console.log(`[background] Server started (PID ${child.pid})`);
console.log(`[background] Logs: logs/server-stdout.log`);
console.log(`[background] Stop: stop-server.bat`);
console.log(`[background] View: view-logs.bat`);

// Exit launcher immediately
process.exit(0);
