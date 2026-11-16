"""WS6: 12h training labels must never cross the validation/test boundary (purge = h + 25 hours)."""
import pandas as pd
import pytest

from research.harness import purged_split

H = 12


def frame():
    ts = pd.date_range("2025-01-01", "2025-06-30 23:00", freq="h", tz="UTC")
    return pd.DataFrame({"ts": ts})


@pytest.mark.parametrize("month", ["2025-04", "2025-05", "2025-06"])
def test_train_labels_end_before_test(month):
    d = frame()
    m = pd.Period(month, freq="M")
    start, end = m.start_time.tz_localize("UTC"), (m + 1).start_time.tz_localize("UTC")
    train, val, inner, test = purged_split(d, start, end, H, 30)
    assert (train.ts + pd.Timedelta(hours=H) < start).all()
    # gap between last label end and first test row is at least 25h
    assert start - (train.ts.max() + pd.Timedelta(hours=H)) >= pd.Timedelta(hours=25)
    assert (inner.ts + pd.Timedelta(hours=H) < val.ts.min()).all()
    assert test.ts.min() == start and test.ts.max() < end


def test_boundary_row_is_purged():
    d = frame()
    start = pd.Timestamp("2025-05-01", tz="UTC")
    train, *_ = purged_split(d, start, pd.Timestamp("2025-06-01", tz="UTC"), H, 30)
    last_allowed = start - pd.Timedelta(hours=H + 25)
    assert train.ts.max() == last_allowed - pd.Timedelta(hours=1)  # strict <
    assert not (train.ts == start - pd.Timedelta(hours=H)).any()
