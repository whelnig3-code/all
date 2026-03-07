import { promises as fsp } from "fs";
import path from "path";
import { getProjectBase } from "@/lib/utils/env";

const TEMP_DIR_NAME = ".agent-temp";
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function getTempDir(): string {
  return path.join(getProjectBase(), TEMP_DIR_NAME);
}

async function cleanupTempFiles(): Promise<void> {
  try {
    const tempDir = getTempDir();
    const entries = await fsp.readdir(tempDir, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      const filePath = path.join(tempDir, entry.name);
      try {
        const stat = await fsp.stat(filePath);
        if (now - stat.mtimeMs > MAX_AGE_MS) {
          if (entry.isDirectory()) {
            await fsp.rm(filePath, { recursive: true, force: true });
          } else {
            await fsp.unlink(filePath);
          }
        }
      } catch {
        // individual file cleanup failure is ok
      }
    }
  } catch {
    // temp dir doesn't exist — nothing to clean
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startTempCleaner(): void {
  if (intervalId) return; // already running
  cleanupTempFiles(); // run immediately on start
  intervalId = setInterval(cleanupTempFiles, CLEANUP_INTERVAL_MS);
}

export function stopTempCleaner(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
