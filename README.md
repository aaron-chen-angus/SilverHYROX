# Silver HYROX Home Challenge

A mobile-friendly web application for senior fitness assessment using computer vision. The app uses Google MediaPipe Pose Landmarker to automatically count repetitions during two 30-second seated exercise stations.

**An independent senior fitness challenge. Not affiliated with HYROX.**

## Purpose

Designed for:
- Older adults and active ageing programmes
- Community health programmes
- Fitness screening and engagement
- Educational demonstrations of computer vision

An operator conducts the test while a participant performs the exercises. The camera is positioned to view the participant from the side.

## Stations

### Station 1: 30-Second Sit-to-Stand
Participant sits on a chair with arms crossed, stands up fully, and returns to seated. Repetitions are counted automatically.

### Station 2: 30-Second Seated Row
Participant reaches both arms forward and pulls them back towards their torso. Repetitions are counted automatically.

## How It Works

### MediaPipe Pose Landmarker
- Detects a single participant's body pose in real time
- Processes video frames locally in the browser (no upload)
- Tracks 12 key landmarks: shoulders, elbows, wrists, hips, knees, ankles
- Automatically determines which side of the body is most visible

### Sit-to-Stand Detection
Uses a state machine: `SEATED → RISING → STANDING → LOWERING → SEATED`

Metrics used:
- **Knee angle** (HIP → KNEE → ANKLE): ~60-110° seated, ≥120° standing
- **Hip height**: vertical position relative to calibrated seated baseline
- **Torso angle**: shoulder-to-hip orientation from vertical

A rep is counted when the participant successfully reaches STANDING and returns to SEATED.

### Seated Row Detection
Uses a state machine: `READY → FORWARD_REACH → ROW_BACK → READY`

Metrics used:
- **Wrist-to-shoulder distance**: normalized by torso length
- **Elbow angle** (SHOULDER → ELBOW → WRIST)
- **Forward displacement**: ≥30% of torso length triggers FORWARD_REACH

A rep is counted when wrists return near the baseline position after a valid forward reach.

### Calibration
Before each station, 2 seconds of baseline measurements are captured while the participant holds their starting position. All detection uses relative changes from this baseline.

### Temporal Smoothing
- 5-frame moving average on all landmark positions
- State transitions require 150-300ms persistence before being accepted
- Prevents jitter-based false repetitions

## Metrics Calculated

### Sit-to-Stand
- Total repetitions (primary score)
- Average rep time
- Fastest/slowest rep
- Consistency (coefficient of variation)
- Average standing knee extension
- Arms-crossed compliance percentage
- Movement tempo (reps/minute)
- Rise Speed Index (hip displacement / rep time)

### Seated Row
- Total repetitions (primary score)
- Average rep time
- Fastest/slowest rep
- Consistency
- Average forward reach (× torso length)
- Left-right arm symmetry
- Average torso lean

## Setup & Local Testing

1. Clone or download this folder
2. Serve with any static file server:
   ```bash
   # Python
   python -m http.server 8000
   
   # Node.js
   npx serve .
   
   # VS Code Live Server extension
   ```
3. Open in a mobile browser (Chrome recommended)
4. Allow camera access when prompted

**Requirements:**
- Modern browser with WebGL support (Chrome 90+, Safari 15+, Edge 90+)
- Device camera
- HTTPS or localhost (required for camera access)

## GitHub Pages Deployment

1. Push this folder to a GitHub repository
2. Go to **Settings → Pages**
3. Select **Deploy from branch → main → root** (or the subfolder containing these files)
4. The app will be available at `https://yourusername.github.io/your-repo/`

All file paths are relative. No build step required.

## Configuration

Edit `config.js` to adjust thresholds:

```javascript
CONFIG.sitToStand.standingKneeAngleMin = 120; // degrees
CONFIG.sitToStand.seatedKneeAngleMax = 110;   // degrees
CONFIG.sitToStand.hipRiseThreshold = 0.15;    // proportion of leg length
CONFIG.sitToStand.statePersistenceMs = 200;   // ms before accepting state

CONFIG.seatedRow.forwardReachTorsoRatio = 0.30; // proportion of torso length
CONFIG.seatedRow.returnTolerance = 0.15;        // proportion from baseline
CONFIG.seatedRow.statePersistenceMs = 180;      // ms before accepting state
```

**These values are initial engineering parameters and require tuning with real participants.**

## Tracking Loss Behaviour

- **< 750ms**: No visible warning, counting paused
- **750ms–2000ms**: "Tracking participant..." displayed
- **> 2000ms**: "Participant not clearly visible" - operator can continue, restart, or stop

The 30-second timer continues during tracking loss.

## Camera Permissions

The app requires camera access. It will request permission on first use.

**Privacy:** All pose analysis is performed locally on the device. Video is never recorded, stored, or uploaded. Only numerical exercise results are retained if the user chooses to save them to localStorage.

## Debug Mode

Access by:
- Adding `#debug` to the URL, or
- Triple-clicking the "SILVER HYROX" title on the home screen

Displays live values: knee angle, hip angle, hip height, torso angle, current state, rep count, and landmark visibility.

## Limitations

- Requires side-on camera view for accurate pose detection
- Performance depends on device GPU capability and lighting conditions
- Thresholds may need adjustment for different chair heights and participant populations
- Single participant only
- Not a validated clinical assessment tool
- Arm symmetry metrics limited when one arm is occluded in side view

## Future Enhancements

The `saveChallengeResult()` function in `results.js` is structured for easy backend replacement:
- Google Sheets integration
- Firebase Realtime Database
- REST API endpoint

Age-band reference data can be added to `CONFIG.ageBands` in `config.js` when validated normative values become available.

## Disclaimer

This application is intended for fitness, wellness and educational use and is not a medical diagnostic tool. Participants should only perform activities appropriate for their abilities and health status.
