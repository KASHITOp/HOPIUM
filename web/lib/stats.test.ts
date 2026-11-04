import { describe, expect, it } from "vitest";
import { binomialTest, calibrationBins, luckSentence, maxDrawdown, pctFloor, sharpe, streaks, wilson } from "./stats";

describe("wilson", () => {
  it("matches R prop.test(54, 100, correct = FALSE)", () => {
    const w = wilson(54, 100);
    expect(w.lo).toBeCloseTo(0.4426, 4);
    expect(w.hi).toBeCloseTo(0.6344, 4);
  });
  it("handles 0 of 10 (lower bound 0, upper 0.2775)", () => {
    const w = wilson(0, 10);
    expect(w.lo).toBe(0);
    expect(w.hi).toBeCloseTo(0.2775, 4);
  });
  it("n = 0 gives the full interval", () => expect(wilson(0, 0)).toMatchObject({ lo: 0, hi: 1 }));
});

describe("binomialTest", () => {
  it("matches R binom.test(60, 100): two-sided 0.05689", () => {
    expect(binomialTest(60, 100).twoSided).toBeCloseTo(0.05689, 5);
  });
  it("one-sided P(X >= 60 | n = 100) = 0.02844", () => {
    expect(binomialTest(60, 100).atLeast).toBeCloseTo(0.02844, 5);
  });
  it("5 of 10 is perfectly ordinary (p = 1)", () => expect(binomialTest(5, 10).twoSided).toBeCloseTo(1, 6));
  it("matches R binom.test(7, 20): two-sided 0.2632", () => expect(binomialTest(7, 20).twoSided).toBeCloseTo(0.2632, 4));
});

describe("luckSentence", () => {
  it("says when there is not enough data", () => expect(luckSentence(3, 5)).toMatch(/Far too few/));
  it("quotes the one-sided luck probability", () => expect(luckSentence(60, 100)).toMatch(/about 3%/));
  it("calls out not beating a coin flip", () => expect(luckSentence(45, 100)).toMatch(/not even beating/));
});

describe("sharpe / drawdown", () => {
  it("sharpe of [0.01, -0.01, 0.02, 0] daily = 7.3993 annualised", () => {
    expect(sharpe([0.01, -0.01, 0.02, 0])).toBeCloseTo(7.3993, 3);
  });
  it("max drawdown of [1, 1.2, 0.9, 1.1, 0.6, 1.3] = 50%", () => expect(maxDrawdown([1, 1.2, 0.9, 1.1, 0.6, 1.3])).toBeCloseTo(0.5, 10));
  it("flat equity has zero drawdown", () => expect(maxDrawdown([1, 1, 1])).toBe(0));
});

describe("calibrationBins", () => {
  it("groups predictions and measures observed frequency", () => {
    const bins = calibrationBins([0.05, 0.15, 0.12, 0.95], [false, true, false, true]);
    expect(bins).toEqual([
      { lo: 0, hi: 0.1, n: 1, predicted: 0.05, actual: 0 },
      { lo: 0.1, hi: 0.2, n: 2, predicted: 0.135, actual: 0.5 },
      { lo: 0.9, hi: 1, n: 1, predicted: 0.95, actual: 1 },
    ]);
  });
});

describe("streaks + rounding", () => {
  it("finds longest runs and the current run", () => {
    expect(streaks([true, true, false, false, false, true])).toEqual({ current: 1, currentKind: "hit", longestHit: 2, longestMiss: 3 });
  });
  it("never rounds a hit rate up", () => {
    expect(pctFloor(0.5299)).toBe("52.9%");
    expect(pctFloor(0.4999)).toBe("49.9%");
  });
});
