import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { ApiError, api } from "./api";

describe("api client", () => {
  it("returns parsed JSON on success", async () => {
    server.use(http.get("*/api/catalog", () => HttpResponse.json({ locations: [], services: [] })));
    await expect(api.get("/api/catalog")).resolves.toEqual({ locations: [], services: [] });
  });

  it("turns an API error body into an ApiError with its code", async () => {
    server.use(http.post("*/api/bookings", () => HttpResponse.json({ error: "slot_taken" }, { status: 409 })));
    const err = await api.post("/api/bookings", { start: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "slot_taken", status: 409 });
  });

  it("sends JSON with the right content type", async () => {
    let seen = "";
    server.use(
      http.post("*/api/auth/login", async ({ request }) => {
        seen = `${request.headers.get("content-type")} ${JSON.stringify(await request.json())}`;
        return HttpResponse.json({ role: "client" });
      }),
    );
    await api.post("/api/auth/login", { email: "a@b.test" });
    expect(seen).toBe('application/json {"email":"a@b.test"}');
  });

  it("treats 204 No Content as success with no body", async () => {
    server.use(http.post("*/api/auth/logout", () => new HttpResponse(null, { status: 204 })));
    await expect(api.post("/api/auth/logout")).resolves.toBeUndefined();
  });

  it("reports a dead network as the 'network' code", async () => {
    server.use(http.get("*/api/catalog", () => HttpResponse.error()));
    await expect(api.get("/api/catalog")).rejects.toMatchObject({ code: "network" });
  });
});
