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


# ----------------------------------------------------------------------------- v3 engine models
class LogReg:
    """Standardised multinomial logistic regression; NaNs filled with training medians."""

    def fit(self, X, y):
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
        self.cols = list(X.columns)
        self.med = X.median()
        self.sc = StandardScaler().fit(X.fillna(self.med))
        self.m = LogisticRegression(C=0.05, max_iter=400).fit(self.sc.transform(X.fillna(self.med)), y)
        return self

    def predict_proba(self, X):
        X = X[self.cols]
        return self.m.predict_proba(self.sc.transform(X.fillna(self.med)))


LGBM_BASE = dict(objective="multiclass", num_class=3, learning_rate=0.03, n_estimators=250,
                 feature_fraction=0.7, bagging_fraction=0.7, bagging_freq=1, lambda_l2=10.0,
                 verbose=-1, n_jobs=2)


class EngineModel:
    """lgbm | logreg | ensemble (mean of both). predict_proba -> [P(BIG_DOWN), P(NOTHING), P(BIG_UP)]."""

    def __init__(self, kind: str, lgbm_params: dict):
        self.kind, self.lgbm_params = kind, lgbm_params

    def fit(self, X, y):
        import lightgbm as lgb
        self.parts = []
        if self.kind in ("lgbm", "ensemble"):
            self.parts.append(lgb.LGBMClassifier(**(LGBM_BASE | self.lgbm_params)).fit(X, y, categorical_feature=["coin_id"]))
        if self.kind in ("logreg", "ensemble"):
            self.parts.append(LogReg().fit(X, y))
        self.cols = list(X.columns)
        return self

    def predict_proba(self, X):
        return np.mean([p.predict_proba(X[self.cols]) for p in self.parts], axis=0)
