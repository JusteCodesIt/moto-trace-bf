import { describe, it, expect } from "vitest";
import { fmtCoord, fmtDuration, bearingToCompass, speedColor } from "../format";

describe("fmtCoord", () => {
  it("formats with 6 decimals by default", () => {
    expect(fmtCoord(12.364)).toBe("12.364000");
  });

  it("respects custom decimals", () => {
    expect(fmtCoord(12.364, 2)).toBe("12.36");
  });
});

describe("fmtDuration", () => {
  it("formats minutes only", () => {
    expect(fmtDuration(45)).toBe("45min");
  });

  it("formats hours and minutes", () => {
    expect(fmtDuration(125)).toBe("2h 5min");
  });

  it("formats exact hours", () => {
    expect(fmtDuration(120)).toBe("2h 0min");
  });
});

describe("bearingToCompass", () => {
  it("maps 0° to N", () => {
    expect(bearingToCompass(0)).toBe("N");
  });

  it("maps 90° to E", () => {
    expect(bearingToCompass(90)).toBe("E");
  });

  it("maps 180° to S", () => {
    expect(bearingToCompass(180)).toBe("S");
  });

  it("maps 270° to O", () => {
    expect(bearingToCompass(270)).toBe("O");
  });
});

describe("speedColor", () => {
  it("returns green for low speed", () => {
    expect(speedColor(30)).toBe("var(--accent-green)");
  });

  it("returns amber for medium speed", () => {
    expect(speedColor(75)).toBe("var(--accent-amber)");
  });

  it("returns red for high speed", () => {
    expect(speedColor(95)).toBe("var(--accent-red)");
  });
});
