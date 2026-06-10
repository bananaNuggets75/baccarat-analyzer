"""
Baccarat ML trainer — offline logistic regression
Usage:
    python train/train.py <path/to/csv> [output_dir]

Output:
    <output_dir>/model_weights.json   (default output_dir = ../public)

Feature vector (25 features, ORDER IS FIXED — must match model.ts exactly):
  [0]  penetration        fraction of 8-deck shoe dealt (cards_dealt / 416)
  [1]  hand_num           min(hand_index, 80)
  [2-11] comp_0..comp_9  fraction of remaining deck for each baccarat value
  [12] recent_banker_5    fraction banker in last 5 hands
  [13] recent_player_5    fraction player in last 5 hands
  [14] recent_tie_5       fraction tie in last 5 hands
  [15] recent_banker_10   fraction banker in last 10 hands
  [16] recent_player_10   fraction player in last 10 hands
  [17] recent_tie_10      fraction tie in last 10 hands
  [18] streak_dir         1=banker streak, -1=player streak, 0=tie/none
  [19] streak_len         consecutive same-outcome length, capped at 15
  [20] shoe_banker_rate   cumulative banker fraction this shoe
  [21] shoe_player_rate   cumulative player fraction this shoe
  [22] shoe_tie_rate      cumulative tie fraction this shoe
  [23] pair_rate          fraction of hands with at least one pair
  [24] natural_rate       fraction of hands that were naturals
"""

import sys
import json
import datetime
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import accuracy_score, classification_report

# ── Card value constants ──────────────────────────────────────────────────────
# Baccarat value: A=1, 2-9=face, 10/J/Q/K=0
BAC_VALUE = {
    'A': 1, '2': 2, '3': 3, '4': 4, '5': 5,
    '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 0, 'J': 0, 'Q': 0, 'K': 0,
}
# Starting count per bac-value in an 8-deck shoe (416 cards total)
# Value 0 = 10, J, Q, K → 4 ranks × 4 suits × 8 decks = 128
# Values 1-9 → 1 rank each × 4 suits × 8 decks = 32 each
INITIAL_COUNTS = {0: 128, 1: 32, 2: 32, 3: 32, 4: 32,
                  5: 32, 6: 32, 7: 32, 8: 32, 9: 32}
TOTAL_CARDS = 416


def bac_val(rank: str) -> int:
    return BAC_VALUE.get(rank, 0)


def parse_cards(card_str) -> list[int]:
    """Parse '7H KS 10C' → list of bac-values. Rank = all but last char."""
    if not card_str or pd.isna(card_str):
        return []
    values = []
    for token in str(card_str).strip().split():
        rank = token[:-1]   # strip suit char
        values.append(bac_val(rank))
    return values


# ── Feature extraction ────────────────────────────────────────────────────────

FEATURE_NAMES = [
    "penetration", "hand_num",
    "comp_0", "comp_1", "comp_2", "comp_3", "comp_4",
    "comp_5", "comp_6", "comp_7", "comp_8", "comp_9",
    "recent_banker_5", "recent_player_5", "recent_tie_5",
    "recent_banker_10", "recent_player_10", "recent_tie_10",
    "streak_dir", "streak_len",
    "shoe_banker_rate", "shoe_player_rate", "shoe_tie_rate",
    "pair_rate", "natural_rate",
]


def extract_shoe_features(shoe_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """
    For each hand in shoe_df (sorted by timestamp, same ShoeID):
      - features are computed from ALL PRIOR hands in that shoe
      - label is the outcome of this hand
    Returns (features_df, labels_series).
    """
    rows: list[dict] = []
    labels: list[str] = []

    dealt_counts = {v: 0 for v in range(10)}
    outcomes: list[str] = []
    pair_count = 0
    natural_count = 0

    for _, row in shoe_df.iterrows():
        hand_idx = len(outcomes)
        total_dealt = sum(dealt_counts.values())
        penetration = total_dealt / TOTAL_CARDS
        total_remaining = max(TOTAL_CARDS - total_dealt, 1)

        comp = {
            f"comp_{v}": max(INITIAL_COUNTS[v] - dealt_counts[v], 0) / total_remaining
            for v in range(10)
        }

        recent5 = outcomes[-5:] if outcomes else []
        recent10 = outcomes[-10:] if outcomes else []

        def frac(lst, val):
            return lst.count(val) / max(len(lst), 1)

        streak_dir = 0
        streak_len = 0
        if outcomes:
            last = outcomes[-1]
            streak_dir = 1 if last == 'banker' else (-1 if last == 'player' else 0)
            for o in reversed(outcomes):
                if o == last:
                    streak_len += 1
                else:
                    break
            streak_len = min(streak_len, 15)

        total_hands = max(hand_idx, 1)
        feat = {
            "penetration":      penetration,
            "hand_num":         min(hand_idx, 80),
            **comp,
            "recent_banker_5":  frac(recent5,  'banker'),
            "recent_player_5":  frac(recent5,  'player'),
            "recent_tie_5":     frac(recent5,  'tie'),
            "recent_banker_10": frac(recent10, 'banker'),
            "recent_player_10": frac(recent10, 'player'),
            "recent_tie_10":    frac(recent10, 'tie'),
            "streak_dir":       streak_dir,
            "streak_len":       streak_len,
            "shoe_banker_rate": outcomes.count('banker') / total_hands,
            "shoe_player_rate": outcomes.count('player') / total_hands,
            "shoe_tie_rate":    outcomes.count('tie')    / total_hands,
            "pair_rate":        pair_count               / total_hands,
            "natural_rate":     natural_count            / total_hands,
        }
        rows.append(feat)

        outcome = str(row['Winner']).lower()
        labels.append(outcome)

        # Update running state with this hand's result
        player_vals = parse_cards(row.get('PlayerCards', ''))
        banker_vals = parse_cards(row.get('BankerCards', ''))
        for v in player_vals + banker_vals:
            dealt_counts[v] = dealt_counts.get(v, 0) + 1

        outcomes.append(outcome)

        pp = str(row.get('PlayerPair', 'N')).strip().upper() == 'Y'
        bp = str(row.get('BankerPair', 'N')).strip().upper() == 'Y'
        if pp or bp:
            pair_count += 1
        if str(row.get('Natural', 'N')).strip().upper() == 'Y':
            natural_count += 1

    return pd.DataFrame(rows, columns=FEATURE_NAMES), pd.Series(labels, name='outcome')


# ── Main ──────────────────────────────────────────────────────────────────────

def main(csv_path: str, output_dir: str = '../public'):
    print(f"\n=== Baccarat ML Trainer ===")
    print(f"Input:  {csv_path}")

    df = pd.read_csv(csv_path)
    print(f"Rows:   {len(df)}")

    df['Timestamp'] = pd.to_datetime(df['Timestamp'])
    df = df.sort_values(['ShoeID', 'Timestamp']).reset_index(drop=True)

    unique_shoes = df['ShoeID'].unique()
    print(f"Shoes:  {len(unique_shoes)}")

    all_X: list[pd.DataFrame] = []
    all_y: list[str] = []
    all_groups: list[int] = []

    for shoe_id, shoe_df in df.groupby('ShoeID'):
        shoe_df = shoe_df.sort_values('Timestamp').reset_index(drop=True)
        if len(shoe_df) < 5:
            continue
        X_shoe, y_shoe = extract_shoe_features(shoe_df)
        all_X.append(X_shoe)
        all_y.extend(y_shoe.tolist())
        all_groups.extend([shoe_id] * len(X_shoe))

    X = pd.concat(all_X, ignore_index=True)
    y = pd.Series(all_y)
    groups = np.array(all_groups)

    print(f"\nSamples: {len(X)}")
    print("Label distribution:")
    vc = y.value_counts()
    for label, count in vc.items():
        print(f"  {label:8s}: {count:5d} ({count/len(y)*100:.1f}%)")

    # 80/20 split by shoe — prevents data leakage across shoe boundaries
    gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
    train_idx, test_idx = next(gss.split(X, y, groups=groups))

    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
    print(f"\nTrain: {len(X_train):5d} samples  |  Test: {len(X_test):5d} samples")

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s  = scaler.transform(X_test)

    print("\nTraining logistic regression...")
    model = LogisticRegression(
        solver='lbfgs',
        max_iter=2000,
        C=0.5,          # mild regularisation — baccarat has genuine noise
        random_state=42,
    )
    model.fit(X_train_s, y_train)

    y_pred = model.predict(X_test_s)
    acc = accuracy_score(y_test, y_pred)
    baseline = float((y_test == 'banker').mean())

    print(f"\nTest accuracy : {acc:.4f}  ({acc*100:.2f}%)")
    print(f"Baseline (always banker): {baseline:.4f}  ({baseline*100:.2f}%)")
    print(f"Lift over baseline: {(acc - baseline)*100:+.2f} pp")
    print("\nClassification report:")
    print(classification_report(y_test, y_pred, digits=4))

    # Feature importance (absolute coefficient magnitude)
    import_scores = np.abs(model.coef_).mean(axis=0)
    top5 = sorted(zip(FEATURE_NAMES, import_scores), key=lambda x: -x[1])[:5]
    print("Top 5 features by mean |coef|:")
    for name, score in top5:
        print(f"  {name:25s}: {score:.5f}")

    # Export weights
    weights = {
        "version": 1,
        "feature_names": FEATURE_NAMES,
        "classes": list(model.classes_),
        "coef": model.coef_.tolist(),
        "intercept": model.intercept_.tolist(),
        "scaler_mean": scaler.mean_.tolist(),
        "scaler_scale": scaler.scale_.tolist(),
        "metadata": {
            "accuracy": float(acc),
            "baseline_accuracy": baseline,
            "lift_pp": float((acc - baseline) * 100),
            "n_training_samples": int(len(X_train)),
            "n_test_samples": int(len(X_test)),
            "n_shoes": int(len(unique_shoes)),
            "trained_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        },
    }

    out_path = Path(output_dir) / "model_weights.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(weights, f, indent=2)

    print(f"\nWeights saved → {out_path}")
    print("Next: rebuild the extension with  npm run build")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python train/train.py <csv_path> [output_dir]")
        print("  output_dir defaults to ../public (relative to train/)")
        sys.exit(1)
    csv_file = sys.argv[1]
    out_dir  = sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).parent / '../public')
    main(csv_file, out_dir)
