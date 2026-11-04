import { describe, expect, it } from "vitest";
import { grade } from "./grading";
import { mockData } from "./mock";

const NOW = Date.UTC(2026, 10, 4, 10, 30);

describe("mock data is honest-shaped", () => {
  const { predictions, runs } = mockData(NOW);
  const calls = predictions.filter((p) => p.signal !== "NO_CALL");
  const graded = calls.filter((p) => p.hit !== null);
  const hitRate = graded.filter((p) => p.hit).length / graded.length;

  it("is mostly NO_CALL, like the real engine (under 15% calls)", () => {
    expect(calls.length / predictions.length).toBeLessThan(0.15);
    expect(calls.length).toBeGreaterThan(30);
  });
  it("has an unflattering hit rate near a coin flip (40-58%)", () => {
    expect(hitRate).toBeGreaterThan(0.4);
    expect(hitRate).toBeLessThan(0.58);
  });
  it("never grades before target_time and uses the real grading rule", () => {
    for (const p of predictions) {
      if (p.outcome === null) continue;
      expect(Date.parse(p.target_time)).toBeLessThanOrEqual(NOW);
      expect(grade(p.signal, p.price_at_call, p.price_at_target!).outcome).toBe(p.outcome);
    }
  });
  it("contains missed runs (printer jams)", () => expect(runs.filter((r) => r.status === "missed").length).toBeGreaterThan(0));
  it("labels its model version as DEMO", () => expect(predictions.every((p) => p.model_version.includes("DEMO"))).toBe(true));
});
