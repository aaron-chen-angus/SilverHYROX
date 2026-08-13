/**
 * Silver HYROX Home Challenge - Main Application Controller
 * 
 * Manages application state, UI rendering, and coordination
 * between pose engine, exercise stations, and results.
 * 
 * Application States:
 * HOME → PARTICIPANT_DETAILS → SAFETY → CHALLENGE_DASHBOARD → 
 * CAMERA_SETUP → CALIBRATION → COUNTDOWN → TESTING → 
 * STATION_RESULTS → FINAL_RESULTS → HISTORY
 */

class App {
    constructor() {
        this.state = 'HOME';
        this.participant = { nickname: '', gender: '', age: '' };
        this.currentStation = null; // 'sitToStand' or 'seatedRow'
        
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
        this.calibrationTimer = null;
        this.soundEnabled = true;
        this.debugMode = false;
        
        this.audioCtx = null;
        
        this.container = document.getElementById('app');
        this.init();
    }

    init() {
        // Load settings
        const settings = this.results.getSettings();
        this.soundEnabled = settings.soundEnabled !== false;
        
        // Check for debug mode (triple-tap logo or URL param)
        if (window.location.hash === '#debug') {
            this.debugMode = true;
        }
        
        this.render();
    }

    /**
     * Navigate to a new state
     */
    setState(newState) {
        this.state = newState;
        this.render();
    }

    /**
     * Main render dispatcher
     */
    render() {
        switch (this.state) {
            case 'HOME': this.renderHome(); break;
            case 'PARTICIPANT_DETAILS': this.renderParticipantDetails(); break;
            case 'SAFETY': this.renderSafety(); break;
            case 'CHALLENGE_DASHBOARD': this.renderDashboard(); break;
            case 'CAMERA_SETUP': this.renderCameraSetup(); break;
            case 'CALIBRATION': this.renderCalibration(); break;
            case 'COUNTDOWN': this.renderCountdown(); break;
            case 'TESTING': this.renderTesting(); break;
            case 'STATION_RESULTS': this.renderStationResults(); break;
            case 'FINAL_RESULTS': this.renderFinalResults(); break;
            case 'HISTORY': this.renderHistory(); break;
            case 'INSTRUCTIONS': this.renderInstructions(); break;
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
                    <div class="preview-card">
                        <div class="preview-icon">🪑</div>
                        <h3>Sit-to-Stand</h3>
                        <p>30 seconds</p>
                    </div>
                    <div class="preview-card">
                        <div class="preview-icon">🚣</div>
                        <h3>Seated Row</h3>
                        <p>30 seconds</p>
                    </div>
                </div>
                
                <button class="btn btn-primary btn-large" id="btnStart">START CHALLENGE</button>
                
                <div class="home-links">
                    <button class="btn btn-link" id="btnHistory">View History</button>
                    <button class="btn btn-link" id="btnLeaderboard">Leaderboard</button>
                </div>
                
                <div class="disclaimer">
                    <p>This application is intended for fitness, wellness and educational use and is not a medical diagnostic tool. Participants should only perform activities appropriate for their abilities and health status.</p>
                </div>

                <div class="privacy-note">
                    <p><strong>Camera Privacy:</strong> Pose analysis is performed locally on your device. Video is not recorded or uploaded. Only numerical exercise results are retained if you choose to save them.</p>
                </div>
                
                <footer class="app-footer">
                    <p>An independent senior fitness challenge. Not affiliated with HYROX.</p>
                </footer>
            </div>
        `;
        
        document.getElementById('btnStart').onclick = () => this.setState('PARTICIPANT_DETAILS');
        document.getElementById('btnHistory').onclick = () => this.setState('HISTORY');
        document.getElementById('btnLeaderboard').onclick = () => this.showLeaderboard();
        
        // Debug mode: triple click title
        let clickCount = 0;
        document.getElementById('logoTitle').onclick = () => {
            clickCount++;
            if (clickCount >= 3) {
                this.debugMode = !this.debugMode;
                alert(`Debug mode: ${this.debugMode ? 'ON' : 'OFF'}`);
                clickCount = 0;
            }
            setTimeout(() => { clickCount = 0; }, 1000);
        };
    }

    // ========== PARTICIPANT DETAILS ==========
    renderParticipantDetails() {
        this.container.innerHTML = `
            <div class="screen details-screen">
                <h2>Participant Details</h2>
                <form id="detailsForm" class="form">
                    <div class="form-group">
                        <label for="nickname">Name / Nickname</label>
                        <input type="text" id="nickname" placeholder="Enter name" value="${this.participant.nickname}" required>
                    </div>
                    <div class="form-group">
                        <label for="gender">Gender</label>
                        <select id="gender">
                            <option value="">Select...</option>
                            <option value="male" ${this.participant.gender === 'male' ? 'selected' : ''}>Male</option>
                            <option value="female" ${this.participant.gender === 'female' ? 'selected' : ''}>Female</option>
                            <option value="other" ${this.participant.gender === 'other' ? 'selected' : ''}>Other</option>
                            <option value="prefer_not_to_say" ${this.participant.gender === 'prefer_not_to_say' ? 'selected' : ''}>Prefer not to say</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="age">Age</label>
                        <input type="number" id="age" placeholder="Age" min="1" max="120" value="${this.participant.age}">
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" id="btnBack">Back</button>
                        <button type="submit" class="btn btn-primary">CONTINUE</button>
                    </div>
                </form>
            </div>
        `;
        
        document.getElementById('btnBack').onclick = () => this.setState('HOME');
        document.getElementById('detailsForm').onsubmit = (e) => {
            e.preventDefault();
            const nickname = document.getElementById('nickname').value.trim();
            const gender = document.getElementById('gender').value;
            const age = document.getElementById('age').value;
            
            if (!nickname) {
                alert('Please enter a name or nickname.');
                return;
            }
            if (age && (parseInt(age) < 1 || parseInt(age) > 120)) {
                alert('Please enter a valid age.');
                return;
            }
            
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
                <div class="form-actions">
                    <button class="btn btn-secondary" id="btnBack">Back</button>
                    <button class="btn btn-primary btn-large" id="btnSafetyConfirm">I HAVE COMPLETED THE SAFETY CHECK</button>
                </div>
            </div>
        `;
        
        document.getElementById('btnBack').onclick = () => this.setState('PARTICIPANT_DETAILS');
        document.getElementById('btnSafetyConfirm').onclick = () => {
            // Reset stations for new challenge
            this.sitToStandCompleted = false;
            this.seatedRowCompleted = false;
            this.sitToStandResults = null;
            this.seatedRowResults = null;
            this.sitToStand.reset();
            this.seatedRow.reset();
            this.setState('CHALLENGE_DASHBOARD');
        };
    }

    // ========== CHALLENGE DASHBOARD ==========
    renderDashboard() {
        const stsStatus = this.sitToStandCompleted 
            ? `<span class="status-done">✓ Completed — ${this.sitToStandResults.reps} reps</span>` 
            : '<span class="status-ready">● Ready</span>';
        const rowStatus = this.seatedRowCompleted 
            ? `<span class="status-done">✓ Completed — ${this.seatedRowResults.reps} reps</span>` 
            : '<span class="status-ready">● Ready</span>';
        
        const bothDone = this.sitToStandCompleted && this.seatedRowCompleted;

        this.container.innerHTML = `
            <div class="screen dashboard-screen">
                <p class="welcome-text">Welcome, ${this.participant.nickname}</p>
                <h2>SILVER HYROX HOME CHALLENGE</h2>
                
                <div class="station-cards">
                    <div class="station-card ${this.sitToStandCompleted ? 'completed' : ''}">
                        <h3>Station 1</h3>
                        <p class="station-name">30s Sit-to-Stand</p>
                        ${stsStatus}
                        <div class="station-actions">
                            ${!this.sitToStandCompleted 
                                ? '<button class="btn btn-primary" id="btnStartSTS">START</button>' 
                                : '<button class="btn btn-secondary btn-small" id="btnRedoSTS">Redo Station</button>'}
                        </div>
                    </div>
                    
                    <div class="station-card ${this.seatedRowCompleted ? 'completed' : ''}">
                        <h3>Station 2</h3>
                        <p class="station-name">30s Seated Row</p>
                        ${rowStatus}
                        <div class="station-actions">
                            ${!this.seatedRowCompleted 
                                ? '<button class="btn btn-primary" id="btnStartRow">START</button>' 
                                : '<button class="btn btn-secondary btn-small" id="btnRedoRow">Redo Station</button>'}
                        </div>
                    </div>
                </div>
                
                ${bothDone ? `
                    <div class="challenge-complete-banner">
                        <h3>🏆 CHALLENGE COMPLETE</h3>
                        <button class="btn btn-primary btn-large" id="btnViewResults">VIEW RESULTS</button>
                    </div>
                ` : ''}

                <div class="dashboard-footer">
                    <button class="btn btn-link" id="btnSound">${this.soundEnabled ? '🔊 Sound ON' : '🔇 Sound OFF'}</button>
                </div>
            </div>
        `;
        
        if (document.getElementById('btnStartSTS')) {
            document.getElementById('btnStartSTS').onclick = () => {
                this.currentStation = 'sitToStand';
                this.setState('INSTRUCTIONS');
            };
        }
        if (document.getElementById('btnStartRow')) {
            document.getElementById('btnStartRow').onclick = () => {
                this.currentStation = 'seatedRow';
                this.setState('INSTRUCTIONS');
            };
        }
        if (document.getElementById('btnRedoSTS')) {
            document.getElementById('btnRedoSTS').onclick = () => {
                if (confirm('Redo Sit-to-Stand? This will replace your previous score.')) {
                    this.sitToStandCompleted = false;
                    this.sitToStandResults = null;
                    this.sitToStand.reset();
                    this.currentStation = 'sitToStand';
                    this.setState('INSTRUCTIONS');
                }
            };
        }
        if (document.getElementById('btnRedoRow')) {
            document.getElementById('btnRedoRow').onclick = () => {
                if (confirm('Redo Seated Row? This will replace your previous score.')) {
                    this.seatedRowCompleted = false;
                    this.seatedRowResults = null;
                    this.seatedRow.reset();
                    this.currentStation = 'seatedRow';
                    this.setState('INSTRUCTIONS');
                }
            };
        }
        if (document.getElementById('btnViewResults')) {
            document.getElementById('btnViewResults').onclick = () => this.setState('FINAL_RESULTS');
        }
        document.getElementById('btnSound').onclick = () => {
            this.soundEnabled = !this.soundEnabled;
            this.results.saveSettings({ ...this.results.getSettings(), soundEnabled: this.soundEnabled });
            this.render();
        };
    }

    // ========== INSTRUCTIONS ==========
    renderInstructions() {
        const isSTS = this.currentStation === 'sitToStand';
        
        const content = isSTS ? `
            <h2>30-Second Sit-to-Stand</h2>
            <div class="instructions-list">
                <div class="instruction-step">1. Sit back against the chair.</div>
                <div class="instruction-step">2. Cross your arms across your chest.</div>
                <div class="instruction-step">3. Keep your feet flat on the floor.</div>
                <div class="instruction-step">4. When GO appears, stand up fully.</div>
                <div class="instruction-step">5. Return to sitting position.</div>
                <div class="instruction-step">6. Complete as many repetitions as possible in 30 seconds.</div>
            </div>
        ` : `
            <h2>30-Second Seated Row</h2>
            <div class="instructions-list">
                <div class="instruction-step">1. Sit upright against the chair.</div>
                <div class="instruction-step">2. Bend your elbows with your hands beside you.</div>
                <div class="instruction-step">3. Reach both hands forward.</div>
                <div class="instruction-step">4. Pull your hands back towards your body.</div>
                <div class="instruction-step">5. Repeat as many times as possible for 30 seconds.</div>
            </div>
        `;

        this.container.innerHTML = `
            <div class="screen instructions-screen">
                ${content}
                <div class="form-actions">
                    <button class="btn btn-secondary" id="btnBack">Back</button>
                    <button class="btn btn-primary btn-large" id="btnProceed">PROCEED TO CAMERA SETUP</button>
                </div>
            </div>
        `;
        
        document.getElementById('btnBack').onclick = () => this.setState('CHALLENGE_DASHBOARD');
        document.getElementById('btnProceed').onclick = () => this.startCameraSetup();
    }

    // ========== CAMERA SETUP ==========
    async startCameraSetup() {
        this.setState('CAMERA_SETUP');
        
        try {
            // Initialize pose engine if not already
            if (!this.poseEngine.poseLandmarker) {
                this.updateCameraStatus('Loading pose detection model... This may take a moment.');
                await this.poseEngine.initialize();
                this.updateCameraStatus('Model loaded. Starting camera...');
            }
            
            // Start camera
            const video = document.getElementById('cameraVideo');
            const canvas = document.getElementById('cameraCanvas');
            
            if (!video || !canvas) {
                this.updateCameraStatus('Page error: camera elements not found. Please try again.');
                return;
            }
            
            this.poseEngine.resetSideDetection();
            await this.poseEngine.startCamera(video, canvas);
            
            // Update readiness indicator
            this.poseEngine.onPose((landmarks, side) => {
                if (this.state !== 'CAMERA_SETUP') return;
                const status = this.poseEngine.getReadinessStatus(landmarks);
                this.updateReadinessIndicator(status);
            });
            
        } catch (err) {
            console.error('Camera setup error:', err);
            const errorMsg = err?.message || String(err) || 'Unknown error';
            this.updateCameraStatus(`Camera error: ${errorMsg}. Please allow camera access and ensure you are using HTTPS.`);
        }
    }

    renderCameraSetup() {
        this.container.innerHTML = `
            <div class="screen camera-screen">
                <h2>Camera Setup</h2>
                <div class="camera-instructions">
                    <p>1. Position the participant side-on to the camera.</p>
                    <p>2. Ensure the full body, chair and feet are visible.</p>
                    <p>3. Keep the camera stable.</p>
                    <p>4. Ensure there is adequate lighting.</p>
                </div>
                <div class="camera-container">
                    <video id="cameraVideo" autoplay playsinline muted></video>
                    <canvas id="cameraCanvas"></canvas>
                </div>
                <div class="readiness-indicator" id="readinessIndicator">
                    <p>Preparing camera...</p>
                </div>
                <div id="cameraStatus"></div>
                <div class="form-actions">
                    <button class="btn btn-secondary" id="btnCancelCamera">Cancel</button>
                    <button class="btn btn-primary btn-large" id="btnStartStation" disabled>START</button>
                </div>
            </div>
        `;
        
        document.getElementById('btnCancelCamera').onclick = () => {
            this.poseEngine.stopCamera();
            this.setState('CHALLENGE_DASHBOARD');
        };
        document.getElementById('btnStartStation').onclick = () => {
            this.startCalibration();
        };
    }

    updateReadinessIndicator(status) {
        const el = document.getElementById('readinessIndicator');
        const btn = document.getElementById('btnStartStation');
        if (!el || !btn) return;
        
        el.innerHTML = `<p class="readiness-${status.status}">${status.message}</p>`;
        
        // Always enable START - operator decides when ready
        btn.disabled = false;
    }

    updateCameraStatus(msg) {
        const el = document.getElementById('cameraStatus');
        if (el) el.innerHTML = `<p class="camera-status-msg">${msg}</p>`;
    }

    // ========== CALIBRATION ==========
    startCalibration() {
        this.state = 'CALIBRATION';
        
        const station = this.currentStation === 'sitToStand' ? this.sitToStand : this.seatedRow;
        station.reset();
        station.startCalibration();
        
        this.container.innerHTML = `
            <div class="screen calibration-screen">
                <h2>Calibrating...</h2>
                <p class="calibration-msg">${this.currentStation === 'sitToStand' 
                    ? 'Participant: sit still in starting position with arms crossed.' 
                    : 'Participant: sit still with hands beside you in starting position.'}</p>
                <div class="camera-container">
                    <video id="cameraVideo" autoplay playsinline muted></video>
                    <canvas id="cameraCanvas"></canvas>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar" id="calibProgress"></div>
                </div>
                <p id="calibStatus">Hold still...</p>
            </div>
        `;
        
        // Re-attach camera to new video/canvas elements
        const video = document.getElementById('cameraVideo');
        const canvas = document.getElementById('cameraCanvas');
        
        if (this.poseEngine.videoElement && this.poseEngine.videoElement.srcObject) {
            video.srcObject = this.poseEngine.videoElement.srcObject;
            video.play();
            this.poseEngine.videoElement = video;
            this.poseEngine.canvasElement = canvas;
            this.poseEngine.canvasCtx = canvas.getContext('2d');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
        }
        
        // Calibration processing
        let calibFrames = 0;
        const totalFrames = 30;
        
        this.poseEngine.onPose((landmarks, side) => {
            if (this.state !== 'CALIBRATION') return;
            if (!landmarks) return;
            
            const sideLandmarks = this.poseEngine.getSideLandmarks(landmarks);
            const done = station.processCalibrationFrame(sideLandmarks);
            
            calibFrames++;
            const progress = Math.min(100, (calibFrames / totalFrames) * 100);
            const progressBar = document.getElementById('calibProgress');
            if (progressBar) progressBar.style.width = `${progress}%`;
            
            if (done || station.calibrationComplete) {
                document.getElementById('calibStatus').textContent = 'Calibration Complete ✓';
                setTimeout(() => this.startCountdown(), 500);
            }
        });
    }

    // ========== COUNTDOWN ==========
    startCountdown() {
        this.state = 'COUNTDOWN';
        let count = CONFIG.countdown.durationSeconds;
        
        this.renderCountdownDisplay(count);
        
        this.countdownTimer = setInterval(() => {
            count--;
            if (count > 0) {
                this.renderCountdownDisplay(count);
                this.playCountdownSound();
            } else {
                clearInterval(this.countdownTimer);
                this.renderCountdownDisplay('GO!');
                this.playGoSound();
                setTimeout(() => this.startTesting(), 500);
            }
        }, 1000);
    }

    renderCountdown() {
        // Placeholder - actual countdown rendered by startCountdown
    }

    renderCountdownDisplay(value) {
        this.container.innerHTML = `
            <div class="screen countdown-screen">
                <div class="camera-container">
                    <video id="cameraVideo" autoplay playsinline muted></video>
                    <canvas id="cameraCanvas"></canvas>
                </div>
                <div class="countdown-overlay">
                    <span class="countdown-number">${value}</span>
                </div>
            </div>
        `;
        
        // Re-attach camera
        const video = document.getElementById('cameraVideo');
        const canvas = document.getElementById('cameraCanvas');
        if (this.poseEngine.videoElement && this.poseEngine.videoElement.srcObject) {
            video.srcObject = this.poseEngine.videoElement.srcObject;
            video.play();
            this.poseEngine.videoElement = video;
            this.poseEngine.canvasElement = canvas;
            this.poseEngine.canvasCtx = canvas.getContext('2d');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
        }
    }

    // ========== TESTING ==========
    startTesting() {
        this.state = 'TESTING';
        
        const station = this.currentStation === 'sitToStand' ? this.sitToStand : this.seatedRow;
        station.startTest();
        
        this.renderTestingUI();
        
        // Start frame processing
        this.poseEngine.onPose((landmarks, side) => {
            if (this.state !== 'TESTING') return;
            
            if (landmarks) {
                const sideLandmarks = this.poseEngine.getSideLandmarks(landmarks);
                station.processFrame(sideLandmarks, landmarks);
                
                // Check for rep increment
                const currentReps = station.repCount;
                const displayedReps = parseInt(document.getElementById('repDisplay')?.textContent || '0');
                if (currentReps > displayedReps) {
                    this.playRepSound();
                }
            }
            
            // Update display
            this.updateTestingDisplay(station);
            
            // Check completion
            if (station.isComplete()) {
                this.completeStation();
            }
        });
        
        // Also run a UI timer for smooth updates
        this.testTimer = setInterval(() => {
            if (this.state !== 'TESTING') {
                clearInterval(this.testTimer);
                return;
            }
            this.updateTestingDisplay(station);
            
            // 10-second warning
            const remaining = station.getTimeRemaining();
            if (remaining <= 10 && remaining > 9.8) {
                this.playWarningSound();
            }
            if (remaining <= 5 && remaining > 4.8) {
                this.playCountdownSound();
            }
        }, 100);
    }

    renderTesting() {
        this.renderTestingUI();
    }

    renderTestingUI() {
        const stationName = this.currentStation === 'sitToStand' ? 'Sit-to-Stand' : 'Seated Row';
        
        this.container.innerHTML = `
            <div class="screen testing-screen">
                <div class="testing-header">
                    <span class="testing-title">SILVER HYROX</span>
                </div>
                <div class="camera-container">
                    <video id="cameraVideo" autoplay playsinline muted></video>
                    <canvas id="cameraCanvas"></canvas>
                    <div class="testing-overlay">
                        <div class="metric-display timer-display">
                            <span class="metric-label">TIME</span>
                            <span class="metric-value" id="timeDisplay">30.0</span>
                        </div>
                        <div class="metric-display reps-display">
                            <span class="metric-label">REPS</span>
                            <span class="metric-value" id="repDisplay">0</span>
                        </div>
                    </div>
                </div>
                <div class="testing-status">
                    <span id="stateDisplay" class="state-badge">READY</span>
                    <div class="progress-ring-container">
                        <svg class="progress-ring" viewBox="0 0 100 100">
                            <circle class="progress-ring-bg" cx="50" cy="50" r="45"/>
                            <circle class="progress-ring-fill" id="progressRing" cx="50" cy="50" r="45"/>
                        </svg>
                    </div>
                </div>
                ${this.poseEngine.trackingLost ? '<div class="tracking-warning">Tracking participant...</div>' : ''}
                <button class="btn btn-danger btn-large" id="btnStop">STOP</button>
                ${this.debugMode ? '<div class="debug-panel" id="debugPanel"></div>' : ''}
            </div>
        `;
        
        // Re-attach camera
        const video = document.getElementById('cameraVideo');
        const canvas = document.getElementById('cameraCanvas');
        if (this.poseEngine.videoElement && this.poseEngine.videoElement.srcObject) {
            video.srcObject = this.poseEngine.videoElement.srcObject;
            video.play();
            this.poseEngine.videoElement = video;
            this.poseEngine.canvasElement = canvas;
            this.poseEngine.canvasCtx = canvas.getContext('2d');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
        }
        
        document.getElementById('btnStop').onclick = () => {
            this.manualStop();
        };
    }

    updateTestingDisplay(station) {
        const timeEl = document.getElementById('timeDisplay');
        const repEl = document.getElementById('repDisplay');
        const stateEl = document.getElementById('stateDisplay');
        const progressEl = document.getElementById('progressRing');
        
        if (timeEl) {
            const remaining = station.getTimeRemaining();
            timeEl.textContent = remaining.toFixed(1);
            if (remaining <= 5) timeEl.classList.add('time-warning');
        }
        if (repEl) repEl.textContent = station.repCount;
        if (stateEl) stateEl.textContent = station.state;
        
        // Update progress ring
        if (progressEl) {
            const duration = this.currentStation === 'sitToStand' 
                ? CONFIG.sitToStand.durationSeconds 
                : CONFIG.seatedRow.durationSeconds;
            const elapsed = station.testElapsed / 1000;
            const progress = Math.min(1, elapsed / duration);
            const circumference = 2 * Math.PI * 45;
            progressEl.style.strokeDasharray = circumference;
            progressEl.style.strokeDashoffset = circumference * (1 - progress);
        }
        
        // Update debug panel
        if (this.debugMode) {
            const debugEl = document.getElementById('debugPanel');
            if (debugEl) {
                debugEl.innerHTML = `<pre>${JSON.stringify(station.debugData, null, 1)}</pre>`;
            }
        }
        
        // Tracking warning
        if (this.poseEngine.trackingLost && this.poseEngine.trackingLostTime > CONFIG.tracking.lostCriticalMs) {
            const existing = document.querySelector('.tracking-critical');
            if (!existing) {
                const warning = document.createElement('div');
                warning.className = 'tracking-critical';
                warning.innerHTML = `
                    <p>Participant not clearly visible</p>
                    <button class="btn btn-secondary" onclick="app.render()">Continue</button>
                    <button class="btn btn-danger" onclick="app.manualStop()">Stop</button>
                `;
                this.container.appendChild(warning);
            }
        }
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
        
        const station = this.currentStation === 'sitToStand' ? this.sitToStand : this.seatedRow;
        const stationResults = station.getResults();
        
        if (this.currentStation === 'sitToStand') {
            this.sitToStandCompleted = true;
            this.sitToStandResults = stationResults;
        } else {
            this.seatedRowCompleted = true;
            this.seatedRowResults = stationResults;
        }
        
        this.poseEngine.stopCamera();
        this.setState('STATION_RESULTS');
    }

    // ========== STATION RESULTS ==========
    renderStationResults() {
        const isSTS = this.currentStation === 'sitToStand';
        const results = isSTS ? this.sitToStandResults : this.seatedRowResults;
        const stationName = isSTS ? '30-Second Sit-to-Stand' : '30-Second Seated Row';
        
        let metricsHTML = '';
        if (isSTS) {
            const quality = this.sitToStand.getQualitySummary();
            metricsHTML = `
                <div class="results-metrics">
                    <div class="metric-card">
                        <span class="metric-title">Avg Rep Time</span>
                        <span class="metric-val">${results.averageRepTime}s</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-title">Fastest Rep</span>
                        <span class="metric-val">${results.fastestRep}s</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-title">Consistency</span>
                        <span class="metric-val">${results.consistency}</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-title">Avg Standing Extension</span>
                        <span class="metric-val">${results.averageStandingAngle}°</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-title">Arms Position</span>
                        <span class="metric-val">${results.armCompliance}</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-title">Tempo</span>
                        <span class="metric-val">${results.tempo} rpm</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-title">Rise Speed Index</span>
                        <span class="metric-val">${results.riseSpeedIndex}</span>
                    </div>
                </div>
                <div class="quality-summary">
                    <h4>Movement Quality</h4>
                    <p>Standing Completion: <strong>${quality.standingCompletion}</strong></p>
                    <p>Tempo Consistency: <strong>${quality.tempoConsistency}</strong></p>
                    <p>Arm Position: <strong>${quality.armPosition}</strong></p>
                </div>
            `;
        } else {
            metricsHTML = `
                <div class="results-metrics">
                    <div class="metric-card">
                        <span class="metric-title">Avg Rep Time</span>
                        <span class="metric-val">${results.averageRepTime}s</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-title">Fastest Rep</span>
                        <span class="metric-val">${results.fastestRep}s</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-title">Consistency</span>
                        <span class="metric-val">${results.consistency}</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-title">Avg Reach</span>
                        <span class="metric-val">${results.averageReach}× torso</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-title">Arm Symmetry</span>
                        <span class="metric-val">${results.armSymmetry}</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-title">Avg Torso Lean</span>
                        <span class="metric-val">${results.averageTorsoLean}°</span>
                    </div>
                </div>
            `;
        }
        
        // Determine next action
        const otherDone = isSTS ? this.seatedRowCompleted : this.sitToStandCompleted;
        const bothDone = this.sitToStandCompleted && this.seatedRowCompleted;
        const nextStationName = isSTS ? '30-Second Seated Row' : '30-Second Sit-to-Stand';
        
        let actionsHTML = '';
        if (bothDone) {
            actionsHTML = `<button class="btn btn-primary btn-large" id="btnFinalResults">VIEW FINAL RESULTS</button>`;
        } else {
            actionsHTML = `
                <p class="next-station-hint">Next Challenge: ${nextStationName}</p>
                <button class="btn btn-primary btn-large" id="btnNextStation">PROCEED TO NEXT STATION</button>
            `;
        }
        actionsHTML += `<button class="btn btn-secondary" id="btnDashboard">RETURN TO CHALLENGE DASHBOARD</button>`;
        
        this.container.innerHTML = `
            <div class="screen results-screen">
                <h2>🎉 STATION COMPLETE!</h2>
                <h3>${stationName}</h3>
                <div class="big-score">
                    <span class="big-number">${results.reps}</span>
                    <span class="big-label">REPS</span>
                </div>
                ${results.manualStop ? `<p class="manual-stop-note">Station ended manually — Elapsed: ${results.elapsedTime}s</p>` : ''}
                ${metricsHTML}
                <div class="form-actions station-result-actions">
                    ${actionsHTML}
                </div>
            </div>
        `;
        
        if (document.getElementById('btnFinalResults')) {
            document.getElementById('btnFinalResults').onclick = () => this.setState('FINAL_RESULTS');
        }
        if (document.getElementById('btnNextStation')) {
            document.getElementById('btnNextStation').onclick = () => {
                this.currentStation = isSTS ? 'seatedRow' : 'sitToStand';
                this.setState('INSTRUCTIONS');
            };
        }
        document.getElementById('btnDashboard').onclick = () => this.setState('CHALLENGE_DASHBOARD');
    }

    // ========== FINAL RESULTS ==========
    renderFinalResults() {
        const totalScore = (this.sitToStandResults?.reps || 0) + (this.seatedRowResults?.reps || 0);
        const sessionResult = this.results.buildSessionResult(
            this.participant, this.sitToStandResults, this.seatedRowResults
        );
        const profile = this.results.getFitnessProfile(sessionResult);
        const ageBand = this.results.getAgeBandComparison(this.participant.age, totalScore);
        
        this.container.innerHTML = `
            <div class="screen final-results-screen">
                <h2>SILVER HYROX HOME CHALLENGE</h2>
                <p class="congrats">Congratulations, ${this.participant.nickname}! 🏆</p>
                
                <div class="total-score-card">
                    <span class="total-label">TOTAL SCORE</span>
                    <span class="total-number">${totalScore}</span>
                    <span class="total-unit">REPS</span>
                </div>
                
                <div class="score-breakdown">
                    <div class="breakdown-row">
                        <span>Sit-to-Stand</span>
                        <span>${this.sitToStandResults?.reps || 0}</span>
                    </div>
                    <div class="breakdown-row">
                        <span>Seated Row</span>
                        <span>${this.seatedRowResults?.reps || 0}</span>
                    </div>
                    <div class="breakdown-row breakdown-total">
                        <span>TOTAL</span>
                        <span>${totalScore}</span>
                    </div>
                </div>
                
                <div class="final-station-cards">
                    <div class="final-station-card">
                        <h4>Station 1: Sit-to-Stand</h4>
                        <p>Reps: <strong>${this.sitToStandResults?.reps}</strong></p>
                        <p>Avg Rep Time: ${this.sitToStandResults?.averageRepTime}s</p>
                        <p>Fastest: ${this.sitToStandResults?.fastestRep}s</p>
                        <p>Tempo: ${this.sitToStandResults?.tempo} rpm</p>
                        <p>Consistency: ${this.sitToStandResults?.consistency}</p>
                        <p>Standing Extension: ${this.sitToStandResults?.averageStandingAngle}°</p>
                    </div>
                    <div class="final-station-card">
                        <h4>Station 2: Seated Row</h4>
                        <p>Reps: <strong>${this.seatedRowResults?.reps}</strong></p>
                        <p>Avg Rep Time: ${this.seatedRowResults?.averageRepTime}s</p>
                        <p>Fastest: ${this.seatedRowResults?.fastestRep}s</p>
                        <p>Avg Reach: ${this.seatedRowResults?.averageReach}× torso</p>
                        <p>Arm Symmetry: ${this.seatedRowResults?.armSymmetry}</p>
                        <p>Avg Torso Lean: ${this.seatedRowResults?.averageTorsoLean}°</p>
                        <p>Consistency: ${this.seatedRowResults?.consistency}</p>
                    </div>
                </div>
                
                <div class="performance-profile">
                    <h4>Silver HYROX Performance Profile</h4>
                    <div class="profile-dimension">
                        <span>Lower-Body Functional Endurance</span>
                        <span class="profile-level level-${profile.lowerBody.toLowerCase()}">${profile.lowerBody}</span>
                    </div>
                    <div class="profile-dimension">
                        <span>Upper-Body Movement Endurance</span>
                        <span class="profile-level level-${profile.upperBody.toLowerCase()}">${profile.upperBody}</span>
                    </div>
                    <div class="profile-dimension">
                        <span>Movement Consistency</span>
                        <span class="profile-level level-${profile.consistency.toLowerCase()}">${profile.consistency}</span>
                    </div>
                </div>
                
                ${ageBand.band ? `
                    <div class="age-band">
                        <p>Age Group: ${ageBand.band}</p>
                        <p>Your Challenge Score: ${totalScore} reps</p>
                        ${ageBand.hasReference ? `<p>Compared with reference: ${ageBand.comparison}</p>` : ''}
                    </div>
                ` : ''}
                
                <div class="form-actions">
                    <button class="btn btn-primary" id="btnSaveResults">SAVE RESULTS</button>
                    <button class="btn btn-secondary" id="btnNewChallenge">NEW CHALLENGE</button>
                    <button class="btn btn-link" id="btnViewHistory">View History</button>
                </div>
                
                <footer class="app-footer">
                    <p>An independent senior fitness challenge. Not affiliated with HYROX.</p>
                </footer>
            </div>
        `;
        
        document.getElementById('btnSaveResults').onclick = () => {
            const result = this.results.saveChallengeResult(sessionResult);
            if (result.success) {
                alert('Results saved!');
                document.getElementById('btnSaveResults').disabled = true;
                document.getElementById('btnSaveResults').textContent = '✓ SAVED';
            }
        };
        document.getElementById('btnNewChallenge').onclick = () => this.setState('HOME');
        document.getElementById('btnViewHistory').onclick = () => this.setState('HISTORY');
    }

    // ========== HISTORY ==========
    renderHistory() {
        const history = this.results.getHistory();
        
        let historyHTML = '';
        if (history.length === 0) {
            historyHTML = '<p class="empty-state">No saved results yet.</p>';
        } else {
            historyHTML = history.map((r, i) => `
                <div class="history-card">
                    <div class="history-header">
                        <strong>${r.participant.nickname}</strong>
                        <span>${new Date(r.timestamp).toLocaleDateString()}</span>
                    </div>
                    <div class="history-score">Total: ${r.totalScore} reps</div>
                    <div class="history-detail">STS: ${r.sitToStand?.reps || 0} | Row: ${r.seatedRow?.reps || 0}</div>
                    <button class="btn btn-link btn-small btn-delete" data-index="${i}">Delete</button>
                </div>
            `).join('');
        }

        this.container.innerHTML = `
            <div class="screen history-screen">
                <h2>Results History</h2>
                <div class="history-list">
                    ${historyHTML}
                </div>
                <div class="form-actions">
                    <button class="btn btn-secondary" id="btnBack">Back</button>
                    ${history.length > 0 ? '<button class="btn btn-danger btn-small" id="btnClearAll">Clear All</button>' : ''}
                </div>
            </div>
        `;
        
        document.getElementById('btnBack').onclick = () => this.setState('HOME');
        
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.onclick = () => {
                if (confirm('Delete this result?')) {
                    this.results.deleteResult(parseInt(btn.dataset.index));
                    this.renderHistory();
                }
            };
        });
        
        if (document.getElementById('btnClearAll')) {
            document.getElementById('btnClearAll').onclick = () => {
                if (confirm('Delete all saved results? This cannot be undone.')) {
                    this.results.clearHistory();
                    this.renderHistory();
                }
            };
        }
    }

    // ========== LEADERBOARD ==========
    showLeaderboard() {
        const leaderboard = this.results.getLeaderboard();
        
        let listHTML = '';
        if (leaderboard.length === 0) {
            listHTML = '<p class="empty-state">No entries yet. Complete a challenge to appear here!</p>';
        } else {
            listHTML = leaderboard.map((entry, i) => `
                <div class="leaderboard-entry ${i < 3 ? 'top-three' : ''}">
                    <span class="lb-rank">${i + 1}.</span>
                    <span class="lb-name">${entry.nickname}</span>
                    <span class="lb-score">${entry.totalScore}</span>
                </div>
            `).join('');
        }

        this.container.innerHTML = `
            <div class="screen leaderboard-screen">
                <h2>🏆 SILVER HYROX LEADERBOARD</h2>
                <div class="leaderboard-list">
                    ${listHTML}
                </div>
                <div class="form-actions">
                    <button class="btn btn-secondary" id="btnBack">Back</button>
                </div>
            </div>
        `;
        
        document.getElementById('btnBack').onclick = () => this.setState('HOME');
    }

    // ========== SOUND ==========
    getAudioContext() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.audioCtx;
    }

    playTone(frequency, duration) {
        if (!this.soundEnabled) return;
        try {
            const ctx = this.getAudioContext();
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + duration / 1000);
        } catch (e) {
            // Audio not available
        }
    }

    playRepSound() {
        this.playTone(CONFIG.sounds.repBeepFrequency, CONFIG.sounds.repBeepDuration);
    }

    playCountdownSound() {
        this.playTone(CONFIG.sounds.countdownFrequency, CONFIG.sounds.countdownDuration);
    }

    playGoSound() {
        this.playTone(CONFIG.sounds.goFrequency, CONFIG.sounds.goDuration);
    }

    playWarningSound() {
        this.playTone(CONFIG.sounds.warningFrequency, CONFIG.sounds.warningDuration);
    }

    playCompleteSound() {
        this.playTone(CONFIG.sounds.completeFrequency, CONFIG.sounds.completeDuration);
        setTimeout(() => this.playTone(1400, 300), 200);
        setTimeout(() => this.playTone(1600, 400), 400);
    }
}

// Initialize app
// Module scripts are deferred, so DOM is ready when this runs
const app = new App();
window.app = app; // expose for inline event handlers
