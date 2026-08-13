# Silver HYROX Home Challenge

A mobile-friendly web application for senior fitness assessment using computer vision. The app uses Google MediaPipe Pose Landmarker to automatically count repetitions during two 30-second seated exercise stations.

**An independent senior fitness challenge. Not affiliated with HYROX.**

🔗 **Live App:** [https://aaron-chen-angus.github.io/SilverHYROX/](https://aaron-chen-angus.github.io/SilverHYROX/)

📊 **Live Results (Google Sheet):** [View Results](https://docs.google.com/spreadsheets/d/1P-09DEozBacsb7OGXcxDaReKPsnWeIlWjnaUUzjlMvE/)

---

## Purpose

Designed for:
- Older adults and active ageing programmes
- Community health programmes
- Fitness screening and engagement
- Educational demonstrations of computer vision

An operator conducts the test while a participant performs the exercises. The camera is positioned to view the participant from the side.

---

## Stations

### Station 1: 30-Second Sit-to-Stand
Participant sits on a chair with arms crossed, stands up fully, and returns to seated. Repetitions are counted automatically by tracking shoulder vertical movement.

### Station 2: 30-Second Seated Row
Participant reaches both arms forward and pulls them back towards their torso. Repetitions are counted automatically by tracking wrist horizontal displacement.

---

## How It Works

### MediaPipe Pose Landmarker
- Detects a single participant's body pose in real time
- Processes video frames locally in the browser (no upload)
- Tracks key landmarks: shoulders, elbows, wrists, hips, knees, ankles
- Automatically determines which side of the body is most visible
- Portrait camera orientation captures full standing body

### Sit-to-Stand Detection
- Tracks **shoulder Y position** rising (standing up) and falling (sitting down)
- Calibrates seated baseline for 2 seconds
- State machine: `SEATED → STANDING → SEATED` = 1 rep
- Temporal persistence (200ms) prevents jitter

### Seated Row Detection
- Tracks **wrist X displacement** from calibrated resting position
- Forward threshold: 12% of torso length
- Return threshold: within 8% of baseline
- State machine: `READY → FORWARD → READY` = 1 rep
- No body lean enforcement — pure hand displacement

### Metrics Calculated
- Total repetitions (primary score)
- Average rep time
- Fastest / slowest rep
- Consistency (coefficient of variation: Excellent / Good / Variable)
- Average reach distance (seated row, normalized to torso length)

---

## Google Sheets Integration

Results are automatically sent to a Google Sheet when the webhook URL is configured. This enables centralised data collection across multiple devices and sessions.

### Setup Instructions

#### Step 1: Create the Google Sheet

1. Go to [Google Sheets](https://docs.google.com/spreadsheets/) and create a new spreadsheet
2. Name it "Silver HYROX Results" (or similar)
3. In Row 1, add these column headers:

```
A: timestamp
B: nickname
C: gender
D: age
E: totalScore
F: stsReps
G: stsElapsed
H: stsAvgRepTime
I: stsFastestRep
J: stsSlowestRep
K: stsConsistency
L: rowReps
M: rowElapsed
N: rowAvgRepTime
O: rowFastestRep
P: rowSlowestRep
Q: rowConsistency
R: rowAvgReach
```

#### Step 2: Create the Google Apps Script

1. In your Google Sheet, go to **Extensions → Apps Script**
2. Delete any existing code in `Code.gs`
3. Paste the following script:

```javascript
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.nickname || '',
      data.gender || '',
      data.age || '',
      data.totalScore || 0,
      data.stsReps || 0,
      data.stsElapsed || '',
      data.stsAvgRepTime || '',
      data.stsFastestRep || '',
      data.stsSlowestRep || '',
      data.stsConsistency || '',
      data.rowReps || 0,
      data.rowElapsed || '',
      data.rowAvgRepTime || '',
      data.rowFastestRep || '',
      data.rowSlowestRep || '',
      data.rowConsistency || '',
      data.rowAvgReach || ''
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput('Silver HYROX webhook is active.')
    .setMimeType(ContentService.MimeType.TEXT);
}
```

4. Click **Save** (💾 icon or Ctrl+S)
5. Name the project "Silver HYROX Webhook"

#### Step 3: Deploy as Web App

1. Click **Deploy → New deployment**
2. Click the gear icon ⚙️ next to "Select type" and choose **Web app**
3. Set:
   - **Description:** Silver HYROX Results Receiver
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**
5. Authorise when prompted (Review Permissions → select your account → Advanced → Go to Silver HYROX Webhook → Allow)
6. **Copy the Web app URL** — it will look like:
   ```
   https://script.google.com/macros/s/AKfycbx.../exec
   ```

#### Step 4: Configure the App

Open `config.js` in the SilverHYROX folder and set the webhook URL:

```javascript
googleSheetsWebhookUrl: 'https://script.google.com/macros/s/AKfycbzWW81mQpeOfr8cyGVDIzhRJTMaJSgQ9tPCI1NbeUUkb4J6L2DutQ61-jNnvoQ6PF2-/exec',
```

> ✅ This is already configured in the current deployment.

#### Step 5: Test

1. Open the app and complete a challenge
2. Press "SAVE RESULTS" on the final results screen
3. Check your Google Sheet — a new row should appear within a few seconds

### Viewing Collected Results

All saved challenge results are recorded in this Google Sheet:

📊 **[Silver HYROX Results Sheet](https://docs.google.com/spreadsheets/d/1P-09DEozBacsb7OGXcxDaReKPsnWeIlWjnaUUzjlMvE/)**

Each row contains: timestamp, participant nickname, gender, age, total score, per-station reps, rep times, consistency ratings, and reach distances.

### Notes

- Results are sent via `fetch` with `mode: 'no-cors'` (required for Google Apps Script from browsers)
- The app saves results locally AND to Google Sheets simultaneously
- If the webhook URL is empty (`''`), only local storage is used
- No authentication is required from the participant — the webhook handles all writes
- To update the script later: go to Apps Script → Deploy → Manage deployments → Edit → New version → Deploy

---

## Local Development & Testing

1. Clone or download this folder
2. Serve with any static file server:
   ```bash
   # Python
   python -m http.server 8000
   
   # Node.js
   npx serve .
   ```
3. Open in a mobile browser (Chrome recommended)
4. Allow camera access when prompted

**Requirements:**
- Modern browser with WebGL support (Chrome 90+, Safari 15+, Edge 90+)
- Device camera
- HTTPS or localhost (required for camera access)

---

## GitHub Pages Deployment

1. Push the `SilverHYROX` folder contents to a GitHub repository
2. Go to **Settings → Pages**
3. Select **Deploy from branch → main → root**
4. The app will be available at your GitHub Pages URL

All file paths are relative. No build step required.

---

## Configuration

Edit `config.js` to adjust thresholds:

```javascript
// Sit-to-Stand
CONFIG.sitToStand.hipRiseThreshold = 0.15;    // proportion of torso length to count as "standing"
CONFIG.sitToStand.statePersistenceMs = 200;   // ms before accepting state change

// Seated Row
CONFIG.seatedRow.forwardReachTorsoRatio = 0.12; // 12% of torso length = "forward"
CONFIG.seatedRow.returnTolerance = 0.08;        // within 8% = "returned"
CONFIG.seatedRow.statePersistenceMs = 120;      // ms before accepting state change
```

**These values are initial engineering parameters and may need tuning with real participants.**

---

## Debug Mode

Access by:
- Adding `#debug` to the URL, or
- Triple-tapping the "SILVER HYROX" title on the home screen

Displays live values during testing: shoulder/hip/wrist positions, displacement, thresholds, current state, rep count.

---

## Privacy

- All pose analysis is performed locally on the device
- Video is never recorded, stored, or uploaded
- Only numerical exercise results are saved (localStorage + Google Sheets if configured)
- No login or personal account required

---

## Limitations

- Requires side-on camera view for accurate pose detection
- Performance depends on device GPU capability and lighting conditions
- Single participant only
- Not a validated clinical assessment tool

---

## Disclaimer

This application is intended for fitness, wellness and educational use and is not a medical diagnostic tool. Participants should only perform activities appropriate for their abilities and health status.
