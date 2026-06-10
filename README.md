# Baccarat Analyzer

A Chrome extension that sits alongside Evolution Gaming live baccarat tables. It intercepts the WebSocket stream, tracks the shoe in real time, runs road analysis, card counting, and an ML model trained on your own session data.

---

## What it does

- Intercepts Evolution Gaming WebSocket events and parses every dealt hand automatically
- Builds the standard roads: Bead Plate, Big Road, Big Eye Boy, Small Road, Cockroach Pig
- Tracks card composition of the remaining shoe rank by rank
- Runs a logistic regression model trained on your historical session data
- Blends the ML output with rule-based card counting, weighting the model more heavily as the shoe deepens
- Logs every hand to browser storage so you can retrain with accumulated data

---

## Can this beat the casino?

No. This is worth stating clearly.

Baccarat uses physical cards shuffled by a live dealer. The shuffle destroys all memory of previous hands. Road patterns (Big Road, streaks, derived roads) are visualization tools -- they have zero mathematical predictive power over shuffled cards. Every casino provides scoreboards for free because they know this.

The only signal with any mathematical basis is card composition. A shoe running low on 8s and 9s has a slightly different probability distribution for naturals. That effect is real but tiny -- roughly 0.1 to 0.5 percent at best, which does not overcome the 1.06 percent house edge on banker.

The ML model will find correlations in your data. With small datasets (under a few thousand hands) most of those correlations are noise that will not hold in live play. As your dataset grows, the noise features will weaken and the card composition signal will strengthen. Even then, the model is a better-informed bet guide, not a money printer.

---

## Setup

### Extension

```bash
npm install
npm run build
```

Load `dist/` as an unpacked extension in Chrome at `chrome://extensions`.

### ML model (optional, recommended)

```bash
pip install -r train/requirements.txt
```

Train on your session CSV:

```bash
python3 train/train.py baccarat-training-2026-06-10.csv
npm run build
```

If you have no model weights yet the extension falls back to rule-based card counting automatically.

---

## Retraining with accumulated data

The extension logs every hand automatically. After a session:

1. Open the extension, go to the Shoe tab
2. Click "All Data" -- this downloads a CSV of everything logged across all sessions
3. Retrain, passing all your CSVs together:

```bash
python3 train/train.py \
  baccarat-training-2026-06-10.csv \
  baccarat-training-2026-06-11.csv
npm run build
```

Duplicate hands are removed automatically by GameID. The more full shoes you accumulate (50 to 80 hands per shoe from a single table), the better the model calibrates. Short multi-table sessions where you hop between tables are much less useful than staying on one table for a full shoe.

---

## Training output

```
=== Baccarat ML Trainer ===
Rows:    838
Shoes:   242
Samples: 400
Train:   311  |  Test: 89

Test accuracy : 49.44%
Baseline (always banker): 48.31%
Lift over baseline: +1.12pp
```

The test set is a genuine holdout -- shoes are assigned entirely to train or test, never split across both. The accuracy shown is on hands the model never saw during training.

---

## How the prediction works

The extension combines three signals, in priority order:

1. Card count (when shoe penetration is above 25% and player edge exceeds banker edge)
2. ML model (blended in from hand 3 onward, weight grows with shoe depth, capped at 65%)
3. Road pattern signal from Big Road streak analysis
4. Default: banker (lowest base house edge)

The ML blend alpha is `min(0.65, penetration * 1.4 + 0.15)`, meaning the model earns trust gradually as it observes more of the shoe. Early hands rely mostly on the statistical baseline.

---

## Model features

The logistic regression uses 25 features computed from the shoe state before each hand:

- Shoe penetration and hand position
- Card composition by baccarat value (0 through 9) -- the fraction of each value remaining
- Recent outcome rates over the last 5 and 10 hands
- Current streak direction and length
- Cumulative banker, player, and tie rates for the shoe
- Pair and natural rates for the shoe

Feature extraction in Python (training) and TypeScript (inference) use identical logic. The scaler mean and scale from training are exported with the weights so inference matches exactly.

---

## Project structure

```
src/
  analysis/
    counting.ts      card counting and edge calculation
    model.ts         logistic regression inference
    prediction.ts    blends ML + count + pattern signals
    roads.ts         bead plate, big road, derived roads
    scoring.ts       hand scoring and natural detection
  background/
    index.ts         service worker, WebSocket dispatcher, model loader
  content/
    index.ts         sidebar injection, WS relay
  popup/
    App.tsx          tab shell
    components/      BetPanel, PredictionPanel, RoadsPanel, ShoePanel
  types/
    index.ts         shared types

train/
  train.py           offline training script
  requirements.txt   pandas, numpy, scikit-learn

public/
  manifest.json
  model_weights.json   generated by train.py, loaded by the extension at runtime
```

---

## Limitations

- Card composition features only work when Evolution sends actual card data (not synthetic shoe history). Hands loaded from shoe history on connect have empty card arrays, so the card count builds from zero until the first live hand.
- The model is a logistic regression. It is linear and cannot capture non-linear interactions. It is the right choice for this dataset size -- more complex models would overfit.
- 838 rows across 242 shoes is a small dataset. Most shoes in the current data are 1 to 4 hands long because the sessions involved jumping between many tables. Longer single-table sessions produce much more useful training data.
