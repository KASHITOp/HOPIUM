import { describe, expect, it } from "vitest";
import engine from "./engine.json";
import { perVersion, STATIC_REGISTRY } from "./registry";
import type { Prediction } from "./types";

const p = (id: number, v: string, outcome: Prediction["outcome"], signal = "UP") => ({ id, model_version: v, outcome, signal, candle_close_time: `2026-11-0${id}T00:00:00Z` }) as Prediction;

describe("model registry", () => {
  it("the live engine version is registered", () => {
    expect(STATIC_REGISTRY.some((e) => e.model_version === engine.version)).toBe(true);
  });
  it("keeps versions separate and flags unregistered ones", () => {
    const s = perVersion([p(1, engine.version, "HIT"), p(2, engine.version, "MISS"), p(3, "mystery", null)], STATIC_REGISTRY);
    const live = s.find((x) => x.version === engine.version)!;
    expect([live.rows, live.hits, live.misses]).toEqual([2, 1, 1]);
    const m = s.find((x) => x.version === "mystery")!;
    expect(m.entry).toBeNull();
    expect(m.rows).toBe(1);
  });
  it("a registered version with no rows still appears (retired models are never erased)", () => {
    expect(perVersion([], STATIC_REGISTRY).length).toBe(STATIC_REGISTRY.length);
  });
});
