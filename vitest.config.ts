import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      // .href приведёт URL к стандартной строке
      const migrationsPath = fileURLToPath(
        new URL("./migrations/", import.meta.url).href
      );
      const migrations = await readD1Migrations(
        path.resolve(migrationsPath)
      );
      return {
        wrangler: {
          configPath: "./wrangler.jsonc"
        },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations
          }
        }
      };
    })
  ],
  test: {
    include: ["tests/**/*.test.ts"]
  }
});