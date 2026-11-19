import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/server";
import { renderWithIntl } from "@/test/render";
import type { Catalog, Day, Psychologist } from "@/lib/types";
import { BookingFlow } from "./BookingFlow";

const catalog: Catalog = {
  locations: [{ id: "bsd", name: "BSD (Tangerang)", active: true }],
  services: [
    { id: "adult-60", name: "Adult counseling", lengthMinutes: 60, ageGroup: "adult", active: true },
    { id: "family-120", name: "Family & couple counseling", lengthMinutes: 120, ageGroup: "family_couple", active: true },
  ],
};
const ayu: Psychologist = {
  id: "p1", name: "Ayu Lestari", title: "M.Psi., Psikolog", specialty: "", bio: "", photoUrl: "",
  sessionTypes: ["video", "chat", "in_person"], locationIds: ["bsd"], serviceIds: ["adult-60", "family-120"],
};

// Monday 9 March: 09:00 and 10:15 WIB online; Tuesday nothing.
const week = (taken: string[] = []): Day[] => [
  {
    date: "2026-03-09",
    slots: ["2026-03-09T02:00:00Z", "2026-03-09T03:15:00Z"]
      .filter((s) => !taken.includes(s))
      .map((s) => ({ Start: s, End: s, Mode: "online", LocationID: "" })),
  },
  { date: "2026-03-10", slots: [] },
];

function slotsApi(days: () => Day[]) {
  const seen: string[] = [];
  server.use(
    http.get("*/api/psychologists/p1/slots", ({ request }) => {
      seen.push(new URL(request.url).search);
      return HttpResponse.json({ days: days() });
    }),
  );
  return seen;
}

const signedIn = { role: "client" as const, name: "Rina Test", email: "rina@example.test" };

async function pickVideoAndNine(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: /Adult counseling/ }));
  await user.click(screen.getByRole("radio", { name: "Video call" }));
  await user.click(await screen.findByRole("button", { name: "09:00" }));
}

describe("BookingFlow", () => {
  it("books an online slot and shows the appointment card", async () => {
    slotsApi(() => week());
    let body: unknown;
    server.use(
      http.post("*/api/bookings", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: "b1", code: "ATT-7K2Q", changeDeadline: "2026-03-09T01:00:00Z" }, { status: 201 });
      }),
    );
    renderWithIntl(<BookingFlow psychologist={ayu} catalog={catalog} me={signedIn} today="2026-03-05" />);
    const user = userEvent.setup();

    await pickVideoAndNine(user);
    const summary = screen.getByRole("complementary", { name: "Your booking" });
    expect(within(summary).getByText("Monday 9 March")).toBeInTheDocument();
    expect(within(summary).getByText("09:00 WIB")).toBeInTheDocument();
    expect(within(summary).getByText("Video call")).toBeInTheDocument();
    await user.click(within(summary).getByRole("button", { name: "Confirm booking" }));

    const card = await screen.findByRole("region", { name: "You're booked" });
    expect(within(card).getByText("ATT-7K2Q")).toBeInTheDocument();
    expect(within(card).getByText(/until Monday 9 March, 08:00 WIB/)).toBeInTheDocument();
    expect(body).toEqual({ psychologistId: "p1", serviceId: "adult-60", mode: "online", onlineChannel: "video", start: "2026-03-09T02:00:00Z" });
  });

  it("says the time was just taken and refreshes the open times", async () => {
    let taken: string[] = [];
    const seen = slotsApi(() => week(taken));
    server.use(
      http.post("*/api/bookings", () => {
        taken = ["2026-03-09T02:00:00Z"];
        return HttpResponse.json({ error: "slot_taken" }, { status: 409 });
      }),
    );
    renderWithIntl(<BookingFlow psychologist={ayu} catalog={catalog} me={signedIn} today="2026-03-05" />);
    const user = userEvent.setup();

    await pickVideoAndNine(user);
    await user.click(screen.getByRole("button", { name: "Confirm booking" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sorry, this time was just taken. Please pick another one.");
    await waitFor(() => expect(screen.queryByRole("button", { name: "09:00" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "10:15" })).toBeInTheDocument();
    expect(seen.length).toBeGreaterThan(1);
  });

  it("asks for times at the chosen place when meeting in person", async () => {
    const seen = slotsApi(() => week());
    renderWithIntl(<BookingFlow psychologist={ayu} catalog={catalog} me={signedIn} today="2026-03-05" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: /Family & couple counseling/ }));
    await user.click(screen.getByRole("radio", { name: "BSD (Tangerang)" }));

    await waitFor(() => expect(seen.at(-1)).toMatch(/service=family-120.*mode=in_person&location=bsd/));
  });

  it("marks days without open times", async () => {
    slotsApi(() => week());
    renderWithIntl(<BookingFlow psychologist={ayu} catalog={catalog} me={signedIn} today="2026-03-05" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /Adult counseling/ }));
    await user.click(screen.getByRole("radio", { name: "Video call" }));

    expect(await screen.findByRole("button", { name: "Tuesday 10 March, no open times" })).toBeDisabled();
  });

  it("sends visitors to sign in before booking", async () => {
    slotsApi(() => week());
    renderWithIntl(<BookingFlow psychologist={ayu} catalog={catalog} me={null} today="2026-03-05" />);
    const user = userEvent.setup();
    await pickVideoAndNine(user);

    const link = screen.getByRole("link", { name: "Sign in to book this time" });
    expect(link.getAttribute("href")).toMatch(/^\/signin\?next=%2Fpsychologists%2Fp1/);
    expect(screen.queryByRole("button", { name: "Confirm booking" })).not.toBeInTheDocument();
  });

  it("opens on the month of the next open time and asks only for days still bookable", async () => {
    const seen = slotsApi(() => []);
    const withNext = { ...ayu, nextOpen: "2026-04-02T03:00:00Z" }; // Thursday 2 April
    renderWithIntl(<BookingFlow psychologist={withNext} catalog={catalog} me={signedIn} today="2026-03-28" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /Adult counseling/ }));
    await user.click(screen.getByRole("radio", { name: "Video call" }));

    expect(await screen.findByRole("grid", { name: "April 2026" })).toBeInTheDocument();
    await waitFor(() => expect(seen.at(-1)).toContain("from=2026-04-01&days=30"));
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await waitFor(() => expect(seen.at(-1)).toContain("from=2026-03-29&days=3")); // from tomorrow to 31 March
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
  });

  it("starts tomorrow when there is no known next open time", async () => {
    const seen = slotsApi(() => week());
    renderWithIntl(<BookingFlow psychologist={ayu} catalog={catalog} me={signedIn} today="2026-03-05" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /Adult counseling/ }));
    await user.click(screen.getByRole("radio", { name: "Video call" }));
    await waitFor(() => expect(seen.at(-1)).toContain("from=2026-03-06&days=26"));
  });
});
