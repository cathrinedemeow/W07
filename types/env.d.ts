// Объявляем глобальные типы базы данных и KV для нашего окружения
interface Env {
  DB: D1Database;
  META: KVNamespace;
}

// Расширяем встроенный модуль "cloudflare:workers"
declare module "cloudflare:workers" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: Parameters<
      typeof import("cloudflare:test").applyD1Migrations
    >[1];
  }

  export const env: ProvidedEnv;

  export const exports: {
    default: {
      fetch: (
        request: Request | string,
        env?: ProvidedEnv,
        ctx?: ExecutionContext
      ) => Promise<Response>;
    };
  };
}