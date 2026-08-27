# Silver HYROX Home Challenge — System, Data, Scientific & Analytical Manual

A mobile-friendly, browser-based fitness challenge for older adults and community fitness programmes. It uses the Google MediaPipe Pose Landmarker to automatically count repetitions across two 30-second seated exercise stations (Sit-to-Stand and Seated Row), then combines them into a single challenge score.

**An independent senior fitness challenge. Not affiliated with HYROX.**

> **Silver HYROX is a computer-vision-assisted fitness challenge / functional-performance application. It is not a medical diagnostic device.** All outputs are automated movement counts and derived indicators; they are intended for fitness, wellness, engagement, and educational use, not clinical diagnosis.

> **Quick access** — App: https://aaron-chen-angus.github.io/SilverHYROX/ · Live Results Sheet: https://docs.google.com/spreadsheets/d/1P-09DEozBacsb7OGXcxDaReKPsnWeIlWjnaUUzjlMvE/ (details in §2).

---

## 1. Silver HYROX Overview

### Purpose
Silver HYROX Home Challenge provides an engaging, low-equipment fitness challenge that automatically counts exercise repetitions using a phone/tablet/laptop camera and computer vision, removing the need for a person to manually count. It is designed for senior and community fitness contexts.

### Intended users
- Older adults and active-ageing programmes
- Community health and fitness-engagement initiatives
- Fitness screening and demonstration events
- Educational demonstrations of computer vision

An **operator** conducts the session while the **participant** performs the exercises; the camera is placed to view the participant from the side.

### Senior / community fitness context
The two stations are seated/chair-based movements chosen for accessibility. The Sit-to-Stand station is inspired by the widely used 30-second chair-stand construct (lower-body functional endurance); the Seated Row station is a custom upper-body functional-movement endurance task. See §14 for how these relate to (and differ from) validated protocols.

### Station 1 — 30-Second Sit-to-Stand
The participant sits on a chair (arms crossed per instructions), stands up, and returns to seated, repeatedly, for 30 seconds. Reps are counted automatically by tracking the vertical rise of the shoulder (and hip) landmarks from a calibrated seated baseline.

### Station 2 — 30-Second Seated Row
The participant reaches the hands forward and pulls them back toward the torso, repeatedly, for 30 seconds. Reps are counted automatically by tracking horizontal wrist displacement from a calibrated resting position. The implemented detector is intentionally lenient (no torso-lean or elbow-angle enforcement).

### Role of MediaPipe Pose Landmarker
The app loads MediaPipe Tasks-Vision **Pose Landmarker (lite, float16)** in the browser (`runningMode: 'VIDEO'`, single pose, GPU delegate). Each frame yields 33 body landmarks (normalized `x`, `y`, plus `z`, `visibility`). The app uses landmarks 11–28 (shoulders, elbows, wrists, hips, knees, ankles) and automatically selects the more visible body side ("dominant side") for measurement.

### Operator-controlled test start
Each station uses explicit operator control: a ~2-second calibration captures the baseline, a 3-second countdown runs, then a 30-second timer starts. The operator can stop early (recorded as a manual stop). The timer auto-stops at 30 seconds.

### Automatic repetition counting
Each station runs a small state machine with temporal persistence to avoid jitter-based miscounts:
- **Sit-to-Stand:** `SEATED → STANDING → SEATED` = 1 rep (persistence 200 ms).
- **Seated Row:** `READY → FORWARD → READY` = 1 rep (persistence 120 ms).

### Test duration
Both stations are fixed at 30 seconds (`durationSeconds: 30`).

### Station progression
Participant setup → Sit-to-Stand (calibrate → countdown → 30 s) → Seated Row (calibrate → countdown → 30 s) → combined results → optional save.

### Final combined score
`totalScore = sitToStand.reps + seatedRow.reps` (sum of repetition counts across both stations).

### Subsidiary metrics generated
Per station: elapsed time, average rep time, fastest rep, slowest rep, and a consistency rating (coefficient-of-variation band). Seated Row additionally computes average reach (normalized to torso length). A non-clinical "fitness profile" (Lower-Body / Upper-Body / Consistency bands) is computed for display but is not exported (see §4/§7).

### Local storage and Google Sheets data collection
Every saved result is written to browser `localStorage` (key `silverHyrox_results`). If a webhook URL is configured (it is, by default), a flattened result is also POSTed to a Google Apps Script Web App that appends a row to the Live Results Google Sheet.

### Application limitations
Measurements are camera-based estimates dependent on camera angle, lighting, occlusion, chair placement, and device performance. The Seated Row detector counts hand movement without form enforcement. The combined score is an application-specific challenge score, not a validated clinical scale. See §14–§16.

---

## 2. Application and Data Access

**Application URL**
https://aaron-chen-angus.github.io/SilverHYROX/

**Live Results Dataset (Google Sheet)**
https://docs.google.com/spreadsheets/d/1P-09DEozBacsb7OGXcxDaReKPsnWeIlWjnaUUzjlMvE/

The Live Results Google Sheet contains challenge results submitted from the deployed application. When a result is saved, the app POSTs a flattened result object to a Google Apps Script Web App, which appends one row to the sheet.

**Submission is configurable, not mandatory.** Export is controlled by `CONFIG.googleSheetsWebhookUrl` in `config.js`. In the committed configuration this URL is populated, so saved results are auto-submitted in addition to being stored locally. If the value is empty (`''`), the app uses local storage only. The POST uses `fetch(..., { mode: 'no-cors' })`, so the browser cannot read the response — the app cannot confirm the write succeeded from the client side.

---

## 3. System and Data Pipeline

```
Participant
   │  (performs Sit-to-Stand / Seated Row in front of a side-on camera)
   ▼
Mobile / Web Camera ─────────── getUserMedia() (rear camera, portrait ideal) — on-device
   │  (raw frames, never stored/uploaded)
   ▼
MediaPipe Pose Landmarker ───── loaded from CDN, runs on-device (GPU/WASM)
   │  (33 landmarks/frame; x,y,z,visibility, normalized)
   ▼
Landmark Processing ─────────── pose-engine.js
   │  (5-frame moving-average smoothing; dominant-side selection; skeleton overlay)
   ▼
Exercise State Detection ────── sit-to-stand.js / seated-row.js
   │  (calibration baseline; state machine + temporal persistence)
   ▼
Repetition Counting ─────────── per-station rep events + per-rep timings
   ▼
Metric Calculation ──────────── getResults(): reps, elapsed, avg/fastest/slowest rep,
   │                              consistency (CV band), avgReach (row only)
   ▼
Station Results ─────────────── sitToStand{...}, seatedRow{...}
   ▼
Combined Results Object ─────── results.js buildSessionResult() (nested: participant + stations + totalScore + timestamp)
   │
   ├──► Local Storage (localStorage key: silverHyrox_results)        [always, on save]
   │
   └──► Google Apps Script Web App (flattened, fetch POST, no-cors)  [if webhook configured]
              │
              ▼
        Google Sheet (Live Results Dataset)
              │
              ▼
        Statistical Analysis / R / R Shiny (CSV/gviz or googlesheets4)
```

### Where each stage occurs
Camera capture, MediaPipe inference, smoothing, side selection, state detection, rep counting, metric calculation, scoring, and local storage all run **in the browser on the participant's device**. Only the flattened numeric result (never video/images) leaves the device, and only if a webhook is configured.

### Data classification

| Category | Fields |
|----------|--------|
| **User-entered** | `nickname`, `gender`, `age` (participant setup) |
| **Automatically generated metadata** | `timestamp`, `completed`/`manualStop` flags |
| **CV-derived (per-frame, from MediaPipe)** | shoulder/hip Y (sit-to-stand), wrist X and torso length (seated row), dominant side |
| **Station-specific calculated variables** | `reps`, `elapsedTime`, `averageRepTime`, `fastestRep`, `slowestRep`, `consistency`, `averageReach` (row) |
| **Final derived performance score** | `totalScore = stsReps + rowReps` |
| **Google Sheets exported fields** | 18 flattened fields (see §4) |

---

## 4. Comprehensive Data Dictionary

Two related structures exist in the code:

1. **The stored session object** (`buildSessionResult()` in `results.js`) — a nested object saved to `localStorage` and passed into the export function.
2. **The Google Sheets payload** (`flat` object in `sendToGoogleSheets()`) — a flattened 18-field object actually POSTed to the sheet.

Numeric station metrics are produced by `getResults()` as **strings** via `.toFixed()` (e.g. `elapsedTime.toFixed(1)`, times `.toFixed(2)`, reach `.toFixed(2)`); `reps` and `totalScore` are true integers; `age` is user-entered. Landmark coordinates are normalized (0–1) with `y` increasing downward.

### 4a. Google Sheets export payload (the 18 exported fields)

| Field Name | Data Type | Unit / Format | Description | Source / Calculation |
|------------|-----------|---------------|-------------|----------------------|
| `timestamp` | DateTime | ISO 8601 string | When the result object was built | `new Date().toISOString()` |
| `nickname` | String | free text | Participant nickname/ID | User-entered (setup) |
| `gender` | Categorical | e.g. male/female/other (as entered) | Participant gender | User-entered |
| `age` | Integer | years | Participant age | User-entered |
| `totalScore` | Integer | reps (count) | Combined challenge score | `sitToStand.reps + seatedRow.reps` |
| `stsReps` | Integer | reps (count) | Sit-to-Stand repetitions | Rep counter (STANDING→SEATED transitions); `0` if station missing |
| `stsElapsed` | Numeric (string) | seconds (1 dp) | Sit-to-Stand elapsed time | `testElapsed/1000` → `.toFixed(1)`; `''` if missing |
| `stsAvgRepTime` | Numeric (string) | seconds (2 dp) | Mean time per Sit-to-Stand rep | mean of per-rep durations → `.toFixed(2)`; `''` if missing |
| `stsFastestRep` | Numeric (string) | seconds (2 dp) | Fastest Sit-to-Stand rep | `min(repTimes)/1000` → `.toFixed(2)` |
| `stsSlowestRep` | Numeric (string) | seconds (2 dp) | Slowest Sit-to-Stand rep | `max(repTimes)/1000` → `.toFixed(2)` |
| `stsConsistency` | Categorical | Excellent / Good / Variable / N/A | Sit-to-Stand rep-time consistency band | CV of rep times (see §5); `N/A` if < 3 reps |
| `rowReps` | Integer | reps (count) | Seated Row repetitions | Rep counter (FORWARD→READY transitions); `0` if station missing |
| `rowElapsed` | Numeric (string) | seconds (1 dp) | Seated Row elapsed time | `testElapsed/1000` → `.toFixed(1)`; `''` if missing |
| `rowAvgRepTime` | Numeric (string) | seconds (2 dp) | Mean time per Seated Row rep | mean of per-rep durations → `.toFixed(2)` |
| `rowFastestRep` | Numeric (string) | seconds (2 dp) | Fastest Seated Row rep | `min(repTimes)/1000` → `.toFixed(2)` |
| `rowSlowestRep` | Numeric (string) | seconds (2 dp) | Slowest Seated Row rep | `max(repTimes)/1000` → `.toFixed(2)` |
| `rowConsistency` | Categorical | Excellent / Good / Variable / N/A | Seated Row rep-time consistency band | CV of rep times (see §6); `N/A` if < 3 reps |
| `rowAvgReach` | Numeric (string) | normalized ratio (2 dp) | Mean max forward reach per rep | mean of per-rep max wrist displacement ÷ torso length → `.toFixed(2)` |

**Total exported fields: 18.**

> Export note: any missing station falls back to `0` (reps/totalScore contribution) or `''` (string metrics) via `result.sitToStand?.reps || 0` etc. Empty strings will appear as blank cells in the sheet.

### 4b. Fields present in the stored object but NOT in the export payload

| Field (path) | Type | Notes |
|--------------|------|-------|
| `sitToStand.completed` | Boolean | Always `true` in `getResults()`; not exported |
| `seatedRow.completed` | Boolean | Always `true` in `getResults()`; not exported |
| `sitToStand.manualStop` / `seatedRow.manualStop` | Boolean | Computed in `getResults()` (`testElapsed < testDuration`) but **not included** in the stored `buildSessionResult` object and **not exported** |

### 4c. Fields computed internally but never stored or exported

| Value | Where | Notes |
|-------|-------|-------|
| Fitness profile (`lowerBody`, `upperBody`, `consistency` bands) | `ResultsManager.getFitnessProfile()` | Display-only, application-generated, non-clinical (thresholds in §7) |
| Per-rep time arrays (`repTimes`) | station objects | Basis for avg/fastest/slowest/consistency; not persisted |
| Per-rep reach array (`reachDistances`) | seated-row | Basis for `averageReach`; not persisted |
| Dominant side (`left`/`right`) | pose-engine | Used for measurement; not stored |
| Debug data (`debugData`) | stations | Live debug overlay only |

### Data Dictionary Validation
- The dictionary in §4a has been checked field-by-field against the actual Google Sheets payload: `sendToGoogleSheets()` builds the `flat` object with exactly these 18 keys and sends `JSON.stringify(flat)`. No other fields are transmitted.
- **Variables calculated but not exported:** the fitness profile bands, `manualStop`, `completed`, and all per-rep arrays (see §4b/§4c).
- **Variables exported but not otherwise surfaced in the UI/history in detail:** `stsFastestRep`, `stsSlowestRep`, `rowFastestRep`, `rowSlowestRep`, and `rowAvgReach` are exported to the sheet and warrant interpretation notes (see §5/§6).
- **Field-name mismatches between payload and Google Sheet headers:** The Apps Script (§18) uses `sheet.appendRow([...])` mapping values **by explicit key** (`data.timestamp`, `data.nickname`, …) in a fixed column order, matching the header list in Row 1. It does **not** map by header text. Therefore column order in the sheet must match the Apps Script array order; the payload keys and the documented headers are consistent (18 fields, same names/order). If headers in Row 1 are reordered without editing the script, labels and values will misalign.

---

## 5. Sit-to-Stand Detection and Metrics

### MediaPipe landmarks used
The station uses the **dominant-side** `shoulder` (11 or 12) and `hip` (23 or 24) only, via `poseEngine.getSideLandmarks()`. It tracks the **vertical (Y)** positions of these two points.

> **Important implementation note:** although `config.js` defines knee-angle thresholds (`seatedKneeAngleMin` 60, `seatedKneeAngleMax` 110, `standingKneeAngleMin` 120), a torso-angle threshold (`standingTorsoAngleMax` 30), and an arms-crossed threshold (`armsCrossedThreshold` 0.3), **the implemented `sit-to-stand.js` does not use knee angle, torso angle, or arms-crossed monitoring.** Detection is based purely on shoulder/hip vertical rise. `PoseUtils.calculateAngle()` exists but is not wired into rep detection. These unused config values are documented here to avoid misreading the code.

### Calibration (seated baseline)
On calibration, ~30 frames (~2 s; `calibrationDurationMs` 2000) of dominant-side `shoulder.y` and `hip.y` are averaged into `baseline.shoulderY` and `baseline.hipY`. State is set to `SEATED`.

### State criteria (state machine)
Screen coords: `y = 0` top, `y = 1` bottom, so standing lowers `y` (a *rise*).
- `torsoLength = |baseline.hipY − baseline.shoulderY|`
- `riseThreshold = torsoLength × hipRiseThreshold` (`hipRiseThreshold` = 0.15)
- `shoulderRise = baseline.shoulderY − shoulderY`; `hipRise = baseline.hipY − hipY`
- **Seated → Standing** when `shoulderRise > riseThreshold` **and** `hipRise > riseThreshold × 0.5`
- **Standing → Seated** when `shoulderRise < riseThreshold × 0.4`
- **Rep completion:** a rep is counted on the confirmed **STANDING → SEATED** transition (i.e. one full stand-and-sit cycle).
- **Lowering-state:** there is no separate "lowering" state; the return to `SEATED` (drop below `0.4 × riseThreshold`) represents lowering.

### Temporal smoothing / state persistence
Landmarks are moving-average smoothed over 5 frames (pose-engine). A candidate state change must persist ≥ `statePersistenceMs` (200 ms) before it is applied, preventing jitter-based false reps.

### 30-second timer & operator start/stop
`startTest()` records `testStartTime`; each frame updates `testElapsed`; at `testElapsed ≥ 30000 ms` the test auto-stops. `stopTest()` can be called earlier by the operator (early stops set the internal `manualStop` flag, not exported).

### Incomplete-movement handling
Partial rises that never cross the threshold, or that revert before persistence elapses, are not counted. If pose tracking is lost, frames without valid dominant-side shoulder/hip are skipped (no counting) while the timer continues.

### Sit-to-Stand metrics

| Metric | Purpose | Method | Unit | Interpretation | Limitations |
|--------|---------|--------|------|----------------|-------------|
| `reps` (`stsReps`) | Lower-body functional endurance | Count of STANDING→SEATED cycles in 30 s | count | More = greater repeated stand capacity | Depends on threshold/camera; no depth/knee-angle validation |
| `elapsedTime` (`stsElapsed`) | Test duration actually run | `testElapsed/1000` | s | ~30 unless stopped early | Early stop shortens it |
| `averageRepTime` (`stsAvgRepTime`) | Movement tempo | mean(repTimes)/1000 | s | Lower = faster cadence | Includes both stand and sit phases combined per cycle |
| `fastestRep` (`stsFastestRep`) | Best single cycle time | min(repTimes)/1000 | s | Lower = quickest cycle | Sensitive to a single fast cycle |
| `slowestRep` (`stsSlowestRep`) | Worst single cycle time | max(repTimes)/1000 | s | Higher = slowest cycle | Sensitive to pauses |
| `consistency` (`stsConsistency`) | Tempo variability band | `cv = SD/mean` of repTimes; Excellent < 0.15, Good < 0.30, else Variable; `N/A` if < 3 reps | categorical | More consistent tempo = better control | Uses population SD (÷n, not n−1); needs ≥ 3 reps |

---

## 6. Seated Row Detection and Metrics

### MediaPipe landmarks used
The station uses the **dominant-side** `wrist` (15 or 16) horizontal position (X), plus `shoulder` and `hip` (during calibration) to estimate torso length. `elbow` is available via `getSideLandmarks()` but **is not used** in the implemented detector.

> **Implementation note:** the Seated Row detector is intentionally simple and lenient. It does **not** compute elbow angle, wrist-to-shoulder/hip distance, torso lean, or arm symmetry. There is **no** separate primary-arm selection beyond the pose engine's global dominant-side choice, and **no** explicit one-arm occlusion handling other than skipping frames with no valid wrist. Rep detection is based solely on horizontal wrist displacement magnitude.

### Calibration (resting baseline)
~30 frames (~2 s; `calibrationDurationMs` 2000) capture dominant-side `wrist.x` and `torsoLength = |hip.y − shoulder.y|`, averaged into `baseline.wristX` and `baseline.torsoLength`. State is set to `READY`.

### Displacement, forward-reach, and return detection
- `displacement = |wristX − baseline.wristX|` (absolute; direction-agnostic)
- `normalizedDisplacement = displacement / (baseline.torsoLength || 0.25)`
- **Forward threshold** `forwardReachTorsoRatio` = 0.12 (12% of torso length)
- **Return threshold** `returnTolerance` = 0.08 (within 8% of baseline)

### State criteria (state machine)
- **Ready → Forward** when `normalizedDisplacement ≥ 0.12`; begins tracking `maxReachThisRep`.
- **Forward (tracking):** updates `maxReachThisRep` to the largest `normalizedDisplacement` seen.
- **Forward → Ready** when `normalizedDisplacement ≤ 0.08`.
- **Rep completion:** counted on the confirmed **FORWARD → READY** transition; the rep's `maxReachThisRep` is appended to `reachDistances`.

### Temporal smoothing / state persistence
5-frame moving-average smoothing (pose-engine); a state change must persist ≥ `statePersistenceMs` (120 ms — shorter than Sit-to-Stand for responsiveness).

### 30-second timer & operator start/stop
Identical structure to Sit-to-Stand: auto-stop at 30 s; operator may stop early (internal `manualStop` flag, not exported).

### Seated Row metrics

| Metric | Purpose | Method | Unit | Interpretation | Limitations |
|--------|---------|--------|------|----------------|-------------|
| `reps` (`rowReps`) | Upper-body movement endurance | Count of FORWARD→READY cycles in 30 s | count | More = more row-like cycles | Counts any hand movement ≥ 12% torso and back; no form enforcement |
| `elapsedTime` (`rowElapsed`) | Test duration actually run | `testElapsed/1000` | s | ~30 unless stopped early | Early stop shortens it |
| `averageRepTime` (`rowAvgRepTime`) | Movement tempo | mean(repTimes)/1000 | s | Lower = faster cadence | Whole forward+return cycle |
| `fastestRep` (`rowFastestRep`) | Best single cycle time | min(repTimes)/1000 | s | Lower = quickest cycle | Single-cycle sensitivity |
| `slowestRep` (`rowSlowestRep`) | Worst single cycle time | max(repTimes)/1000 | s | Higher = slowest cycle | Sensitive to pauses |
| `consistency` (`rowConsistency`) | Tempo variability band | Same CV bands as §5; `N/A` if < 3 reps | categorical | Consistent tempo = smoother pacing | Population SD; needs ≥ 3 reps |
| `averageReach` (`rowAvgReach`) | Typical forward-reach amplitude | mean of per-rep `maxReachThisRep` | normalized ratio (× torso length) | Higher = larger hand excursion | Horizontal-only; camera-angle dependent; not a physical distance |

---

## 7. Final Scoring and Performance Metrics

### Combined challenge score
```
totalScore = sitToStand.reps + seatedRow.reps
```
(`buildSessionResult()` in `results.js`; missing station contributes 0.) This is an **application-specific challenge score** — a simple sum of two repetition counts on different movements/scales. It is **not** a validated clinical scale (see §14).

### Subsidiary metrics
Per station: `elapsedTime`, `averageRepTime`, `fastestRep`, `slowestRep`, `consistency`, and (Seated Row) `averageReach`. All are exported (§4a) except the internal per-rep arrays.

### Application-generated fitness profile (display-only, NOT exported, NOT clinical)
`ResultsManager.getFitnessProfile()` derives three descriptive bands. These thresholds are engineering defaults with **no clinical validation** and are not written to the sheet:

| Profile field | Bands (from code) |
|---------------|-------------------|
| `lowerBody` | `stsReps ≥ 14` → Strong; `≥ 10` → Good; else Developing |
| `upperBody` | `rowReps ≥ 22` → Strong; `≥ 16` → Good; else Developing |
| `consistency` | both stations `Excellent` → Strong; neither `Variable` → Good; else Developing |

### Age comparison / normative values / leaderboard
`config.js` contains an `ageBands` structure that is **empty by design** (`sitToStand: []`, `seatedRow: []`) with an explicit code comment: *do NOT fabricate normative values*. Therefore the app performs **no age-normative comparison** and stores **no leaderboard value**. Any leaderboard/age comparison would be a future downstream (e.g. R Shiny) feature, not part of the current app.

> **No clinical validation is claimed.** The `totalScore`, consistency bands, and fitness-profile labels are application-generated indicators only.

---

## 8. Statistical Analysis Opportunities

All suggestions use only the 18 exported fields (§4a). Note the exported time/consistency/reach values arrive as **strings** and must be coerced to numeric in analysis; `consistency` fields are categorical; `reach` is a normalized ratio (not a physical distance).

### 8.1 Descriptive Statistics

| Analysis | Field(s) |
|----------|----------|
| Number of participants / sessions | row count (`timestamp`) |
| Age distribution | `age` |
| Gender distribution | `gender` |
| Mean / median Sit-to-Stand reps | `stsReps` |
| SD / IQR / min / max of STS reps | `stsReps` |
| Mean / median Seated Row reps | `rowReps` |
| Total-score distribution | `totalScore` |
| Mean rep time (per station) | `stsAvgRepTime`, `rowAvgRepTime` |
| Fastest / slowest rep | `stsFastestRep`, `stsSlowestRep`, `rowFastestRep`, `rowSlowestRep` |
| Consistency-band frequencies | `stsConsistency`, `rowConsistency` |
| Reach distribution | `rowAvgReach` |

Report central tendency and spread for continuous fields; frequencies/proportions for `gender` and the two consistency fields.

### 8.2 Group Comparisons
Available grouping variables: `gender`, age groups derived from `age`, consistency bands.

| Comparison | Outcome | Suggested test |
|------------|---------|----------------|
| STS reps by age group | `stsReps` | One-way ANOVA (if normal) or Kruskal–Wallis |
| Row reps by age group | `rowReps` | ANOVA / Kruskal–Wallis |
| Total score by age group | `totalScore` | ANOVA / Kruskal–Wallis |
| Male vs female (any rep/score) | `stsReps`/`rowReps`/`totalScore` | Independent t-test or Mann–Whitney U |
| Consistency band × gender | `stsConsistency`, `gender` | Chi-square test of association |

Use t-test/ANOVA when normality and roughly equal variances hold (rep counts are often skewed/discrete, so verify); otherwise Mann–Whitney U / Kruskal–Wallis. Use chi-square for two categorical variables (expected counts ≥ 5).

### 8.3 Within-Participant Station Comparison
`stsReps` and `rowReps` are on **different scales/difficulty** (see §14/§15) and should **not** be compared as raw values. Appropriate approaches:
- **Standardize first** (z-scores within each station across the sample), then compare standardized station performance within a participant.
- Examine each **station's contribution to `totalScore`** (`stsReps/totalScore`, `rowReps/totalScore`).
- Only use paired tests on comparable, standardized metrics — not raw STS vs row counts.

### 8.4 Correlation and Association Analysis

| Relationship | Fields | Method |
|--------------|--------|--------|
| Age vs STS reps | `age`, `stsReps` | Pearson (if linear/normal) or Spearman |
| Age vs Row reps | `age`, `rowReps` | Spearman (counts often non-normal) |
| Age vs total score | `age`, `totalScore` | Pearson/Spearman |
| STS reps vs Row reps | `stsReps`, `rowReps` | Spearman |
| Total score vs consistency | `totalScore`, `stsConsistency`/`rowConsistency` | Rank-based / Kruskal–Wallis (consistency is categorical) |
| Reach vs Row reps | `rowAvgReach`, `rowReps` | Pearson/Spearman |
| Avg rep time vs reps | `stsAvgRepTime`↔`stsReps` (and row) | Spearman (mechanically related — interpret cautiously) |

Use Pearson when both variables are continuous, linear, and normal; Spearman otherwise. **Correlation ≠ causation.** Note `averageRepTime` and `reps` are mechanically linked within a fixed 30 s window.

### 8.5 Regression Analysis
With adequate sample size (≈ 10–15 observations per predictor):
- **Linear / multiple linear regression** for continuous outcomes, e.g.
  `totalScore ~ age + gender` or `stsReps ~ age + gender + stsAvgRepTime`.
- Consider **Poisson/negative-binomial** models since `reps`/`totalScore` are counts (a "generalized model only where justified"). Use only real exported fields as predictors.
- Avoid using `averageRepTime` and `reps` together as independent predictors of each other (mechanical dependence).

### 8.6 Repeated Measures / Longitudinal Analysis
The app has **no persistent participant ID** — only a free-text `nickname` plus `timestamp`. If (and only if) nicknames are reliably unique and reused, repeated sessions can be linked to suggest:
- **Change scores / percent change** between sessions (e.g. Δ`totalScore`).
- **Paired t-test / Wilcoxon signed-rank** across two sessions.
- **Repeated-measures ANOVA** or **linear mixed-effects models** (random intercept per nickname) for ≥ 3 sessions.

Assumptions/minimums: reliable participant linkage, sufficient repeats per person, and awareness that nickname collisions/typos undermine linkage (see §16). Without a robust ID, treat sessions as independent.

### 8.7 Reliability / Consistency Analysis
- **Coefficient of variation** of rep times is already computed per station (banded into `consistency`); the raw per-rep arrays are **not exported**, so external CV must be recomputed only if those arrays are added to the export.
- **Within-session rep variability** can be approximated from exported `fastest`/`slowest`/`average` rep times (range and spread), acknowledging this is coarse.
- **ICC** requires repeated measurements under a defined design and reliable participant linkage; do not report ICC unless both are satisfied. Do not fabricate reliability claims.

### 8.8 Data Quality and Assumption Checking
Check for: missing data (blank exported strings when a station is absent), invalid ages (out of plausible range), duplicate submissions (same `nickname` + near-identical `timestamp`), manually stopped sessions (elapsed < 30 s — see §15/§16), incomplete stations (`reps = 0` and/or blank metrics), tracking loss (implausibly low reps), outliers/implausibly high rep counts, distribution shape and normality (Shapiro–Wilk/Q–Q), heteroscedasticity, small sample sizes, multiple-testing inflation (Bonferroni/BH), and non-independence from repeated nicknames (use mixed models).

---

## 9. Recommended Data Visualisations

All use real exported field names (§4a). Coerce string metrics to numeric first.

| Visualisation | Variables / Fields | Chart Type | Purpose / Interpretation |
|---------------|--------------------|------------|--------------------------|
| Participant age distribution | `age` | Histogram | Sample composition |
| Sit-to-Stand reps distribution | `stsReps` | Histogram / bar | Spread of lower-body endurance |
| Seated Row reps distribution | `rowReps` | Histogram / bar | Spread of upper-body endurance |
| Total-score distribution | `totalScore` | Histogram | Distribution of combined challenge score |
| STS vs Row reps | `stsReps` (x), `rowReps` (y) | Scatter (optional colour by `gender`) | Relationship between stations |
| Total score by age group | age group (from `age`), `totalScore` | Boxplot | How score varies with age |
| Station performance by gender | `gender`, `stsReps`/`rowReps` | Grouped boxplot/bar | Sex differences in each station |
| Rep-time consistency | `stsConsistency`/`rowConsistency` | Bar (counts) | Frequency of Excellent/Good/Variable |
| Avg rep time distribution | `stsAvgRepTime`, `rowAvgRepTime` | Histogram | Tempo distribution per station |
| Fastest/slowest rep spread | `*FastestRep`, `*SlowestRep` | Boxplot / dumbbell | Within-participant tempo range |
| Reach distribution | `rowAvgReach` | Histogram | Row amplitude spread |
| Age vs total score | `age` (x), `totalScore` (y) | Scatter + trend line | Association of age and performance |
| Reach vs Row reps | `rowAvgReach` (x), `rowReps` (y) | Scatter | Does larger reach relate to more reps? |
| Participant-level station profile | one nickname's metrics | Small-multiples / radar | Individual snapshot |
| Leaderboard | `nickname`, `totalScore` | Ranked bar / table | Engagement ranking (top scores) |
| Repeated assessment / score over time | `timestamp` (x), `totalScore` (y), group by `nickname` | Line chart | Change across sessions (if IDs reliable) |

For scatterplots: **x** = explanatory field, **y** = outcome (`totalScore`/`reps`); optional grouping by `gender` or age group (colour). Grouped boxplots put the categorical field on x and the continuous outcome on y.

### Future R Shiny dashboard (recommendation)
The visualisations above map naturally onto the dashboard tabs proposed in §12. All are **recommendations for future analytics development**, not current app features.

---

## 10. Direct Integration with R

Live Sheet ID:
```
1P-09DEozBacsb7OGXcxDaReKPsnWeIlWjnaUUzjlMvE
```

### Method A: Google Sheets CSV / GViz (public sheet)

```r
library(readr)

silver_data <- read_csv(
  "https://docs.google.com/spreadsheets/d/1P-09DEozBacsb7OGXcxDaReKPsnWeIlWjnaUUzjlMvE/gviz/tq?tqx=out:csv"
)

head(silver_data)
str(silver_data)
summary(silver_data)
```

Works when the sheet is shared as "Anyone with the link can view".

### Method B: googlesheets4

```r
library(googlesheets4)

gs4_deauth()   # public sheet — no login needed

silver_data <- read_sheet(
  "https://docs.google.com/spreadsheets/d/1P-09DEozBacsb7OGXcxDaReKPsnWeIlWjnaUUzjlMvE/"
)
```

**Authentication:** If the sheet is private, remove `gs4_deauth()` and use `gs4_auth()` (OAuth) or a service-account token (`gs4_auth(path = "service-account.json")`), sharing the sheet with that account.

> R column names will match the sheet Row-1 headers, which should equal the 18 exported field names: `timestamp`, `nickname`, `gender`, `age`, `totalScore`, `stsReps`, `stsElapsed`, `stsAvgRepTime`, `stsFastestRep`, `stsSlowestRep`, `stsConsistency`, `rowReps`, `rowElapsed`, `rowAvgRepTime`, `rowFastestRep`, `rowSlowestRep`, `rowConsistency`, `rowAvgReach`. Several are text and need `as.numeric()`.

---

## 11. R Shiny Integration

GitHub does **not** need to be an intermediate data repository. Recommended pipeline:

```
Silver HYROX → Google Sheets → R Shiny → Data Cleaning → Statistical Analysis → Interactive Visualisations
```

### Live-refresh data source

```r
silver_data <- reactive({
  invalidateLater(60000, session)   # refresh every 60 s
  readr::read_csv(
    "https://docs.google.com/spreadsheets/d/1P-09DEozBacsb7OGXcxDaReKPsnWeIlWjnaUUzjlMvE/gviz/tq?tqx=out:csv",
    show_col_types = FALSE
  )
})
```

### Example ggplot2 outputs (real field names)

```r
library(ggplot2)

# Age vs total score
output$scorePlot <- renderPlot({
  df <- silver_data()
  ggplot(df, aes(x = age, y = totalScore)) +
    geom_point() +
    geom_smooth(method = "lm") +
    labs(x = "Age (years)", y = "Total score (STS + Row reps)")
})

# Sit-to-Stand vs Seated Row reps
output$stationPlot <- renderPlot({
  df <- silver_data()
  ggplot(df, aes(x = stsReps, y = rowReps, colour = gender)) +
    geom_point()
})

# Total score by gender
output$genderPlot <- renderPlot({
  df <- silver_data()
  ggplot(df, aes(x = gender, y = totalScore)) + geom_boxplot()
})
```

**Roles:** Use **GitHub** for source control, app code, R Shiny code, and documentation; use **Google Sheets** as the live data source read directly by Shiny at runtime.

---

## 12. Suggested R Shiny Dashboard Architecture

> Conceptual design for **future analytics development**, built on the 18 exported fields. Not part of the current Silver HYROX app.

**TAB 1 — Overview**
- Total participants/sessions (`timestamp` count)
- Mean total score (`totalScore`)
- Mean Sit-to-Stand reps (`stsReps`), mean Seated Row reps (`rowReps`)
- Key distributions (`totalScore`, `age`)

**TAB 2 — Station Performance**
- Sit-to-Stand analysis (`stsReps`, `stsAvgRepTime`, `stsConsistency`)
- Seated Row analysis (`rowReps`, `rowAvgRepTime`, `rowConsistency`, `rowAvgReach`)
- Station comparisons (standardized — see §8.3)

**TAB 3 — Participant Profile**
- Select `nickname`
- Station metrics + combined score
- Repeated sessions over `timestamp` (if IDs reliable)

**TAB 4 — Movement Quality**
- Rep consistency (`stsConsistency`, `rowConsistency`)
- Rep-time spread (`*FastestRep`, `*SlowestRep`, `*AvgRepTime`)
- Reach (`rowAvgReach`)
- (Standing-extension / torso-lean / symmetry are **not** available in the data — see §5/§6)

**TAB 5 — Population Analysis**
- Age-group comparisons, gender comparisons, distributions

**TAB 6 — Statistical Analysis**
- Descriptive statistics, correlations, selected group comparisons (§8)

**TAB 7 — Live Data Explorer**
- Interactive, filterable table of the live Google Sheet (all 18 fields)

---

## 13. Key Scientific References Supporting Silver HYROX

Peer-reviewed journal articles, APA 7th edition, each verified against its source. Descriptions were rephrased for compliance with licensing restrictions. These references support the **underlying constructs and assessment approaches**; they do **not** validate the Silver HYROX application itself (see §14).

### 30-Second Chair Stand / Sit-to-Stand
- Jones, C. J., Rikli, R. E., & Beam, W. C. (1999). A 30-s chair-stand test as a measure of lower body strength in community-residing older adults. *Research Quarterly for Exercise and Sport, 70*(2), 113–119. https://doi.org/10.1080/02701367.1999.10608028
  *Relevance:* The originating validation of the 30-second chair-stand as a lower-body strength/endurance measure — the construct the Sit-to-Stand station is based on.
### Functional Fitness in Older Adults
- Rikli, R. E., & Jones, C. J. (1999). Development and validation of a functional fitness test for community-residing older adults. *Journal of Aging and Physical Activity, 7*(2), 129–161. https://doi.org/10.1123/japa.7.2.129
  *Relevance:* Defines and validates the Senior Fitness Test battery (including chair stand), grounding the app's functional-fitness framing.
- Rikli, R. E., & Jones, C. J. (2013). Development and validation of criterion-referenced clinically relevant fitness standards for maintaining physical independence in later years. *The Gerontologist, 53*(2), 255–267. https://doi.org/10.1093/geront/gns071
  *Relevance:* Provides criterion-referenced standards linking functional-fitness performance to physical independence — context for interpreting older-adult performance (note: not directly applied as thresholds in the app; §14).

### Lower-Limb Functional Strength and Mobility
- Bohannon, R. W. (2015). Muscle strength: Clinical and prognostic value of hand-grip dynamometry. *Current Opinion in Clinical Nutrition and Metabolic Care, 18*(5), 465–470. https://doi.org/10.1097/MCO.0000000000000202
  *Relevance:* Situates simple strength/functional measures within prognostic assessment of older adults, supporting the value of accessible functional tests.

### Upper-Body / Functional Movement Endurance
- Rikli, R. E., & Jones, C. J. (1999). Functional fitness normative scores for community-residing older adults, ages 60–94. *Journal of Aging and Physical Activity, 7*(2), 162–181. https://doi.org/10.1123/japa.7.2.162
  *Relevance:* Establishes normative functional-fitness scores (including upper-body arm-curl endurance), the closest validated analogue to a 30-second upper-body endurance count; informs why the Seated Row is framed as a *custom* upper-body endurance task rather than a validated protocol (§14).

### Computer Vision / Pose Estimation for Exercise Assessment
- Dill, S., Ahmadi, A., Grimmer, M., Haufe, D., Rohr, M., Zhao, Y., Sharbafi, M., & Hoog Antink, C. (2024). Accuracy evaluation of 3D pose reconstruction algorithms through stereo camera information fusion for physical exercises with MediaPipe Pose. *Sensors, 24*(23), 7772. https://doi.org/10.3390/s24237772
  *Relevance:* Evaluates MediaPipe Pose accuracy for physical-exercise movements, supporting feasibility while quantifying the accuracy limits that motivate the app's measurement caveats (§15).
- Needham, L., Evans, M., Cosker, D. P., Wade, L., McGuigan, P. M., Bilzon, J. L., & Colyer, S. L. (2021). The accuracy of several pose estimation methods for 3D joint centre localisation. *Scientific Reports, 11*, 20673. https://doi.org/10.1038/s41598-021-00212-x
  *Relevance:* Quantifies markerless pose-estimation joint-localisation error versus marker-based motion capture, informing the camera/landmark accuracy limitations in §15.

---

## 14. Important Scientific Considerations

Distinguish carefully between the following:

- **Validated 30-second Chair Stand Test protocol** (Jones, Rikli & Beam, 1999): performed with arms folded across the chest, standardized chair height, counting full stands in 30 s, with published reliability and normative data.
- **Silver HYROX Sit-to-Stand implementation:** counts a full stand-and-sit **cycle** (STANDING→SEATED) via shoulder/hip vertical rise, with **no** knee-angle, torso-angle, chair-height, or arms-crossed enforcement in code (the config values for these are unused — §5). A "rep" here is a movement cycle detected by landmark displacement, which is **not guaranteed to equal** a protocol-compliant chair stand. **Do not transfer published chair-stand normative thresholds directly** to this app's counts unless equivalence is established.
- **Silver HYROX Seated Row station:** a **custom functional-movement / endurance challenge** based purely on horizontal wrist excursion. No directly validated comparable protocol is claimed; the closest validated analogue is the Senior Fitness Test arm-curl endurance item, which is a different movement. Treat Seated Row reps as an app-specific endurance count.
- **Combined total score** (`stsReps + rowReps`): an **application-specific challenge score** summing two different movements on different scales. It is **not** a validated clinical scale and should not be interpreted as one.

Results should be interpreted as **functional-performance / engagement data**, not a medical diagnosis. Published normative values generally use different protocols and populations and should not be applied to this app without verification.

---

## 15. Scientific and Measurement Limitations

- **Camera dependence:** accuracy depends on a stable, side-on camera view; camera angle, height, and movement all affect landmark positions.
- **Lighting & clothing:** low light, loose clothing, or busy backgrounds reduce landmark confidence.
- **Occlusion:** furniture, arms crossing the torso, or a second person can occlude landmarks; the Seated Row has no explicit occlusion handling beyond skipping frames with no wrist.
- **Chair positioning:** chair height/placement is not standardized or enforced, affecting the Sit-to-Stand movement and detection.
- **Landmark confidence:** MediaPipe visibility varies; only smoothed positions are used, but low-confidence frames can still influence counts.
- **State classification:** seated/standing (and forward/return) are classified from displacement thresholds, not biomechanical criteria; partial or unusual movements may be missed or miscounted.
- **Differing station difficulty:** Sit-to-Stand and Seated Row differ in effort, range, and typical rep rates, so their counts are **not directly comparable** and the total score weights them equally by construction.
- **Mobility variation:** participants with different mobility levels may trigger thresholds differently; thresholds are engineering defaults requiring tuning.
- **Not a validated clinical scale:** the total score and derived bands are app-generated.
- **Learning/familiarisation:** repeated measurements may improve through practice, not true fitness change.
- **Consistency statistic:** the CV uses a population SD (÷n) and requires ≥ 3 reps, so short/low-rep sessions yield `N/A`.

Interpret all outputs as functional-performance indicators for fitness/engagement, not diagnosis.

---

## 16. Data Quality Considerations

Based on the implementation and export payload:

- **Incomplete stations:** a skipped/failed station contributes `0` reps and blank (`''`) string metrics; `totalScore` still computes from whatever exists. Filter or flag these.
- **Manual stopping:** the operator can stop before 30 s; `stsElapsed`/`rowElapsed` < 30 indicates an early stop. The internal `manualStop` flag is **not exported**, so use elapsed time as the proxy.
- **Tracking loss:** frames without valid dominant-side landmarks are skipped while the timer runs, which can depress rep counts; implausibly low reps with full elapsed time may indicate tracking issues.
- **Invalid pose confidence:** low-visibility sessions may still record counts; treat outliers cautiously.
- **Duplicate submissions:** the `no-cors` POST cannot confirm success, so reloads/retries could create duplicate rows; de-duplicate on `nickname` + near-identical `timestamp`.
- **Repeated sessions / no stable ID:** only free-text `nickname` links sessions; typos/collisions break linkage (see §8.6).
- **Implausibly high rep counts:** the lenient Seated Row detector can over-count small repetitive hand movements; screen for physiologically unlikely `rowReps`.
- **Zero scores:** `totalScore = 0` (both stations 0) usually means no valid movement detected or a mis-set-up session.
- **Missing participant info:** `nickname`/`gender` may be blank; validate before grouping.
- **Timestamps:** ISO 8601 UTC strings; convert to local time/date consistently.
- **Interrupted browser sessions:** results are only written on save; an interrupted session may never reach the sheet or localStorage.
- **Unit consistency:** coerce string metrics to numeric; keep `rowAvgReach` (normalized ratio) separate from time (seconds) and counts.

Recommended cleaning before analysis: coerce types, drop/flag zero or blank-station rows, flag elapsed < 30 s, de-duplicate on nickname+timestamp, range-check `age` and rep counts, and decide session-linkage rules for nicknames.

---

## 17. Privacy and Ethical Considerations

Derived strictly from the source code:

- **Participant information collected:** `nickname` (free text — a nickname/ID is sufficient), `gender`, and `age`. No account/login.
- **Video is NOT stored or uploaded.** Frames are consumed live by MediaPipe; the code never records or transmits images/video.
- **MediaPipe processing occurs locally** in the browser (model + WASM/GPU on-device).
- **Images are never uploaded.** Only the flattened numeric result (§4a) is sent, and only when a webhook is configured.
- **Data that goes to Google Sheets:** the 18 numeric/text fields in §4a (timestamp, nickname, gender, age, scores, per-station metrics). No raw landmarks or images.
- **Nickname sufficiency:** because a nickname/ID is enough, avoid collecting real names or other unnecessary identifiers.
- **Recommended consent practices:** for programme/research use, obtain informed consent covering camera use, what derived data are stored, where they are sent (a shared Google Sheet), and retention/sharing. Control the Google Sheet's sharing settings, since anyone with access can view all submitted rows.

Privacy statements in the app (home/results/README) match the code: local processing, no video storage, only numerical results saved.

---

## 18. Google Sheets Integration

Results are sent to a Google Sheet when the webhook URL is configured, enabling centralised multi-device data collection.

### Architecture
```
Silver HYROX (browser) → fetch POST (no-cors, JSON) → Google Apps Script Web App (doPost) → Google Sheet row
```
The client (`results.js` `sendToGoogleSheets`) builds the 18-field `flat` object and sends `JSON.stringify(flat)`. Because `mode: 'no-cors'` is required for Apps Script from a browser, the client cannot read the response.

### Endpoint configuration
Set the deployment URL in `config.js`:
```javascript
googleSheetsWebhookUrl: 'https://script.google.com/macros/s/AKfycbz.../exec',
```
Empty string disables export (local-only). This is pre-configured in the current deployment.

### Payload structure (18 fields)
`timestamp, nickname, gender, age, totalScore, stsReps, stsElapsed, stsAvgRepTime, stsFastestRep, stsSlowestRep, stsConsistency, rowReps, rowElapsed, rowAvgRepTime, rowFastestRep, rowSlowestRep, rowConsistency, rowAvgReach` (see §4a for types/units).

### Field mapping (by key, fixed column order)
The Apps Script appends a row by reading each key explicitly and placing it in a fixed column order. It **maps by key name in code**, not by matching Row-1 header text. The header row is for human readability and must be arranged in the **same order** as the script's `appendRow([...])` array.

> ⚠️ **Header warning:** Row-1 headers must exactly match the expected field names **and order** used by the Apps Script. Reordering or renaming headers without editing the script will misalign labels and values (the values still write in the script's fixed order).

### Required sheet headers (Row 1, in order)
```
A timestamp | B nickname | C gender | D age | E totalScore |
F stsReps | G stsElapsed | H stsAvgRepTime | I stsFastestRep | J stsSlowestRep | K stsConsistency |
L rowReps | M rowElapsed | N rowAvgRepTime | O rowFastestRep | P rowSlowestRep | Q rowConsistency | R rowAvgReach
```

### Apps Script (doPost / doGet)
```javascript
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.nickname || '', data.gender || '', data.age || '',
      data.totalScore || 0,
      data.stsReps || 0, data.stsElapsed || '', data.stsAvgRepTime || '',
      data.stsFastestRep || '', data.stsSlowestRep || '', data.stsConsistency || '',
      data.rowReps || 0, data.rowElapsed || '', data.rowAvgRepTime || '',
      data.rowFastestRep || '', data.rowSlowestRep || '', data.rowConsistency || '',
      data.rowAvgReach || ''
    ]);
    return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
function doGet(e) {
  return ContentService.createTextOutput('Silver HYROX webhook is active.')
    .setMimeType(ContentService.MimeType.TEXT);
}
```

### Save-results workflow
1. Complete both stations. 2. On the results screen, choose Save. 3. `saveChallengeResult()` writes to `localStorage` and (if configured) calls `sendToGoogleSheets()`. 4. A new row should appear in the sheet within seconds.

### Deployment
Extensions → Apps Script → paste code → Save → Deploy → New deployment → Web app → Execute as **Me**, Access **Anyone** → authorise → copy the `/exec` URL into `config.js`. To update later: Deploy → Manage deployments → Edit → New version → Deploy.

### Testing
Complete a challenge and save; confirm a new row appears. Because of `no-cors`, verify by inspecting the sheet (the app cannot report success/failure).

### Troubleshooting
- **No new rows:** confirm the webhook URL is set and the deployment access is **Anyone**; remember the client cannot detect failures.
- **Misaligned columns:** ensure Row-1 header order matches the script's `appendRow` order.
- **Blank cells:** expected for skipped stations (string metrics default to `''`).
- **Auth prompts on deploy:** grant the script permission to edit the bound spreadsheet.

---

## 19. Technical Documentation

### Project structure
```
SilverHYROX/
├── index.html        Entry point; loads config → pose-engine → stations → results (globals), then app.js (module)
├── styles.css        Styling
├── config.js         Thresholds, durations, pose settings, webhook URL, landmark indices
├── pose-engine.js    MediaPipe init, camera, smoothing, dominant-side selection, skeleton, PoseUtils
├── sit-to-stand.js   Sit-to-Stand station state machine + metrics
├── seated-row.js     Seated Row station state machine + metrics
├── results.js        Session object, localStorage, fitness profile, Google Sheets export
├── app.js            Main application controller (ES module)
└── README.md         This manual
```
Load order matters: `config.js`, `pose-engine.js`, `sit-to-stand.js`, `seated-row.js`, `results.js` are plain scripts exposing globals (`CONFIG`, `PoseEngine`, `PoseUtils`, `SitToStandStation`, `SeatedRowStation`, `ResultsManager`); `app.js` is an ES module.

### Browser requirements
Modern browser with WebGL/GPU (Chrome 90+, Safari 15+, Edge 90+); a device camera; HTTPS or localhost (required for camera access).

### Camera access & MediaPipe setup
The app requests the rear camera (`facingMode: 'environment'`) at portrait resolution (`720 × 1280` ideal) and loads MediaPipe Tasks-Vision `@0.10.18` (ESM + WASM) from jsDelivr, using the `pose_landmarker_lite` float16 model with detection/presence/tracking confidence 0.60 and `numPoses: 1`.

### Running locally
Serve the folder over HTTP(S) (module + camera cannot run from `file://`):
```bash
# Python
python -m http.server 8000
# Node
npx serve .
```
Open in a mobile browser and allow camera access.

### GitHub Pages deployment
Push the `SilverHYROX` contents to the repo; Settings → Pages → Deploy from branch → main → root (or the folder containing `index.html`). All paths are relative; no build step. GitHub Pages provides the required HTTPS. Live app: https://aaron-chen-angus.github.io/SilverHYROX/

### Configuration reference (`config.js`)

| Setting | Default | Description |
|---------|---------|-------------|
| `pose.detectionConfidence` / `presenceConfidence` / `trackingConfidence` | 0.60 | MediaPipe thresholds |
| `pose.numPoses` | 1 | Poses detected |
| `pose.modelPath` | lite float16 | Pose Landmarker model |
| `sitToStand.durationSeconds` | 30 | Station duration |
| `sitToStand.hipRiseThreshold` | 0.15 | Rise threshold (× torso length) |
| `sitToStand.statePersistenceMs` | 200 | Debounce for state change |
| `sitToStand.calibrationDurationMs` | 2000 | Baseline capture |
| `sitToStand.seatedKneeAngleMin/Max`, `standingKneeAngleMin`, `standingTorsoAngleMax`, `armsCrossedThreshold` | 60/110, 120, 30, 0.3 | **Defined but unused** by current detection (§5) |
| `seatedRow.durationSeconds` | 30 | Station duration |
| `seatedRow.forwardReachTorsoRatio` | 0.12 | Forward threshold (× torso length) |
| `seatedRow.returnTolerance` | 0.08 | Return threshold (× torso length) |
| `seatedRow.statePersistenceMs` | 120 | Debounce for state change |
| `seatedRow.calibrationDurationMs` | 2000 | Baseline capture |
| `tracking.smoothingFrames` | 5 | Moving-average window |
| `tracking.lostWarningMs` / `lostCriticalMs` | 750 / 2000 | Tracking-loss thresholds |
| `countdown.durationSeconds` | 3 | Pre-test countdown |
| `sounds.*` | various | Audio cues (enabled by default) |
| `ageBands.sitToStand` / `seatedRow` | `[]` | Intentionally empty — no fabricated norms (§7) |
| `googleSheetsWebhookUrl` | (set) | Apps Script URL (empty = local only) |

### Google Sheets
See §18.

### localStorage
- `silverHyrox_results` — array of saved session objects (nested, see §4).
- `silverHyrox_settings` — settings (e.g. `soundEnabled`). History can be cleared via `clearHistory()`.

### Debug mode
Enable with `#debug` in the URL or by triple-tapping the "SILVER HYROX" title. Shows live values (positions, displacement, thresholds, state, rep count).

### Troubleshooting & limitations
See §15 (measurement limitations) and §16 (data quality). Common issues: side-on view required; performance depends on device GPU/lighting; single participant only; not a validated clinical tool.

---

## 20. Final Validation (performed before saving this README)

1. **Google Sheets submission payload inspected** — `results.js` `sendToGoogleSheets()` builds the `flat` object and sends `JSON.stringify(flat)`.
2. **Every exported field listed** — 18 fields catalogued in §4a.
3. **Data Dictionary compared row-by-row** to the payload — every `flat` key has a dictionary row; no extras/omissions.
4. **No exported field missing** — confirmed (18/18).
5. **Fields calculated but not exported identified** — fitness profile bands, `completed`, `manualStop`, per-rep arrays, dominant side, debug data (§4b/§4c).
6. **Formulas checked against JavaScript** — total score (`stsReps + rowReps`), sit-to-stand rise thresholds (`0.15 × torso`, `×0.5`, `×0.4`), seated-row displacement thresholds (0.12/0.08), CV consistency bands (0.15/0.30), reach averaging, and timing all match the source. Documented that config knee/torso/arms-crossed thresholds are **unused** by detection.
7. **Units checked** — counts, seconds (string, 1–2 dp), normalized ratio (reach), categorical, DateTime, integer age.
8. **Statistics use real variables** (§8).
9. **Visualisations use real variables** (§9).
10. **References verified** — each APA reference checked against its source; unverifiable candidates removed; Sensors 2024 author list corrected from the publisher record.
11. **APA 7th edition** formatting with DOIs.
12–15. **No application source code, rep-counting thresholds, scoring logic, or Google Sheets submission logic was modified.**
16–17. **Only `SilverHYROX/README.md` was changed;** prior useful documentation (Google Sheets setup, deployment, config, privacy) was preserved and reorganised.

---

## License

MIT
