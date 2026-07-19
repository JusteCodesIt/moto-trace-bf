import { describe, it, expect } from "vitest";
import { checkIpIngestRate, checkDeviceIngestRate, checkShareRate, extractIp } from "../rate-limiter";

describe("checkIpIngestRate", () => {
  it("allows the first request", () => {
    const result = checkIpIngestRate("10.0.0.1");
    expect(result.allowed).toBe(true);
  });

  it("blocks after burst limit", () => {
    const ip = "10.0.0.99";
    for (let i = 0; i < 10; i++) checkIpIngestRate(ip);
    const result = checkIpIngestRate(ip);
    expect(result.allowed).toBe(false);
  });
});

describe("checkDeviceIngestRate", () => {
  it("allows the first request", () => {
    const result = checkDeviceIngestRate("device-001");
    expect(result.allowed).toBe(true);
  });
});

describe("checkShareRate", () => {
  it("allows the first request", () => {
    expect(checkShareRate("10.0.0.2")).toBe(true);
  });
});

describe("extractIp", () => {
  it("extracts from cf-connecting-ip", () => {
    const req = new Request("https://example.com", {
      headers: { "cf-connecting-ip": "1.2.3.4" },
    });
    expect(extractIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-forwarded-for", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "5.6.7.8, 10.0.0.1" },
    });
    expect(extractIp(req)).toBe("5.6.7.8");
  });

  it("returns unknown when no header", () => {
    const req = new Request("https://example.com");
    expect(extractIp(req)).toBe("unknown");
  });
});
