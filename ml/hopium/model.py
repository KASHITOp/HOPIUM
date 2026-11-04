"""Pickled model wrapper. Lives in its own module so pickles reference hopium.model, not __main__."""
import numpy as np
import pandas as pd

from .features import FEATURES


class CalibratedModel:
    """LightGBM classifier + isotonic calibrator."""

    def __init__(self, booster, iso, version):
        self.booster, self.iso, self.version = booster, iso, version

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        return self.iso.predict(self.booster.predict_proba(X[FEATURES])[:, 1])
