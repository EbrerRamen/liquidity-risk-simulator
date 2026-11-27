import { describe, expect, it } from "vitest";
import { groupDecimal, parseAmountInput, roundDecimal, shiftDecimal } from "./decimal";

describe("shiftDecimal", () => {
  it.each([
    ["5.25", -2, "0.0525"],
    ["0.0525", 2, "5.25"],
    ["-1.5", 3, "-1500"],
    ["0", 3, "0"],
    ["120", -1, "12"],
  ])("shiftDecimal(%s, %i) = %s", (value, places, expected) => {
    expect(shiftDecimal(value, places)).toBe(expected);
  });
});

describe("parseAmountInput", () => {
  it.each([
    ["25,000,000", "25000000"],
    ["25m", "25000000"],
    ["25MM", "25000000"],
    ["1.5bn", "1500000000"],
    ["250k", "250000"],
    [".5m", "500000"],
    ["-2m", "-2000000"],
    [" 1 250.75 ", "1250.75"],
  ])("reads %j as %s", (raw, expected) => {
    expect(parseAmountInput(raw)).toBe(expected);
  });

  it.each(["", "abc", "1.2.3", "5x", "--1"])("rejects %j", (raw) => {
    expect(parseAmountInput(raw)).toBeNull();
  });
});

describe("roundDecimal", () => {
  // Half-even, like the backend's ROUND_HALF_EVEN: a tie goes to the even neighbour.
  it.each([
    ["2.345", 2, "2.34"],
    ["2.355", 2, "2.36"],
    ["1.5", 0, "2"],
    ["2.5", 0, "2"],
    ["2.5001", 0, "3"],
    ["-1234.567", 2, "-1234.57"],
    ["7", 2, "7.00"],
    ["-0.004", 2, "0.00"],
  ])("roundDecimal(%s, %i) = %s", (value, dp, expected) => {
    expect(roundDecimal(value, dp)).toBe(expected);
  });
});

describe("groupDecimal", () => {
  it("groups thousands and pads to the given places", () => {
    expect(groupDecimal("25000000.5", 2)).toBe("25,000,000.50");
    expect(groupDecimal("-1234.567", 2)).toBe("-1,234.57");
    expect(groupDecimal("999", 0)).toBe("999");
  });
});
