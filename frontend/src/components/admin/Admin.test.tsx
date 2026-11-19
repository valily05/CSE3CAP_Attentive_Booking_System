import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/server";
import { renderWithIntl } from "@/test/render";
import type { Booking } from "@/lib/types";
import { AdminCalendar } from "./AdminCalendar";
import { History } from "./History";
import { NewBookingForm } from "./NewBookingForm";
import { Reports } from "./Reports";
import { SettingsForm } from "./SettingsForm";

const catalog = {
  locations: [{ id: "bsd", name: "BSD (Tangerang)", active: true }],
  services: [{ id: "adult-60", name: "Adult counseling", lengthMinutes: 60, ageGroup: "adult", active: true }],
};
const psychs = [{ id: "p1", name: "Ayu Lestari", title: "", specialty: "", bio: "", photoUrl: "", sessionTypes: ["video", "in_person"], locationIds: ["bsd"], serviceIds: ["adult-60"], nextOpen: null }];

function directoryApi() {
  server.use(
    http.get("*/api/catalog", () => HttpResponse.json(catalog)),
    http.get("*/api/psychologists", () => HttpResponse.json({ psychologists: psychs })),
  );
}

describe("NewBookingForm", () => {
  it("books for an existing client found by search, at any time", async () => {
    directoryApi();
    let body: Record<string, unknown> = {};
    server.use(
      http.get("*/api/admin/clients", () => HttpResponse.json({ clients: [{ id: "c1", name: "Rina Test", phone: "0812", email: "r@x.test" }] })),
      http.post("*/api/bookings", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "b9", code: "ATT-WAWA", changeDeadline: "" }, { status: 201 });
      }),
    );
    renderWithIntl(<NewBookingForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Find client by name, email or phone"), "rina");
    await user.click(await screen.findByRole("button", { name: /Rina Test/ }));
    await user.selectOptions(await screen.findByLabelText("Psychologist"), "p1");
    await user.selectOptions(screen.getByLabelText("Service"), "adult-60");
    await user.selectOptions(screen.getByLabelText("Channel"), "online:video");
    await user.type(screen.getByLabelText("Start"), "2026-03-02T12:00");
    await user.click(screen.getByRole("button", { name: "Book" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Booked ATT-WAWA.");
    expect(body).toEqual({ clientId: "c1", psychologistId: "p1", serviceId: "adult-60", mode: "online", onlineChannel: "video", start: "2026-03-02T12:00:00+07:00" });
  });

  it("adds a new client who contacted Attentive on WhatsApp", async () => {
    directoryApi();
    let created: unknown;
    server.use(
      http.post("*/api/admin/clients", async ({ request }) => {
        created = await request.json();
        return HttpResponse.json({ id: "c2" }, { status: 201 });
      }),
    );
    renderWithIntl(<NewBookingForm />);
    const user = userEvent.setup();
    const form = screen.getByRole("group", { name: "New client (for example from WhatsApp)" });
    await user.type(within(form).getByLabelText("Full name"), "Wati WhatsApp");
    await user.type(within(form).getByLabelText("Phone number"), "081298765432");
    await user.click(within(form).getByRole("button", { name: "Add client" }));

    expect(created).toEqual({ name: "Wati WhatsApp", phone: "081298765432", email: "" });
    expect(await screen.findByText(/Client: Wati WhatsApp/)).toBeInTheDocument();
  });
});

describe("AdminCalendar", () => {
  const b: Booking = {
    id: "b1", code: "ATT-7K2Q", clientId: "c1", clientName: "Rina Test", psychologistId: "p1", psychologistName: "Ayu Lestari",
    serviceId: "adult-60", serviceName: "Adult counseling", mode: "online", onlineChannel: "video",
    start: "2026-03-10T02:00:00Z", end: "2026-03-10T03:00:00Z", status: "confirmed", // Tuesday 09:00 WIB
  };
  const now = new Date("2026-03-09T01:00:00Z"); // Monday 08:00 WIB
  const budi = { ...psychs[0], id: "p2", name: "Budi Santoso" };

  function calendarApi(list: () => Booking[]) {
    server.use(
      http.get("*/api/catalog", () => HttpResponse.json(catalog)),
      http.get("*/api/psychologists", () => HttpResponse.json({ psychologists: [psychs[0], budi] })),
      http.get("*/api/admin/psychologists/:id/hours", ({ params }) =>
        HttpResponse.json({ hours: params.id === "p1" ? [{ weekday: 2, start: "09:00", end: "13:00", mode: "online" }] : [] }),
      ),
    );
    const queries: string[] = [];
    server.use(
      http.get("*/api/admin/bookings", ({ request }) => {
        queries.push(new URL(request.url).search);
        return HttpResponse.json({ bookings: list() });
      }),
    );
    return queries;
  }

  it("opens on this week for one psychologist, with their working hours shaded", async () => {
    const queries = calendarApi(() => [b]);
    renderWithIntl(<AdminCalendar now={now} />);

    const tuesday = await screen.findByRole("region", { name: "Tuesday 10 March" });
    expect(within(tuesday).getByText("Working 09:00 – 13:00, online")).toBeInTheDocument();
    expect(await within(tuesday).findByRole("button", { name: "09:00, Rina Test, Upcoming" })).toBeInTheDocument();
    await waitFor(() => expect(queries.at(-1)).toContain("from=2026-03-09&to=2026-03-15&psychologist=p1"));
  });

  it("flags past sessions nobody has marked yet", async () => {
    calendarApi(() => [b]);
    renderWithIntl(<AdminCalendar now={new Date("2026-03-10T05:00:00Z")} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "09:00, Rina Test, Needs marking" }));
    const panel = screen.getByRole("region", { name: "ATT-7K2Q" });
    expect(within(panel).getByRole("button", { name: "Attended" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Did not come" })).toBeInTheDocument();
  });

  it("switches psychologist from the list", async () => {
    const queries = calendarApi(() => []);
    renderWithIntl(<AdminCalendar now={now} />);
    const user = userEvent.setup();

    await user.click(await within(screen.getByRole("group", { name: "Psychologist" })).findByRole("button", { name: "Budi Santoso" }));
    await waitFor(() => expect(queries.at(-1)).toContain("psychologist=p2"));
  });

  it("cancels from the booking's panel; admins see full names", async () => {
    let status: Booking["status"] = "confirmed";
    calendarApi(() => [{ ...b, status }]);
    server.use(
      http.post("*/api/bookings/b1/cancel", () => {
        status = "cancelled";
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithIntl(<AdminCalendar now={now} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "09:00, Rina Test, Upcoming" }));
    const panel = screen.getByRole("region", { name: "ATT-7K2Q" });
    expect(within(panel).getByText("Rina Test")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Cancel session" }));
    expect(await screen.findByRole("button", { name: "09:00, Rina Test, Cancelled" })).toBeInTheDocument();
  });

  it("shows every psychologist side by side in the day view", async () => {
    const queries = calendarApi(() => [b]);
    renderWithIntl(<AdminCalendar now={new Date("2026-03-10T00:00:00Z")} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Day" }));

    const column = await screen.findByRole("region", { name: "Ayu Lestari" });
    expect(within(column).getByRole("button", { name: "09:00, Rina Test, Upcoming" })).toBeInTheDocument();
    await waitFor(() => expect(queries.at(-1)).toBe("?from=2026-03-10&to=2026-03-10"));
  });
});

describe("Reports", () => {
  it("shows totals and breakdowns with place names", async () => {
    directoryApi();
    server.use(
      http.get("*/api/admin/reports", () =>
        HttpResponse.json({
          totals: { Sessions: 2, Attended: 1, NoShows: 1, Cancellations: 1, NoShowRate: 50 },
          byPsychologist: { "Ayu Lestari": { Sessions: 2, Attended: 1, NoShows: 1, Cancellations: 1, NoShowRate: 50 } },
          byPlace: { online: { Sessions: 2, Attended: 1, NoShows: 1, Cancellations: 0, NoShowRate: 50 }, bsd: { Sessions: 0, Attended: 0, NoShows: 0, Cancellations: 1, NoShowRate: 0 } },
          byService: { "adult-60": { Sessions: 2, Attended: 1, NoShows: 1, Cancellations: 1, NoShowRate: 50 } },
        }),
      ),
    );
    renderWithIntl(<Reports today="2026-03-11" />);

    const totals = await screen.findByRole("region", { name: "Week" });
    expect(within(totals).getByText("50%")).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "BSD (Tangerang)" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Online" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Adult counseling" })).toBeInTheDocument();
  });
});

describe("SettingsForm", () => {
  it("offers only 30, 60 or 90 days for follow-ups and saves", async () => {
    let saved: Record<string, number> = {};
    server.use(
      http.get("*/api/admin/settings", () =>
        HttpResponse.json({ minLeadMinutes: 1440, changeCutoffMinute: 480, breakMinutes: 15, reminderFirstMinutes: 1440, reminderSecondMinutes: 120, followUpDays: 60, followUpCooldownDays: 30 }),
      ),
      http.put("*/api/admin/settings", async ({ request }) => {
        saved = (await request.json()) as Record<string, number>;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithIntl(<SettingsForm />);
    const user = userEvent.setup();

    const followUp = await screen.findByLabelText("Follow-up after no booking for");
    expect(within(followUp).getAllByRole("option").map((o) => o.textContent)).toEqual(["30 days", "60 days", "90 days"]);
    await user.selectOptions(followUp, "90");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Settings saved.");
    expect(saved.followUpDays).toBe(90);
    expect(saved.breakMinutes).toBe(15);
  });
});

describe("History", () => {
  it("reads as plain sentences", async () => {
    server.use(
      http.get("*/api/admin/history", () =>
        HttpResponse.json({ entries: [{ at: "2026-03-02T03:00:00Z", actor: "admin@attentive.test", action: "status:confirmed→cancelled", code: "ATT-7K2Q" }] }),
      ),
    );
    renderWithIntl(<History />);
    expect(await screen.findByText("admin@attentive.test changed status to Cancelled")).toBeInTheDocument();
    expect(screen.getByText("ATT-7K2Q")).toBeInTheDocument();
  });
});
