/**
 * Silver HYROX Home Challenge - Main Application Controller
 * 
 * Key design: Once camera starts, video element persists in DOM
 * through calibration → countdown → testing. No re-rendering video.
 */

class App {
    constructor() {
        this.state = 'HOME';
        this.participant = { nickname: '', gender: '', age: '' };
        this.currentStation = null;
        
        this.poseEngine = new PoseEngine();
        this.sitToStand = new SitToStandStation();
        this.seatedRow = new SeatedRowStation();
        this.results = new ResultsManager();
        
        this.sitToStandCompleted = false;
        this.seatedRowCompleted = false;
        this.sitToStandResults = null;
        this.seatedRowResults = null;
        
        this.countdownTimer = null;
        this.testTimer = null;
        this.soundEnabled = true;
        this.debugMode = false;
        this.audioCtx = null;
        
        this.container = document.getElementById('app');
        this.init();
    }

    init() {
        const settings = this.results.getSettings();
        this.soundEnabled = settings.soundEnabled !== false;
        if (window.location.hash === '#debug') this.debugMode = true;
        this.render();
    }

    setState(newState) {
        this.state = newState;
        this.render();
    }

    render() {
        switch (this.state) {
            case 'HOME': this.renderHome(); break;
            case 'PARTICIPANT_DETAILS': this.renderParticipantDetails(); break;
            case 'SAFETY': this.renderSafety(); break;
            case 'CHALLENGE_DASHBOARD': this.renderDashboard(); break;
            case 'INSTRUCTIONS': this.renderInstructions(); break;
            case 'STATION_RESULTS': this.renderStationResults(); break;
            case 'FINAL_RESULTS': this.renderFinalResults(); break;
            case 'HISTORY': this.renderHistory(); break;
            default: this.renderHome();
        }
    }

    // ========== HOME ==========
    renderHome() {
        this.container.innerHTML = `
            <div class="screen home-screen">
                <div class="logo-area">
                    <h1 class="app-title" id="logoTitle">SILVER HYROX</h1>
                    <h2 class="app-subtitle">HOME CHALLENGE</h2>
                </div>
                <p class="tagline">Two stations. Sixty seconds. How many reps can you complete?</p>
                <div class="station-preview-cards">
                    <div class="preview-card"><div class="preview-icon">🪑</div><h3>Sit-to-Stand</h3><p>30 seconds</p></div>
                    <div class="preview-card"><div class="preview-icon">🚣</div><h3>Seated Row</h3><p>30 seconds</p></div>
                </div>
                <button class="btn btn-primary btn-large" id="btnStart">START CHALLENGE</button>
                <div class="home-links">
                    <button class="btn btn-link" id="btnHistory">View History</button>
                    <button class="btn btn-link" id="btnLeaderboard">Leaderboard</button>
                </div>
                <div class="disclaimer"><p>This application is intended for fitness, wellness and educational use and is not a medical diagnostic tool. Participants should only perform activities appropriate for their abilities and health status.</p></div>
                <div class="privacy-note"><p><strong>Camera Privacy:</strong> Pose analysis is performed locally on your device. Video is not recorded or uploaded.</p></div>
                <footer class="app-footer"><p>An independent senior fitness challenge. Not affiliated with HYROX.</p></footer>
            </div>`;
        document.getElementById('btnStart').onclick = () => this.setState('PARTICIPANT_DETAILS');
        document.getElementById('btnHistory').onclick = () => this.setState('HISTORY');
        document.getElementById('btnLeaderboard').onclick = () => this.showLeaderboard();
        let clicks = 0;
        document.getElementById('logoTitle').onclick = () => {
            clicks++;
            if (clicks >= 3) { this.debugMode = !this.debugMode; alert(`Debug: ${this.debugMode ? 'ON' : 'OFF'}`); clicks = 0; }
            setTimeout(() => { clicks = 0; }, 1000);
        };
    }

    // ========== PARTICIPANT DETAILS ==========
    renderParticipantDetails() {
        this.container.innerHTML = `
            <div class="screen details-screen">
                <h2>Participant Details</h2>
                <form id="detailsForm" class="form">
                    <div class="form-group"><label for="nickname">Name / Nickname</label><input type="text" id="nickname" placeholder="Enter name" value="${this.participant.nickname}" required></div>
                    <div class="form-group"><label for="gender">Gender</label><select id="gender"><option value="">Select...</option><option value="male" ${this.participant.gender === 'male' ? 'selected' : ''}>Male</option><option value="female" ${this.participant.gender === 'female' ? 'selected' : ''}>Female</option><option value="other" ${this.participant.gender === 'other' ? 'selected' : ''}>Other</option><option value="prefer_not_to_say" ${this.participant.gender === 'prefer_not_to_say' ? 'selected' : ''}>Prefer not to say</option></select></div>
                    <div class="form-group"><label for="age">Age</label><input type="number" id="age" placeholder="Age" min="1" max="120" value="${this.participant.age}"></div>
                    <div class="form-actions"><button type="button" class="btn btn-secondary" id="btnBack">Back</button><button type="submit" class="btn btn-primary">CONTINUE</button></div>
                </form>
            </div>`;
        document.getElementById('btnBack').onclick = () => this.setState('HOME');
        document.getElementById('detailsForm').onsubmit = (e) => {
            e.preventDefault();
            const nickname = document.getElementById('nickname').value.trim();
            const gender = document.getElementById('gender').value;
            const age = document.getElementById('age').value;
            if (!nickname) { alert('Please enter a name or nickname.'); return; }
            if (age && (parseInt(age) < 1 || parseInt(age) > 120)) { alert('Please enter a valid age.'); return; }
            this.participant = { nickname, gender, age: age ? parseInt(age) : '' };
            this.setState('SAFETY');
        };
    }

    // ========== SAFETY ==========
    renderSafety() {
        this.container.innerHTML = `
            <div class="screen safety-screen">
                <h2>⚠️ Safety Check</h2>
                <div class="safety-checklist">
                    <div class="safety-item">✓ Use a stable chair with a backrest and no armrests.</div>
                    <div class="safety-item">✓ Place the chair on a stable, non-slip surface.</div>
                    <div class="safety-item">✓ Ensure sufficient space around the participant.</div>
                    <div class="safety-item">✓ Keep the camera operator clear of the exercise area.</div>
                    <div class="safety-item">✓ Participants should only perform movements appropriate for their health and ability.</div>
                </div>
                <div class="form-actions"><button class="btn btn-secondary" id="btnBack">Back</button><button class="btn btn-primary btn-large" id="btnSafetyConfirm">I HAVE COMPLETED THE SAFETY CHECK</button></div>
            </div>`;
        document.getElementById('btnBack').onclick = () => this.setState('PARTICIPANT_DETAILS');
        document.getElementById('btnSafetyConfirm').onclick = () => {
            this.sitToStandCompleted = false; this.seatedRowCompleted = false;
            this.sitToStandResults = null; this.seatedRowResults = null;
            this.sitToStand.reset(); this.seatedRow.reset();
            this.setState('CHALLENGE_DASHBOARD');
        };
    }

    // ========== CHALLENGE DASHBOARD ==========
    renderDashboard() {
        const stsStatus = this.sitToStandCompleted ? `<span class="status-done">✓ Completed — ${this.sitToStandResults.reps} reps</span>` : '<span class="status-ready">● Ready</span>';
        const rowStatus = this.seatedRowCompleted ? `<span class="status-done">✓ Completed — ${this.seatedRowResults.reps} reps</span>` : '<span class="status-ready">● Ready</span>';
        const bothDone = this.sitToStandCompleted && this.seatedRowCompleted;
        this.container.innerHTML = `
            <div class="screen dashboard-screen">
                <p class="welcome-text">Welcome, ${this.participant.nickname}</p>
                <h2>SILVER HYROX HOME CHALLENGE</h2>
                <div class="station-cards">
                    <div class="station-card ${this.sitToStandCompleted ? 'completed' : ''}">
                        <h3>Station 1</h3><p class="station-name">30s Sit-to-Stand</p>${stsStatus}
                        <div class="station-actions">${!this.sitToStandCompleted ? '<button class="btn btn-primary" id="btnStartSTS">START</button>' : '<button class="btn btn-secondary btn-small" id="btnRedoSTS">Redo Station</button>'}</div>
                    </div>
                    <div class="station-card ${this.seatedRowCompleted ? 'completed' : ''}">
                        <h3>Station 2</h3><p class="station-name">30s Seated Row</p>${rowStatus}
                        <div class="station-actions">${!this.seatedRowCompleted ? '<button class="btn btn-primary" id="btnStartRow">START</button>' : '<button class="btn btn-secondary btn-small" id="btnRedoRow">Redo Station</button>'}</div>
                    </div>
                </div>
                ${bothDone ? '<div class="challenge-complete-banner"><h3>🏆 CHALLENGE COMPLETE</h3><button class="btn btn-primary btn-large" id="btnViewResults">VIEW RESULTS</button></div>' : ''}
                <div class="dashboard-footer"><button class="btn btn-link" id="btnSound">${this.soundEnabled ? '🔊 Sound ON' : '🔇 Sound OFF'}</button></div>
            </div>`;
        if (document.getElementById('btnStartSTS')) document.getElementById('btnStartSTS').onclick = () => { this.currentStation = 'sitToStand'; this.setState('INSTRUCTIONS'); };
        if (document.getElementById('btnStartRow')) document.getElementById('btnStartRow').onclick = () => { this.currentStation = 'seatedRow'; this.setState('INSTRUCTIONS'); };
        if (document.getElementById('btnRedoSTS')) document.getElementById('btnRedoSTS').onclick = () => { if (confirm('Redo Sit-to-Stand?')) { this.sitToStandCompleted = false; this.sitToStandResults = null; this.sitToStand.reset(); this.currentStation = 'sitToStand'; this.setState('INSTRUCTIONS'); } };
        if (document.getElementById('btnRedoRow')) document.getElementById('btnRedoRow').onclick = () => { if (confirm('Redo Seated Row?')) { this.seatedRowCompleted = false; this.seatedRowResults = null; this.seatedRow.reset(); this.currentStation = 'seatedRow'; this.setState('INSTRUCTIONS'); } };
        if (document.getElementById('btnViewResults')) document.getElementById('btnViewResults').onclick = () => this.setState('FINAL_RESULTS');
        document.getElementById('btnSound').onclick = () => { this.soundEnabled = !this.soundEnabled; this.results.saveSettings({ ...this.results.getSettings(), soundEnabled: this.soundEnabled }); this.render(); };
    }

    // ========== INSTRUCTIONS ==========
    renderInstructions() {
        const isSTS = this.currentStation === 'sitToStand';
        const content = isSTS
            ? `<h2>30-Second Sit-to-Stand</h2><div class="instructions-list"><div class="instruction-step">1. Sit back against the chair.</div><div class="instruction-step">2. Cross your arms across your chest.</div><div class="instruction-step">3. Keep your feet flat on the floor.</div><div class="instruction-step">4. When GO appears, stand up fully.</div><div class="instruction-step">5. Return to sitting position.</div><div class="instruction-step">6. Repeat as many times as possible in 30 seconds.</div></div>`
            : `<h2>30-Second Seated Row</h2><div class="instructions-list"><div class="instruction-step">1. Sit upright against the chair.</div><div class="instruction-step">2. Bend your elbows with your hands beside you.</div><div class="instruction-step">3. Reach both hands forward.</div><div class="instruction-step">4. Pull your hands back towards your body.</div><div class="instruction-step">5. Repeat as many times as possible for 30 seconds.</div></div>`;
        this.container.innerHTML = `<div class="screen instructions-screen">${content}<div class="form-actions"><button class="btn btn-secondary" id="btnBack">Back</button><button class="btn btn-primary btn-large" id="btnProceed">PROCEED TO CAMERA</button></div></div>`;
        document.getElementById('btnBack').onclick = () => this.setState('CHALLENGE_DASHBOARD');
        document.getElementById('btnProceed').onclick = () => this.startLiveSession();
    }

    // ==========================================================
    // LIVE SESSION: Camera → Calibration → Countdown → Testing
    // Video element persists throughout - no re-rendering!
    // ==========================================================
    async startLiveSession() {
        // Build the persistent live UI
        this.container.innerHTML = `
            <div class="live-session">
                <div class="live-video-wrap">
                    <video id="liveVideo" autoplay playsinline muted></video>
                    <canvas id="liveCanvas"></canvas>
                    <div class="live-overlay" id="liveOverlay">
                        <div class="overlay-status" id="overlayStatus">Loading pose model...</div>
                    </div>
                    <div class="live-hud" id="liveHud" style="display:none;">
                        <div class="hud-time" id="hudTime">30.0</div>
                        <div class="hud-reps" id="hudReps">0</div>
                    </div>
                </div>
                <div class="live-controls" id="liveControls">
                    <button class="btn btn-secondary" id="btnCancel">Cancel</button>
                </div>
                ${this.debugMode ? '<div class="debug-panel" id="debugPanel"></div>' : ''}
            </div>`;

        document.getElementById('btnCancel').onclick = () => {
            this.poseEngine.stopCamera();
            clearInterval(this.countdownTimer);
            clearInterval(this.testTimer);
            this.setState('CHALLENGE_DASHBOARD');
        };

        const video = document.getElementById('liveVideo');
        const canvas = document.getElementById('liveCanvas');
        const overlay = document.getElementById('overlayStatus');

        try {
            // 1. Init pose model
            if (!this.poseEngine.poseLandmarker) {
                overlay.textContent = 'Loading pose model...';
                await this.poseEngine.initialize();
            }

            // 2. Start camera (portrait)
            overlay.textContent = 'Starting camera...';
            this.poseEngine.resetSideDetection();
            await this.poseEngine.startCamera(video, canvas);

            // 3. Show START button
            overlay.textContent = 'Position participant side-on.\nFull body must be visible.';
            overlay.classList.add('overlay-ready');
            const controls = document.getElementById('liveControls');
            controls.innerHTML = `
                <button class="btn btn-secondary" id="btnCancel">Cancel</button>
                <button class="btn btn-primary btn-large" id="btnGo">START</button>`;
            document.getElementById('btnCancel').onclick = () => { this.poseEngine.stopCamera(); this.setState('CHALLENGE_DASHBOARD'); };
            document.getElementById('btnGo').onclick = () => this.runCalibration();

            // Show readiness
            this.poseEngine.onPose((landmarks) => {
                if (this.state !== 'INSTRUCTIONS') {
                    // During setup phase only
                }
                const status = this.poseEngine.getReadinessStatus(landmarks);
                const el = document.getElementById('overlayStatus');
                if (el && !this._calibStarted) {
                    el.textContent = status.message;
                }
            });

        } catch (err) {
            console.error(err);
            overlay.textContent = `Error: ${err?.message || err}. Allow camera access (HTTPS required).`;
        }
    }

    // ---- CALIBRATION (2 sec, no re-render) ----
    runCalibration() {
        this._calibStarted = true;
        const overlay = document.getElementById('overlayStatus');
        const controls = document.getElementById('liveControls');
        overlay.textContent = 'Calibrating... Hold still';
        overlay.classList.remove('overlay-ready');
        controls.innerHTML = '<button class="btn btn-secondary" id="btnCancel">Cancel</button>';
        document.getElementById('btnCancel').onclick = () => { this.poseEngine.stopCamera(); this.setState('CHALLENGE_DASHBOARD'); };

        const station = this.currentStation === 'sitToStand' ? this.sitToStand : this.seatedRow;
        station.reset();
        station.startCalibration();

        this.poseEngine.onPose((landmarks) => {
            if (!station.isCalibrating) return;
            if (!landmarks) return;
            const side = this.poseEngine.getSideLandmarks(landmarks);
            const done = station.processCalibrationFrame(side);
            if (done || station.calibrationComplete) {
                overlay.textContent = '✓ Calibrated';
                setTimeout(() => this.runCountdown(), 400);
            }
        });
    }

    // ---- COUNTDOWN 3-2-1-GO (no re-render) ----
    runCountdown() {
        const overlay = document.getElementById('overlayStatus');
        const controls = document.getElementById('liveControls');
        controls.innerHTML = '';
        let count = 3;
        overlay.textContent = count;
        overlay.classList.add('overlay-countdown');
        this.playCountdownSound();

        this.countdownTimer = setInterval(() => {
            count--;
            if (count > 0) {
                overlay.textContent = count;
                this.playCountdownSound();
            } else if (count === 0) {
                overlay.textContent = 'GO!';
                this.playGoSound();
            } else {
                clearInterval(this.countdownTimer);
                overlay.classList.remove('overlay-countdown');
                this.runTest();
            }
        }, 1000);
    }

    // ---- TESTING (30 sec, no re-render) ----
    runTest() {
        const overlay = document.getElementById('overlayStatus');
        const hud = document.getElementById('liveHud');
        const controls = document.getElementById('liveControls');

        overlay.style.display = 'none';
        hud.style.display = 'flex';
        controls.innerHTML = '<button class="btn btn-danger btn-large" id="btnStop">STOP</button>';
        document.getElementById('btnStop').onclick = () => this.manualStop();

        const station = this.currentStation === 'sitToStand' ? this.sitToStand : this.seatedRow;
        station.startTest();

        let lastRepCount = 0;

        this.poseEngine.onPose((landmarks) => {
            if (!station.testRunning) return;
            if (!landmarks) return;
            const side = this.poseEngine.getSideLandmarks(landmarks);
            station.processFrame(side, landmarks);

            if (station.repCount > lastRepCount) {
                lastRepCount = station.repCount;
                this.playRepSound();
            }

            // Debug
            if (this.debugMode) {
                const dp = document.getElementById('debugPanel');
                if (dp) dp.innerHTML = `<pre>${JSON.stringify(station.debugData, null, 1)}</pre>`;
            }
        });

        this.testTimer = setInterval(() => {
            if (!station.testRunning) {
                clearInterval(this.testTimer);
                this.completeStation();
                return;
            }
            const remaining = station.getTimeRemaining();
            const timeEl = document.getElementById('hudTime');
            const repEl = document.getElementById('hudReps');
            if (timeEl) timeEl.textContent = remaining.toFixed(1);
            if (repEl) repEl.textContent = station.repCount;

            if (remaining <= 10.1 && remaining > 9.9) this.playWarningSound();

            // Auto-complete when time runs out
            if (remaining <= 0) {
                station.stopTest();
            }
        }, 100);
    }

    manualStop() {
        clearInterval(this.testTimer);
        const station = this.currentStation === 'sitToStand' ? this.sitToStand : this.seatedRow;
        station.stopTest();
        this.completeStation();
    }

    completeStation() {
        clearInterval(this.testTimer);
        this.playCompleteSound();
        this.poseEngine.stopCamera();
        this._calibStarted = false;

        const station = this.currentStation === 'sitToStand' ? this.sitToStand : this.seatedRow;
        const stationResults = station.getResults();

        if (this.currentStation === 'sitToStand') {
            this.sitToStandCompleted = true;
            this.sitToStandResults = stationResults;
        } else {
            this.seatedRowCompleted = true;
            this.seatedRowResults = stationResults;
        }

        this.setState('STATION_RESULTS');
    }

    // ========== STATION RESULTS ==========
    renderStationResults() {
        const isSTS = this.currentStation === 'sitToStand';
        const results = isSTS ? this.sitToStandResults : this.seatedRowResults;
        const stationName = isSTS ? '30-Second Sit-to-Stand' : '30-Second Seated Row';
        const bothDone = this.sitToStandCompleted && this.seatedRowCompleted;
        const nextStationName = isSTS ? 'Seated Row' : 'Sit-to-Stand';

        let metricsHTML = `
            <div class="results-metrics">
                <div class="metric-card"><span class="metric-title">Avg Rep Time</span><span class="metric-val">${results.averageRepTime}s</span></div>
                <div class="metric-card"><span class="metric-title">Fastest Rep</span><span class="metric-val">${results.fastestRep}s</span></div>
                <div class="metric-card"><span class="metric-title">Consistency</span><span class="metric-val">${results.consistency}</span></div>
            </div>`;

        let actionsHTML = bothDone
            ? '<button class="btn btn-primary btn-large" id="btnFinalResults">VIEW FINAL RESULTS</button>'
            : `<button class="btn btn-primary btn-large" id="btnNextStation">NEXT: ${nextStationName}</button>`;
        actionsHTML += '<button class="btn btn-secondary" id="btnDashboard">DASHBOARD</button>';

        this.container.innerHTML = `
            <div class="screen results-screen">
                <h2>🎉 STATION COMPLETE!</h2>
                <h3>${stationName}</h3>
                <div class="big-score"><span class="big-number">${results.reps}</span><span class="big-label">REPS</span></div>
                ${results.manualStop ? `<p class="manual-stop-note">Stopped manually — ${results.elapsedTime}s</p>` : ''}
                ${metricsHTML}
                <div class="form-actions">${actionsHTML}</div>
            </div>`;

        if (document.getElementById('btnFinalResults')) document.getElementById('btnFinalResults').onclick = () => this.setState('FINAL_RESULTS');
        if (document.getElementById('btnNextStation')) document.getElementById('btnNextStation').onclick = () => { this.currentStation = isSTS ? 'seatedRow' : 'sitToStand'; this.setState('INSTRUCTIONS'); };
        document.getElementById('btnDashboard').onclick = () => this.setState('CHALLENGE_DASHBOARD');
    }

    // ========== FINAL RESULTS ==========
    renderFinalResults() {
        const totalScore = (this.sitToStandResults?.reps || 0) + (this.seatedRowResults?.reps || 0);
        const sessionResult = this.results.buildSessionResult(this.participant, this.sitToStandResults, this.seatedRowResults);
        const profile = this.results.getFitnessProfile(sessionResult);

        this.container.innerHTML = `
            <div class="screen final-results-screen">
                <h2>SILVER HYROX HOME CHALLENGE</h2>
                <p class="congrats">Congratulations, ${this.participant.nickname}! 🏆</p>
                <div class="total-score-card"><span class="total-label">TOTAL SCORE</span><span class="total-number">${totalScore}</span><span class="total-unit">REPS</span></div>
                <div class="score-breakdown">
                    <div class="breakdown-row"><span>Sit-to-Stand</span><span>${this.sitToStandResults?.reps || 0}</span></div>
                    <div class="breakdown-row"><span>Seated Row</span><span>${this.seatedRowResults?.reps || 0}</span></div>
                    <div class="breakdown-row breakdown-total"><span>TOTAL</span><span>${totalScore}</span></div>
                </div>
                <div class="performance-profile">
                    <h4>Performance Profile</h4>
                    <div class="profile-dimension"><span>Lower-Body Endurance</span><span class="profile-level level-${profile.lowerBody.toLowerCase()}">${profile.lowerBody}</span></div>
                    <div class="profile-dimension"><span>Upper-Body Endurance</span><span class="profile-level level-${profile.upperBody.toLowerCase()}">${profile.upperBody}</span></div>
                    <div class="profile-dimension"><span>Movement Consistency</span><span class="profile-level level-${profile.consistency.toLowerCase()}">${profile.consistency}</span></div>
                </div>
                <div class="form-actions">
                    <button class="btn btn-primary" id="btnSave">SAVE RESULTS</button>
                    <button class="btn btn-secondary" id="btnNew">NEW CHALLENGE</button>
                </div>
                <footer class="app-footer"><p>An independent senior fitness challenge. Not affiliated with HYROX.</p></footer>
            </div>`;
        document.getElementById('btnSave').onclick = () => { this.results.saveChallengeResult(sessionResult); alert('Saved!'); document.getElementById('btnSave').disabled = true; document.getElementById('btnSave').textContent = '✓ SAVED'; };
        document.getElementById('btnNew').onclick = () => this.setState('HOME');
    }

    // ========== HISTORY ==========
    renderHistory() {
        const history = this.results.getHistory();
        const listHTML = history.length === 0 ? '<p class="empty-state">No saved results yet.</p>'
            : history.map((r, i) => `<div class="history-card"><strong>${r.participant.nickname}</strong> — ${r.totalScore} reps <span>${new Date(r.timestamp).toLocaleDateString()}</span></div>`).join('');
        this.container.innerHTML = `
            <div class="screen history-screen"><h2>History</h2><div class="history-list">${listHTML}</div>
            <div class="form-actions"><button class="btn btn-secondary" id="btnBack">Back</button>${history.length > 0 ? '<button class="btn btn-danger btn-small" id="btnClear">Clear All</button>' : ''}</div></div>`;
        document.getElementById('btnBack').onclick = () => this.setState('HOME');
        if (document.getElementById('btnClear')) document.getElementById('btnClear').onclick = () => { if (confirm('Delete all results?')) { this.results.clearHistory(); this.renderHistory(); } };
    }

    showLeaderboard() {
        const lb = this.results.getLeaderboard();
        const listHTML = lb.length === 0 ? '<p class="empty-state">No entries yet.</p>'
            : lb.map((e, i) => `<div class="leaderboard-entry ${i < 3 ? 'top-three' : ''}"><span class="lb-rank">${i+1}.</span><span class="lb-name">${e.nickname}</span><span class="lb-score">${e.totalScore}</span></div>`).join('');
        this.container.innerHTML = `<div class="screen leaderboard-screen"><h2>🏆 LEADERBOARD</h2><div class="leaderboard-list">${listHTML}</div><div class="form-actions"><button class="btn btn-secondary" id="btnBack">Back</button></div></div>`;
        document.getElementById('btnBack').onclick = () => this.setState('HOME');
    }

    // ========== SOUNDS ==========
    getAudioContext() {
        if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        return this.audioCtx;
    }
    playTone(freq, dur) {
        if (!this.soundEnabled) return;
        try {
            const ctx = this.getAudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = freq; osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur/1000);
            osc.start(); osc.stop(ctx.currentTime + dur/1000);
        } catch(e) {}
    }
    playRepSound() { this.playTone(800, 100); }
    playCountdownSound() { this.playTone(600, 200); }
    playGoSound() { this.playTone(1000, 400); }
    playWarningSound() { this.playTone(500, 300); }
    playCompleteSound() { this.playTone(1200, 300); setTimeout(() => this.playTone(1500, 400), 200); }
}

// Init
const app = new App();
window.app = app;
