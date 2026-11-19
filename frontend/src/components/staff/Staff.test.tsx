import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/server";
import { renderWithIntl } from "@/test/render";
import type { Booking } from "@/lib/types";
import { HoursEditor } from "./HoursEditor";
import { ScheduleList } from "./ScheduleList";

const now = new Date("2026-03-09T04:00:00Z"); // Monday 11:00 WIB
const session = (id: string, start: string, status: Booking["status"] = "confirmed"): Booking => ({
  id, code: `ATT-${id}`, clientId: "c", clientName: "Rina", psychologistId: "p1", psychologistName: "Ayu",
  serviceId: "adult-60", serviceName: "Adult counseling", mode: "in_person", locationId: "bsd", locationName: "BSD (Tangerang)",
  start, end: start, status,
});

describe("ScheduleList", () => {
  it("shows the week's sessions and lets the psychologist mark attendance after they start", async () => {
    let marked: unknown;
    let status: Booking["status"] = "confirmed";
    server.use(
      http.get("*/api/psy/schedule", ({ request }) => {
        expect(new URL(request.url).searchParams.get("from")).toBe("2026-03-09");
        return HttpResponse.json({ bookings: [session("A", "2026-03-09T02:00:00Z", status), session("B", "2026-03-10T02:00:00Z")] });
      }),
      http.post("*/api/bookings/A/attendance", async ({ request }) => {
        marked = await request.json();
        status = "no_show";
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithIntl(<ScheduleList now={now} />);
    const user = userEvent.setup();

    const done = (await screen.findByText("ATT-A")).closest("li")!;
    const later = screen.getByText("ATT-B").closest("li")!;
    expect(within(done).getByText(/Rina/)).toBeInTheDocument();
    expect(within(later).queryByRole("button", { name: "Attended" })).not.toBeInTheDocument();

    await user.click(within(done).getByRole("button", { name: "Did not come" }));
    expect(marked).toEqual({ status: "no_show" });
    expect(await within(screen.getByText("ATT-A").closest("li")!).findByText("Missed")).toBeInTheDocument();
  });
});

describe("HoursEditor", () => {
  const hoursApi = (onPut: (body: unknown) => Response = () => new HttpResponse(null, { status: 204 })) => {
    server.use(
      http.get("*/api/catalog", () => HttpResponse.json({ locations: [{ id: "bsd", name: "BSD (Tangerang)", active: true }], services: [] })),
      http.get("*/api/psy/hours", () => HttpResponse.json({ hours: [{ weekday: 1, start: "09:00", end: "15:00", mode: "in_person", locationId: "bsd" }] })),
      http.put("*/api/psy/hours", async ({ request }) => onPut(await request.json())),
    );
  };
  const render = () => renderWithIntl(<HoursEditor base="/api/psy" today="2026-03-05" />);

  it("shows the usual week as blocks on a week grid", async () => {
    hoursApi();
    render();
    const monday = await screen.findByRole("region", { name: "Monday" });
    expect(await within(monday).findByRole("button", { name: "Monday 09:00 – 15:00, BSD (Tangerang)" })).toBeInTheDocument();
  });

  it("edits a block and saves the week", async () => {
    let saved: unknown;
    hoursApi((b) => {
      saved = b;
      return new HttpResponse(null, { status: 204 });
    });
    render();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Monday 09:00 – 15:00, BSD (Tangerang)" }));
    const editor = screen.getByRole("group", { name: "Selected hours" });
    await user.selectOptions(within(editor).getByLabelText("To"), "16:00");
    await user.click(within(screen.getByRole("region", { name: "Tuesday" })).getByRole("button", { name: "Add hours on Tuesday" }));
    await user.click(screen.getByRole("button", { name: "Save hours" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Hours saved.");
    expect(saved).toEqual({
      hours: [
        { weekday: 1, start: "09:00", end: "16:00", mode: "in_person", locationId: "bsd" },
        { weekday: 2, start: "09:00", end: "12:00", mode: "online" },
      ],
    });
  });

  it("removes a block", async () => {
    let saved: unknown;
    hoursApi((b) => {
      saved = b;
      return new HttpResponse(null, { status: 204 });
    });
    render();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Monday 09:00 – 15:00, BSD (Tangerang)" }));
    await user.click(within(screen.getByRole("group", { name: "Selected hours" })).getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Save hours" }));
    await waitFor(() => expect(saved).toEqual({ hours: [] }));
  });

  it("explains overlapping hours", async () => {
    hoursApi(() => HttpResponse.json({ error: "overlapping_hours" }, { status: 422 }));
    render();
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "Monday 09:00 – 15:00, BSD (Tangerang)" });
    await user.click(screen.getByRole("button", { name: "Save hours" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You can't be in two places at once.");
  });

  it("warns about bookings that no longer fit, without removing them", async () => {
    hoursApi(() => HttpResponse.json({ bookingsOutsideHours: ["ATT-7K2Q"] }));
    render();
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "Monday 09:00 – 15:00, BSD (Tangerang)" });
    await user.click(screen.getByRole("button", { name: "Save hours" }));
    expect(await screen.findByRole("status")).toHaveTextContent("These bookings no longer fit the new hours and were kept: ATT-7K2Q.");
  });

  it("adds time off by tapping the first and last day on a calendar", async () => {
    let added: Record<string, unknown> = {};
    hoursApi();
    server.use(
      http.post("*/api/psy/unavailability", async ({ request }) => {
        added = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 201 });
      }),
    );
    render();
    const user = userEvent.setup();
    const timeOff = await screen.findByRole("region", { name: "Time off and blocks" });
    const grid = within(timeOff).getByRole("grid", { name: "March 2026" });
    await user.click(within(grid).getByRole("button", { name: "Monday 16 March" }));
    await user.click(within(grid).getByRole("button", { name: "Friday 20 March" }));
    await user.click(within(timeOff).getByRole("button", { name: "Add 16 – 20 March as time off" }));

    expect(await within(timeOff).findByText(/Added\./)).toBeInTheDocument();
    expect(added).toEqual({ kind: "time_off", label: "", start: "2026-03-16T00:00:00+07:00", end: "2026-03-21T00:00:00+07:00" });
  });

  it("blocks a few hours on one day", async () => {
    let added: Record<string, unknown> = {};
    hoursApi();
    server.use(
      http.post("*/api/psy/unavailability", async ({ request }) => {
        added = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 201 });
      }),
    );
    render();
    const user = userEvent.setup();
    const timeOff = await screen.findByRole("region", { name: "Time off and blocks" });
    await user.click(within(timeOff).getByRole("radio", { name: "Block" }));
    await user.click(within(timeOff).getByRole("button", { name: "Friday 13 March" }));
    await user.selectOptions(within(timeOff).getByLabelText("From"), "10:00");
    await user.selectOptions(within(timeOff).getByLabelText("To"), "11:00");
    await user.type(within(timeOff).getByLabelText("Label (only you and admin see this)"), "Team meeting");
    await user.click(within(timeOff).getByRole("button", { name: "Block Friday 13 March, 10:00 – 11:00" }));

    await waitFor(() => expect(added).toEqual({ kind: "block", label: "Team meeting", start: "2026-03-13T10:00:00+07:00", end: "2026-03-13T11:00:00+07:00" }));
  });
});
