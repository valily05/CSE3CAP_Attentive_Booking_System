import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/server";
import { renderWithIntl } from "@/test/render";
import type { Booking } from "@/lib/types";
import { MyBookings } from "./MyBookings";

const now = new Date("2026-03-05T03:00:00Z"); // Thursday 10:00 WIB

const base: Booking = {
  id: "b1", code: "ATT-7K2Q", clientId: "c1", clientName: "Rina Test", psychologistId: "p1", psychologistName: "Ayu Lestari",
  serviceId: "adult-60", serviceName: "Adult counseling", mode: "online", onlineChannel: "video",
  start: "2026-03-09T02:00:00Z", end: "2026-03-09T03:00:00Z", status: "confirmed",
  canChange: true, changeDeadline: "2026-03-09T01:00:00Z",
};
const past: Booking = { ...base, id: "b0", code: "ATT-2222", start: "2026-02-02T02:00:00Z", end: "2026-02-02T03:00:00Z", status: "attended", canChange: false };

function bookingsApi(list: () => Booking[]) {
  server.use(http.get("*/api/me/bookings", () => HttpResponse.json({ bookings: list() })));
}

describe("MyBookings", () => {
  it("splits upcoming and past, with the change deadline", async () => {
    bookingsApi(() => [past, base]);
    renderWithIntl(<MyBookings now={now} />);

    const upcoming = await screen.findByRole("region", { name: "Upcoming" });
    expect(within(upcoming).getByText("ATT-7K2Q")).toBeInTheDocument();
    expect(within(upcoming).getByText("Change or cancel until Monday 9 March, 08:00 WIB")).toBeInTheDocument();
    const pastList = screen.getByRole("region", { name: "Past" });
    expect(within(pastList).getByText("Attended")).toBeInTheDocument();
    expect(within(pastList).queryByRole("button")).not.toBeInTheDocument();
  });

  it("leads with the next session and when it is", async () => {
    const later: Booking = { ...base, id: "b2", code: "ATT-3333", start: "2026-03-16T02:00:00Z", end: "2026-03-16T03:00:00Z" };
    bookingsApi(() => [later, base]);
    renderWithIntl(<MyBookings now={now} />);

    const next = await screen.findByRole("region", { name: "Your next session" });
    expect(within(next).getByText("ATT-7K2Q")).toBeInTheDocument();
    expect(within(next).getByText("in 4 days")).toBeInTheDocument();
    expect(within(next).getByText("Ayu Lestari")).toBeInTheDocument();
    expect(within(next).queryByText("ATT-3333")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Upcoming" })).getByText("ATT-3333")).toBeInTheDocument();
  });

  it("shows every session on a month calendar, by status", async () => {
    bookingsApi(() => [past, base]);
    renderWithIntl(<MyBookings now={now} />);
    const user = userEvent.setup();

    const march = await screen.findByRole("grid", { name: "Your sessions in March 2026" });
    const chip = within(march).getByText("09:00 Ayu L.");
    expect(chip.closest('[role="gridcell"]')).toHaveTextContent(/^9/);
    expect(chip).toHaveAttribute("data-status", "confirmed");

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    const feb = screen.getByRole("grid", { name: "Your sessions in February 2026" });
    expect(within(feb).getByText("09:00 Ayu L.")).toHaveAttribute("data-status", "attended");
  });

  it("lists past sessions as a table", async () => {
    bookingsApi(() => [past, base]);
    renderWithIntl(<MyBookings now={now} />);
    const table = await screen.findByRole("table", { name: "Past" });
    expect(within(table).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Date", "With", "Session", "Status"]);
    expect(within(table).getByRole("cell", { name: "Attended" })).toBeInTheDocument();
  });

  it("hides the buttons after the deadline and points to the admin", async () => {
    bookingsApi(() => [{ ...base, canChange: false }]);
    renderWithIntl(<MyBookings now={now} />);

    expect(await screen.findByText("Changes for this session are closed. Please contact our admin.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel session" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change time" })).not.toBeInTheDocument();
  });

  it("cancels with a reason picked from a list", async () => {
    let status: Booking["status"] = "confirmed";
    let sent: unknown;
    bookingsApi(() => [{ ...base, status, canChange: status === "confirmed" }]);
    server.use(
      http.post("*/api/bookings/b1/cancel", async ({ request }) => {
        sent = await request.json();
        status = "cancelled";
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithIntl(<MyBookings now={now} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Cancel session" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel this session?" });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Reason (optional)" }), "travel");
    await user.click(within(dialog).getByRole("button", { name: "Yes, cancel it" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Session cancelled.");
    expect(sent).toEqual({ reason: "travel" });
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Past" })).getByText("Cancelled")).toBeInTheDocument());
  });

  it("moves a session to a new open time", async () => {
    let sent: unknown;
    bookingsApi(() => [base]);
    server.use(
      http.get("*/api/psychologists/p1/slots", ({ request }) => {
        const q = new URL(request.url).searchParams;
        expect(q.get("service")).toBe("adult-60");
        expect(q.get("mode")).toBe("online");
        return HttpResponse.json({
          days: [{ date: "2026-03-09", slots: [{ Start: "2026-03-09T03:15:00Z", End: "2026-03-09T04:15:00Z", Mode: "online", LocationID: "" }] }],
        });
      }),
      http.post("*/api/bookings/b1/reschedule", async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithIntl(<MyBookings now={now} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Change time" }));
    await user.click(await screen.findByRole("button", { name: "10:15" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Session moved to Monday 9 March at 10:15.");
    expect(sent).toEqual({ start: "2026-03-09T03:15:00Z" });
  });

  it("thanks the client who tapped 'I will attend' in a reminder", async () => {
    bookingsApi(() => [base]);
    renderWithIntl(<MyBookings now={now} attendCode="ATT-7K2Q" />);
    expect(await screen.findByText("Thank you for letting us know. See you soon.")).toBeInTheDocument();
  });
});
