"""python -m research.run_stage stage1 [shard] [nshards]"""
import sys
import warnings

warnings.filterwarnings("ignore")
from research.harness import Config, run  # noqa: E402

STAGES = {
    "stage1": [Config(h=h, k=k, model=m, note="stage1 grid")
               for m in ("lgbm", "logreg") for h in (1, 4, 12, 24) for k in (0.003, 0.005, 0.01)],
    "stage2": [
        # family A: 12h k=1% (stage1 best: logreg)
        Config(h=12, k=0.01, model="ensemble", note="stage2 A ensemble"),
        Config(h=12, k=0.01, model="logreg", regime=True, note="stage2 A regime"),
        Config(h=12, k=0.01, model="logreg", sides="long_only", note="stage2 A long-only"),
        Config(h=12, k=0.01, model="logreg", groups=("base", "flow", "mtf", "volreg", "cross", "cal"), note="stage2 A no-funding"),
        Config(h=12, k=0.01, model="logreg", groups=("base", "mtf", "volreg", "cross", "cal", "fund"), note="stage2 A no-flow"),
        # family B: 1h k=0.5% (stage1: lgbm)
        Config(h=1, k=0.005, model="ensemble", note="stage2 B ensemble"),
        Config(h=1, k=0.005, model="lgbm", regime=True, note="stage2 B regime"),
        Config(h=1, k=0.005, model="lgbm", sides="long_only", note="stage2 B long-only"),
        Config(h=1, k=0.005, model="lgbm", tune=True, note="stage2 B nested tuning"),
        Config(h=1, k=0.005, model="lgbm", groups=("base", "flow", "mtf", "volreg", "cross", "cal"), note="stage2 B no-funding"),
        # family C: 1h k=1% (stage1: lgbm)
        Config(h=1, k=0.01, model="ensemble", note="stage2 C ensemble"),
        Config(h=1, k=0.01, model="lgbm", regime=True, note="stage2 C regime"),
        Config(h=1, k=0.01, model="lgbm", sides="long_only", note="stage2 C long-only"),
        Config(h=1, k=0.01, model="lgbm", tune=True, note="stage2 C nested tuning"),
        Config(h=1, k=0.01, model="lgbm", groups=("base", "flow", "mtf", "volreg", "cross", "cal"), note="stage2 C no-funding"),
    ],
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
