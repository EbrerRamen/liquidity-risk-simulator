import { describe, expect, it } from "vitest";
import { formatCompact, formatDecimal, formatMoney, formatMultiple, formatPercent, MINUS } from "./format";

describe("formatDecimal / formatMoney (exact)", () => {
  it("groups, pads and uses a typographic minus", () => {
    expect(formatDecimal("-1250000.5")).toBe(`${MINUS}1,250,000.50`);
    expect(formatDecimal("12.5", { sign: "always" })).toBe("+12.50");
  });

  it("never shows a sign on a value that rounds to zero", () => {
    expect(formatDecimal("-0.001")).toBe("0.00");
    expect(formatDecimal("0.001", { sign: "always" })).toBe("0.00");
  });

  it("uses each currency's minor units, rounding half-even", () => {
    expect(formatMoney("1234.5", "JPY")).toBe("1,234");
    expect(formatMoney("1235.5", "JPY")).toBe("1,236");
    expect(formatMoney("1234.5", "USD")).toBe("1,234.50");
  });

  it("keeps precision beyond floating point", () => {
    expect(formatDecimal("12345678901234567.89")).toBe("12,345,678,901,234,567.89");
  });
});

describe("formatCompact (display only)", () => {
  it.each([
    ["1250000000", "1.25bn"],
    ["-950000", `${MINUS}950k`],
    ["42.5", "42.5"],
    ["0", "0"],
    // Rounding up into the next unit reads as that unit, not "1000k".
    ["999999", "1m"],
    ["999.999", "1k"],
    ["999999999", "1bn"],
  ])("formatCompact(%s) = %s", (value, expected) => {
    expect(formatCompact(value)).toBe(expected);
  });

  it("can show a plus sign", () => {
    expect(formatCompact("2500", { sign: "always" })).toBe("+2.5k");
  });
});

describe("ratios", () => {
  it("formats fractions as percentages", () => {
    expect(formatPercent("0.0525")).toBe("5.25%");
    expect(formatPercent("-0.125", { dp: 1 })).toBe(`${MINUS}12.5%`);
  });

  it("formats multiples", () => {
    expect(formatMultiple("1.4237")).toBe("1.42×");
  });
});
