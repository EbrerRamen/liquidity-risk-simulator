import { describe, expect, it } from "vitest";
import { addMonths, daysBetween, following, isBusinessDay, modifiedFollowing, shiftDays, weekendMessage } from "./calendar";

// November 2026: Fri 13, Sat 14, Sun 15, Mon 16. Sat 31 Oct, Sun 1 Nov.

describe("business days (weekends only, §5.2)", () => {
  it("knows weekdays from weekends", () => {
    expect(isBusinessDay("2026-11-13")).toBe(true);
    expect(isBusinessDay("2026-11-14")).toBe(false);
    expect(isBusinessDay("2026-11-15")).toBe(false);
  });

  it("following rolls forward to the next business day", () => {
    expect(following("2026-11-14")).toBe("2026-11-16");
    expect(following("2026-11-13")).toBe("2026-11-13");
  });

  it("modified following stays in the month", () => {
    expect(modifiedFollowing("2026-11-14")).toBe("2026-11-16");
    // Following would land on Mon 2 Nov, in the next month, so roll back to Fri 30 Oct.
    expect(modifiedFollowing("2026-10-31")).toBe("2026-10-30");
  });
});

describe("addMonths (end-of-month rule)", () => {
  it.each([
    ["2026-01-15", 1, "2026-02-15"],
    ["2026-01-31", 1, "2026-02-28"],
    ["2026-02-28", 1, "2026-03-31"],
    ["2026-03-30", -1, "2026-02-28"],
    ["2026-11-30", 3, "2027-02-28"],
    ["2028-01-31", 1, "2028-02-29"],
  ])("addMonths(%s, %i) = %s", (iso, n, expected) => {
    expect(addMonths(iso, n)).toBe(expected);
  });
});

describe("day arithmetic", () => {
  it("crosses year ends", () => {
    expect(shiftDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("counts calendar days", () => {
    expect(daysBetween("2026-11-12", "2026-12-03")).toBe(21);
    expect(daysBetween("2026-12-03", "2026-11-12")).toBe(-21);
  });
});

describe("weekendMessage", () => {
  it("names the day and the next business day", () => {
    expect(weekendMessage("2026-12-13")).toBe("13 Dec 2026 is a Sunday; the next business day is 14 Dec 2026");
    expect(weekendMessage("2026-12-14")).toBeNull();
  });
});
