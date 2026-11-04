import { describe, expect, it } from "vitest";
import { closeness, sitOutLine } from "@/components/SitOut";

describe("sit-out copy", () => {
  it("matches the brief's example", () => expect(sitOutLine("BTC", 0.025478, 0.16)).toBe("BTC lean +0.03. Needs 0.16 to call. Not even close."));
  it("grades closeness honestly", () => {
    expect(closeness(0.07, 0.16)).toBe("Getting warmer.");
    expect(closeness(-0.13, 0.16)).toBe("Almost.");
    expect(closeness(0.2, 0.16)).toBe("Over the line. That is a call.");
  });
  it("shows negative leans with a real minus", () => expect(sitOutLine("ETH", -0.05, 0.16)).toMatch(/^ETH lean −0\.05/));
});
