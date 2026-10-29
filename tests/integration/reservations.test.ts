import { env as untypedEnv, exports as untypedExports } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";

// Явно приводим env и exports к нашим типам
const env = untypedEnv as unknown as {
  DB: D1Database;
  META: KVNamespace;
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

const exports = untypedExports as unknown as {
  default: {
    fetch: (request: Request | string, env?: unknown, ctx?: unknown) => Promise<Response>;
  };
};

const BASE_URL = "https://example.com";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec(`
    DELETE FROM reservations;
    DELETE FROM events;
  `);
  await env.DB.prepare(
    `INSERT INTO events (id, title, total_tickets, available_tickets)
     VALUES (?, ?, ?, ?)`
  )
    .bind("evt-seoul-001", "Seoul Concert", 5, 5)
    .run();

  await env.META.put("system:notice", "Welcome to Global Ticket Reservation");
});

describe("Global Event Ticket Reservation API", () => {
    it("GET /health returns a healthy response", async () => {
  const response = await exports.default.fetch(`${BASE_URL}/health`);
  expect(response.status).toBe(200);
  const data = await response.json<{ status: string; service: string }>();
  expect(data.status).toBe("ok");
  expect(data.service).toBe("global-event-ticket-reservation");
});
  it("GET /events returns D1 and KV data", async () => {
    const response = await exports.default.fetch(`${BASE_URL}/events`);
    expect(response.status).toBe(200);

    const data = await response.json<{
      events: Array<{ id: string; available_tickets: number }>;
      notice: string | null;
    }>();

    expect(data.events).toHaveLength(1);
    expect(data.events[0].id).toBe("evt-seoul-001");
    expect(data.events[0].available_tickets).toBe(5);
    expect(data.notice).toBe("Welcome to Global Ticket Reservation");
  });

  it("POST /reservations creates a reservation", async () => {
    const response = await exports.default.fetch(`${BASE_URL}/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: "evt-seoul-001",
        customerName: "Alice Kim",
        email: "alice@example.com",
        quantity: 2
      })
    });

    expect(response.status).toBe(201);
    const data = await response.json<{ reservationId: string; status: string }>();
    expect(data.status).toBe("CONFIRMED");

    const event = await env.DB.prepare(
      "SELECT available_tickets FROM events WHERE id = ?"
    ).bind("evt-seoul-001").first<{ available_tickets: number }>();

    expect(event?.available_tickets).toBe(3);
  });

  it("rejects invalid reservation quantity", async () => {
    const response = await exports.default.fetch(`${BASE_URL}/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: "evt-seoul-001",
        customerName: "Alice Kim",
        email: "alice@example.com",
        quantity: -5
      })
    });
    expect(response.status).toBe(400);
  });

  it("rejects insufficient ticket inventory", async () => {
    const response = await exports.default.fetch(`${BASE_URL}/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: "evt-seoul-001",
        customerName: "Alice Kim",
        email: "alice@example.com",
        quantity: 6
      })
    });
    expect(response.status).toBe(409);

    const event = await env.DB.prepare(
      "SELECT available_tickets FROM events WHERE id = ?"
    ).bind("evt-seoul-001").first<{ available_tickets: number }>();

    expect(event?.available_tickets).toBe(5);
  });

  it("DELETE restores available tickets", async () => {
    const createResponse = await exports.default.fetch(`${BASE_URL}/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: "evt-seoul-001",
        customerName: "Alice Kim",
        email: "alice@example.com",
        quantity: 2
      })
    });

    const created = await createResponse.json<{ reservationId: string }>();

    const deleteResponse = await exports.default.fetch(
      `${BASE_URL}/reservations/${created.reservationId}`,
      { method: "DELETE" }
    );
    expect(deleteResponse.status).toBe(200);

    const event = await env.DB.prepare(
      "SELECT available_tickets FROM events WHERE id = ?"
    ).bind("evt-seoul-001").first<{ available_tickets: number }>();

    expect(event?.available_tickets).toBe(5);
  });
});
