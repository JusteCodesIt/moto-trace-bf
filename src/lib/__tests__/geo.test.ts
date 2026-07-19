import { describe, it, expect } from "vitest";
import { haversineKm, haversineM } from "../geo";

describe("haversineKm", () => {
  it("returns 0 for same point", () => {
    expect(haversineKm(12.364, -1.5328, 12.364, -1.5328)).toBe(0);
  });

  it("computes known distance (Ouagadougou to Bobo-Dioulasso ~350 km)", () => {
    const d = haversineKm(12.364, -1.5328, 11.1771, -4.2979);
    expect(d).toBeGreaterThan(310);
    expect(d).toBeLessThan(370);
  });

  it("is symmetric", () => {
    const ab = haversineKm(12.364, -1.5328, 11.1771, -4.2979);
    const ba = haversineKm(11.1771, -4.2979, 12.364, -1.5328);
    expect(ab).toBeCloseTo(ba, 6);
  });
});

describe("haversineM", () => {
  it("returns meters (1000x km)", () => {
    const km = haversineKm(12.364, -1.5328, 12.365, -1.5328);
    const m = haversineM(12.364, -1.5328, 12.365, -1.5328);
    expect(m).toBeCloseTo(km * 1000, 6);
  });
});
