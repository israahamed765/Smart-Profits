import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SESSION_SECRET = "test-session-secret-must-be-long-enough-32";
process.env.APP_URL = "http://localhost:3000";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "AdminTestPass123!";
process.env.ADMIN_NAME = "Test Admin";

const testStoreRoot = mkdtempSync(join(tmpdir(), "smartprofit-test-data-"));
process.env.SMARTPROFIT_DATA_DIR = testStoreRoot;
process.env.SMARTPROFIT_FREEZE_PATH = join(testStoreRoot, ".absent-write-freeze");

const testEnv = process.env as Record<string, string | undefined>;
testEnv.NODE_ENV = "test";
// Tests always use the NaC simulator; never hit live RapidAPI from a developer .env key.
delete testEnv.NAC_API_KEY;
