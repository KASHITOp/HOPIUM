"""python -m research.run_stage stage1 [shard] [nshards]"""
import sys
import warnings

warnings.filterwarnings("ignore")
from research.harness import Config, run  # noqa: E402

STAGES = {
    "stage1": [Config(h=h, k=k, model=m, note="stage1 grid")
               for m in ("lgbm", "logreg") for h in (1, 4, 12, 24) for k in (0.003, 0.005, 0.01)],
}

if __name__ == "__main__":
    name = sys.argv[1]
    shard, n = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (0, 1)
    for i, cfg in enumerate(STAGES[name]):
        if i % n == shard:
            try:
                run(cfg)
            except Exception as e:
                print("FAILED", cfg, e, flush=True)
