import { describe, expect, it } from "vitest";
import { addDays, dateKey, formatDate, formatDateTime, formatTime, minutesIntoDay, weekStart } from "./time";

// 14:00 WIB = 07:00 UTC. The test machine's own time zone must not matter.
const twoPmWIB = "2026-03-09T07:00:00Z";

describe("WIB time helpers", () => {
  it("formats times in WIB with each language's separator", () => {
    expect(formatTime(twoPmWIB, "en")).toBe("14:00");
    expect(formatTime(twoPmWIB, "id")).toBe("14.00");
  });

  it("formats dates with localized day and month names", () => {
    expect(formatDate(twoPmWIB, "en")).toBe("Monday 9 March") // en-GB style;
    expect(formatDate(twoPmWIB, "id")).toBe("Senin, 9 Maret");
  });

  it("formats a deadline with date and time", () => {
    expect(formatDateTime("2026-03-09T01:00:00Z", "en")).toBe("Monday 9 March, 08:00 WIB");
  });

  it("uses the WIB calendar day even when UTC is still the day before", () => {
    // 2026-03-08T18:30Z is 01:30 WIB on 9 March.
    expect(dateKey("2026-03-08T18:30:00Z")).toBe("2026-03-09");
  });

  it("measures minutes since WIB midnight", () => {
    expect(minutesIntoDay(twoPmWIB)).toBe(14 * 60);
  });

  it("moves date keys by whole days across month ends", () => {
    expect(addDays("2026-02-27", 3)).toBe("2026-03-02");
  });

  it("finds the Monday that starts the week", () => {
    expect(weekStart("2026-03-12")).toBe("2026-03-09"); // Thursday → Monday
    expect(weekStart("2026-03-15")).toBe("2026-03-09"); // Sunday belongs to the week before
  });
});

describe("short weekday", () => {
  it("abbreviates in each language", async () => {
    const { formatWeekdayShort } = await import("./time");
    expect(formatWeekdayShort("2026-03-09T05:00:00Z", "en")).toBe("Mon");
    expect(formatWeekdayShort("2026-03-09T05:00:00Z", "id")).toBe("Sen");
  });
});

describe("relative day", () => {
  it("says today, tomorrow or in N days by WIB calendar day", async () => {
    const { relativeDay } = await import("./time");
    const now = "2026-03-05T15:00:00Z"; // Thursday 22:00 WIB
    expect(relativeDay("2026-03-05T17:30:00Z", now, "en")).toBe("tomorrow"); // 00:30 WIB Friday
    expect(relativeDay("2026-03-05T15:30:00Z", now, "en")).toBe("today");
    expect(relativeDay("2026-03-09T02:00:00Z", now, "en")).toBe("in 4 days");
    expect(relativeDay("2026-03-09T02:00:00Z", now, "id")).toBe("dalam 4 hari");
  });
});

describe("month helpers", () => {
  it("names a month and counts its days", async () => {
    const { formatMonth, daysInMonth } = await import("./time");
    expect(formatMonth("2026-03", "en")).toBe("March 2026");
    expect(formatMonth("2026-03", "id")).toBe("Maret 2026");
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
  });
});
