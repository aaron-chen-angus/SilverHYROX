/**
 * Silver HYROX Home Challenge - Sit-to-Stand Station
 * 
 * State machine for detecting and counting sit-to-stand repetitions.
 * Uses knee angle, hip angle, hip height, and torso orientation.
 * 
 * State flow: WAITING → SEATED → RISING → STANDING → LOWERING → SEATED
 * Rep counted on: STANDING → LOWERING → SEATED (return to seated after standing)
 */

class SitToStandStation {
    constructor() {
        this.reset();
    }

    reset() {
        // State machine
        this.state = 'WAITING';
        this.stateStartTime = 0;
        this.stateConfirmed = false;
        this.pendingState = null;
        this.pendingStateTime = 0;

        // Calibration
        this.isCalibrating = false;
        this.calibrationData = [];
        this.calibrationComplete = false;
        this.baseline = {
            kneeAngle: null,
            hipAngle: null,
            hipHeight: null,
            torsoAngle: null,
            torsoLength: null
        };

        // Counting
        this.repCount = 0;
        this.repTimes = [];
        this.lastRepTime = null;
        this.currentRepStartTime = null;

        // Metrics
        this.maxKneeAngles = [];
        this.armsCrossedFrames = 0;
        this.totalFrames = 0;
        this.hipDisplacements = [];
        this.repDurations = [];

        // Timer
        this.testStartTime = null;
        this.testElapsed = 0;
        this.testRunning = false;
        this.testDuration = CONFIG.sitToStand.durationSeconds * 1000;

        // Debug data
        this.debugData = {};
    }

    /**
     * Start calibration phase
     */
    startCalibration() {
        this.isCalibrating = true;
        this.calibrationData = [];
        this.calibrationComplete = false;
        this.state = 'WAITING';
    }

    /**
     * Process a pose frame during calibration
     */
    processCalibrationFrame(sideLandmarks) {
        if (!this.isCalibrating) return false;
        if (!sideLandmarks || !sideLandmarks.hip || !sideLandmarks.knee || !sideLandmarks.ankle) return false;

        const kneeAngle = PoseUtils.calculateAngle(
            sideLandmarks.hip, sideLandmarks.knee, sideLandmarks.ankle
        );
        const hipAngle = PoseUtils.calculateAngle(
            sideLandmarks.shoulder, sideLandmarks.hip, sideLandmarks.knee
        );
        const hipHeight = sideLandmarks.hip.y;
        const torsoAngle = PoseUtils.angleFromVertical(sideLandmarks.shoulder, sideLandmarks.hip);
        const torsoLength = PoseUtils.torsoLength(sideLandmarks.shoulder, sideLandmarks.hip);

        this.calibrationData.push({ kneeAngle, hipAngle, hipHeight, torsoAngle, torsoLength });

        // Check if calibration duration reached
        if (this.calibrationData.length >= 30) { // ~2 seconds at 15fps
            this.finalizeCalibration();
            return true;
        }
        return false;
    }

    /**
     * Finalize calibration - compute baseline values
     */
    finalizeCalibration() {
        if (this.calibrationData.length === 0) return;

        const avg = (arr, key) => arr.reduce((s, d) => s + (d[key] || 0), 0) / arr.length;

        this.baseline.kneeAngle = avg(this.calibrationData, 'kneeAngle');
        this.baseline.hipAngle = avg(this.calibrationData, 'hipAngle');
        this.baseline.hipHeight = avg(this.calibrationData, 'hipHeight');
        this.baseline.torsoAngle = avg(this.calibrationData, 'torsoAngle');
        this.baseline.torsoLength = avg(this.calibrationData, 'torsoLength');

        this.isCalibrating = false;
        this.calibrationComplete = true;
        this.state = 'SEATED';
        this.stateStartTime = performance.now();
    }

    /**
     * Start the 30-second test
     */
    startTest() {
        this.testStartTime = performance.now();
        this.testRunning = true;
        this.repCount = 0;
        this.repTimes = [];
        this.currentRepStartTime = performance.now();
        this.state = 'SEATED';
        this.stateStartTime = performance.now();
    }

    /**
     * Stop the test (manual or timer)
     */
    stopTest() {
        this.testRunning = false;
        this.testElapsed = performance.now() - this.testStartTime;
    }

    /**
     * Process a frame during active test
     */
    processFrame(sideLandmarks, allLandmarks) {
        if (!this.testRunning) return;
        if (!sideLandmarks || !sideLandmarks.hip || !sideLandmarks.knee || !sideLandmarks.ankle) return;

        const now = performance.now();
        this.testElapsed = now - this.testStartTime;

        // Check if time is up
        if (this.testElapsed >= this.testDuration) {
            this.stopTest();
            return;
        }

        this.totalFrames++;

        // Calculate current metrics
        const kneeAngle = PoseUtils.calculateAngle(
            sideLandmarks.hip, sideLandmarks.knee, sideLandmarks.ankle
        );
        const hipAngle = PoseUtils.calculateAngle(
            sideLandmarks.shoulder, sideLandmarks.hip, sideLandmarks.knee
        );
        const hipHeight = sideLandmarks.hip.y;
        const torsoAngle = PoseUtils.angleFromVertical(sideLandmarks.shoulder, sideLandmarks.hip);

        // Hip rise from baseline (negative = higher on screen = standing up)
        const hipRise = this.baseline.hipHeight - hipHeight;
        const hipRiseNormalized = hipRise / (this.baseline.torsoLength || 0.3);

        // Check arms crossed compliance
        if (allLandmarks) {
            this.checkArmsCrossed(allLandmarks, sideLandmarks);
        }

        // Update debug data
        this.debugData = {
            kneeAngle: kneeAngle?.toFixed(1),
            hipAngle: hipAngle?.toFixed(1),
            hipHeight: hipHeight?.toFixed(3),
            hipRise: hipRiseNormalized?.toFixed(3),
            torsoAngle: torsoAngle?.toFixed(1),
            state: this.state,
            repCount: this.repCount,
            baselineKnee: this.baseline.kneeAngle?.toFixed(1),
            baselineHip: this.baseline.hipHeight?.toFixed(3)
        };

        // State machine logic
        this.updateStateMachine(kneeAngle, hipAngle, hipRiseNormalized, torsoAngle, now);
    }

    /**
     * Update the state machine based on current metrics
     */
    updateStateMachine(kneeAngle, hipAngle, hipRiseNormalized, torsoAngle, now) {
        if (kneeAngle === null) return;

        let newState = this.state;

        switch (this.state) {
            case 'SEATED':
                // Transition to RISING: knee begins to extend, hip starts rising
                if (kneeAngle > this.baseline.kneeAngle + 15 && hipRiseNormalized > 0.05) {
                    newState = 'RISING';
                }
                break;

            case 'RISING':
                // Transition to STANDING: knee sufficiently extended, hip elevated
                if (kneeAngle >= CONFIG.sitToStand.standingKneeAngleMin && 
                    hipRiseNormalized >= CONFIG.sitToStand.hipRiseThreshold) {
                    newState = 'STANDING';
                }
                // Fall back to SEATED if movement reverses
                if (kneeAngle <= this.baseline.kneeAngle + 5 && hipRiseNormalized < 0.03) {
                    newState = 'SEATED';
                }
                break;

            case 'STANDING':
                // Track max knee angle for this rep
                this.maxKneeAngles.push(kneeAngle);
                // Track hip displacement
                this.hipDisplacements.push(hipRiseNormalized);
                
                // Transition to LOWERING: knee begins to flex, hip drops
                if (kneeAngle < CONFIG.sitToStand.standingKneeAngleMin - 10 && 
                    hipRiseNormalized < CONFIG.sitToStand.hipRiseThreshold * 0.8) {
                    newState = 'LOWERING';
                }
                break;

            case 'LOWERING':
                // Transition to SEATED: return to seated position
                if (kneeAngle <= CONFIG.sitToStand.seatedKneeAngleMax && 
                    hipRiseNormalized < 0.05) {
                    newState = 'SEATED';
                    // Count the rep!
                    this.countRep(now);
                }
                // If rising again without reaching seated
                if (kneeAngle >= CONFIG.sitToStand.standingKneeAngleMin && 
                    hipRiseNormalized >= CONFIG.sitToStand.hipRiseThreshold) {
                    newState = 'STANDING';
                }
                break;
        }

        // Apply state persistence (temporal confirmation)
        if (newState !== this.state) {
            if (this.pendingState === newState) {
                // Check if pending state has persisted long enough
                if (now - this.pendingStateTime >= CONFIG.sitToStand.statePersistenceMs) {
                    this.state = newState;
                    this.stateStartTime = now;
                    this.pendingState = null;
                }
            } else {
                // New pending state
                this.pendingState = newState;
                this.pendingStateTime = now;
            }
        } else {
            // State unchanged, clear pending
            this.pendingState = null;
        }
    }

    /**
     * Count a valid repetition
     */
    countRep(now) {
        this.repCount++;
        
        const repTime = now - this.currentRepStartTime;
        this.repTimes.push(repTime);
        this.currentRepStartTime = now;
    }

    /**
     * Check if arms are crossed
     */
    checkArmsCrossed(allLandmarks, sideLandmarks) {
        const L = CONFIG.landmarks;
        const leftWrist = allLandmarks[L.LEFT_WRIST];
        const rightWrist = allLandmarks[L.RIGHT_WRIST];
        const leftShoulder = allLandmarks[L.LEFT_SHOULDER];
        const rightShoulder = allLandmarks[L.RIGHT_SHOULDER];

        if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder) return;

        // Check if wrists are near the torso center (crossed position)
        const torsoCenter = {
            x: (leftShoulder.x + rightShoulder.x) / 2,
            y: (leftShoulder.y + rightShoulder.y) / 2
        };

        const leftDist = PoseUtils.distance(leftWrist, torsoCenter);
        const rightDist = PoseUtils.distance(rightWrist, torsoCenter);
        const threshold = CONFIG.sitToStand.armsCrossedThreshold * (this.baseline.torsoLength || 0.3);

        if (leftDist < threshold && rightDist < threshold) {
            this.armsCrossedFrames++;
        }
    }

    /**
     * Get current results
     */
    getResults() {
        const elapsed = this.testElapsed / 1000; // seconds
        const reps = this.repCount;

        // Average rep time
        const avgRepTime = this.repTimes.length > 0
            ? this.repTimes.reduce((a, b) => a + b, 0) / this.repTimes.length / 1000
            : 0;

        // Fastest and slowest
        const fastestRep = this.repTimes.length > 0
            ? Math.min(...this.repTimes) / 1000
            : 0;
        const slowestRep = this.repTimes.length > 0
            ? Math.max(...this.repTimes) / 1000
            : 0;

        // Consistency (coefficient of variation)
        let consistency = 'N/A';
        if (this.repTimes.length >= 3) {
            const mean = this.repTimes.reduce((a, b) => a + b, 0) / this.repTimes.length;
            const variance = this.repTimes.reduce((sum, t) => sum + (t - mean) ** 2, 0) / this.repTimes.length;
            const cv = Math.sqrt(variance) / mean;
            if (cv < 0.15) consistency = 'Excellent';
            else if (cv < 0.30) consistency = 'Good';
            else consistency = 'Variable';
        }

        // Average standing extension
        const avgStandingAngle = this.maxKneeAngles.length > 0
            ? this.maxKneeAngles.reduce((a, b) => a + b, 0) / this.maxKneeAngles.length
            : 0;

        // Arms compliance
        const armCompliance = this.totalFrames > 0
            ? (this.armsCrossedFrames / this.totalFrames * 100).toFixed(0)
            : 0;

        // Movement tempo (reps per minute)
        const tempo = elapsed > 0 ? (reps / elapsed * 60).toFixed(1) : 0;

        // Rise Speed Index
        const avgHipDisplacement = this.hipDisplacements.length > 0
            ? this.hipDisplacements.reduce((a, b) => a + b, 0) / this.hipDisplacements.length
            : 0;
        const riseSpeedIndex = avgRepTime > 0 ? (avgHipDisplacement / avgRepTime).toFixed(3) : 0;

        return {
            completed: true,
            reps,
            elapsedTime: elapsed.toFixed(1),
            averageRepTime: avgRepTime.toFixed(2),
            fastestRep: fastestRep.toFixed(2),
            slowestRep: slowestRep.toFixed(2),
            consistency,
            averageStandingAngle: avgStandingAngle.toFixed(1),
            armCompliance: `${armCompliance}%`,
            tempo,
            riseSpeedIndex,
            manualStop: this.testElapsed < this.testDuration
        };
    }

    /**
     * Get quality summary
     */
    getQualitySummary() {
        const results = this.getResults();
        
        // Standing completion
        const avgAngle = parseFloat(results.averageStandingAngle);
        let standingCompletion = 'Strong';
        if (avgAngle < 140) standingCompletion = 'Good';
        if (avgAngle < 120) standingCompletion = 'Developing';

        // Tempo consistency
        let tempoConsistency = results.consistency;

        // Arm position
        const compliance = parseInt(results.armCompliance);
        let armPosition = 'Strong';
        if (compliance < 80) armPosition = 'Good';
        if (compliance < 60) armPosition = 'Developing';

        return {
            standingCompletion,
            tempoConsistency,
            armPosition
        };
    }

    /**
     * Get time remaining
     */
    getTimeRemaining() {
        if (!this.testRunning) return 0;
        const remaining = (this.testDuration - this.testElapsed) / 1000;
        return Math.max(0, remaining);
    }

    /**
     * Check if test is complete
     */
    isComplete() {
        return !this.testRunning && this.testElapsed >= this.testDuration;
    }
}
