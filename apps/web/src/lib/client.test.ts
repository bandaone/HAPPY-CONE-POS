import { describe, expect, it } from "vitest";
import { money, parseMoney } from "./client";

describe("money", () => {
  it("formats integer ngwee as kwacha", () => {
    expect(money(4200)).toBe("K42.00");
    expect(money(5)).toBe("K0.05");
    expect(money(-805)).toBe("-K8.05");
  });

  it("parses currency text without floating point conversion", () => {
    expect(parseMoney("K42.00")).toBe(4200);
    expect(parseMoney("1,234.5")).toBe(123450);
    expect(parseMoney("0.09")).toBe(9);
  });

  it("rejects malformed and negative values unless explicitly allowed", () => {
    expect(() => parseMoney("1.234")).toThrow(/valid kwacha/i);
    expect(() => parseMoney("-2.00")).toThrow(/negative/i);
    expect(parseMoney("-2.00", { allowNegative: true })).toBe(-200);
  });
});
