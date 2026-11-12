/**
 * Mock of GET /system/info until the backend exists (Phase 2). Shape follows
 * TECHNICAL_PLAN §4.3. Users live in ./auth.ts.
 */
import type { SystemInfo } from "@/app/session";

export const MOCK_SYSTEM_INFO: SystemInfo = {
  version: "0.1.0",
  businessDate: "2026-11-12",
  baseCurrency: "USD",
  synthetic: true,
  llmAvailable: false,
};
