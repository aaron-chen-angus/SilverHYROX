/**
 * Silver HYROX Home Challenge - Seated Row Station
 * 
 * State machine for detecting and counting seated row repetitions.
 * Uses elbow angle, wrist displacement, and torso lean.
 * 
 * State flow: READY → FORWARD_REACH → ROW_BACK → READY
 * Rep counted on: return to READY after valid FORWARD_REACH + ROW_BACK
 * 
 * Philosophy: Simple and forgiving repetition detection.
 * If arms clearly move forward and are pulled back, count one rep.
 */

class SeatedRowStation {
    constructor() {
        this.reset();
    }

    reset() {
        // State machine
        this.state = 'READY';
        this.stateStartTime = 0;
        this.pendingState = null;
        this.pendingStateTime = 0;

        // Calibration
        this.isCalibrating = false;
        this.calibrationData = [];
        this.calibrationComplete = false;
        this.baseline = {
            elbowAngle: null,
            wristX: null,
            wristY: null,
            shoulderX: null,
            torsoAngle: null,
            torsoLength: null,
            wristToShoulderDist: null
        };

        // Counting
        this.repCount = 0;
        this.repTimes = [];
        this.currentRepStartTime = null;
        this.forwardReachDetected = false;

        // Metrics
        this.reachDistances = [];
        this.torsoLeanAngles = [];
        this.leftArmDisplacements = [];
        this.rightArmDisplacements = [];
        this.totalFrames = 0;

        // Timer
        this.testStartTime = null;
        this.testElapsed = 0;
        this.testRunning = false;
        this.testDuration = CONFIG.seatedRow.durationSeconds * 1000;

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
        this.state = 'READY';
    }

    /**
     * Process a frame during calibration
     */
    processCalibrationFrame(sideLandmarks) {
        if (!this.isCalibrating) return false;
        if (!sideLandmarks || !sideLandmarks.shoulder || !sideLandmarks.elbow || 
            !sideLandmarks.wrist || !sideLandmarks.hip) return false;

        const elbowAngle = PoseUtils.calculateAngle(
            sideLandmarks.shoulder, sideLandmarks.elbow, sideLandmarks.wrist
        );
        const wristX = sideLandmarks.wrist.x;
        const wristY = sideLandmarks.wrist.y;
        const shoulderX = sideLandmarks.shoulder.x;
        const torsoAngle = PoseUtils.angleFromVertical(sideLandmarks.shoulder, sideLandmarks.hip);
        const torsoLength = PoseUtils.torsoLength(sideLandmarks.shoulder, sideLandmarks.hip);
        const wristToShoulderDist = PoseUtils.horizontalDistance(sideLandmarks.wrist, sideLandmarks.shoulder);

        this.calibrationData.push({
            elbowAngle, wristX, wristY, shoulderX,
            torsoAngle, torsoLength, wristToShoulderDist
        });

        // ~2 seconds at 15fps
        if (this.calibrationData.length >= 30) {
            this.finalizeCalibration();
            return true;
        }
        return false;
    }

    /**
     * Finalize calibration
     */
    finalizeCalibration() {
        if (this.calibrationData.length === 0) return;

        const avg = (arr, key) => arr.reduce((s, d) => s + (d[key] || 0), 0) / arr.length;

        this.baseline.elbowAngle = avg(this.calibrationData, 'elbowAngle');
        this.baseline.wristX = avg(this.calibrationData, 'wristX');
        this.baseline.wristY = avg(this.calibrationData, 'wristY');
        this.baseline.shoulderX = avg(this.calibrationData, 'shoulderX');
        this.baseline.torsoAngle = avg(this.calibrationData, 'torsoAngle');
        this.baseline.torsoLength = avg(this.calibrationData, 'torsoLength');
        this.baseline.wristToShoulderDist = avg(this.calibrationData, 'wristToShoulderDist');

        this.isCalibrating = false;
        this.calibrationComplete = true;
        this.state = 'READY';
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
        this.state = 'READY';
        this.forwardReachDetected = false;
    }

    /**
     * Stop the test
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
        if (!sideLandmarks || !sideLandmarks.shoulder || !sideLandmarks.elbow || 
            !sideLandmarks.wrist || !sideLandmarks.hip) return;

        const now = performance.now();
        this.testElapsed = now - this.testStartTime;

        // Check time
        if (this.testElapsed >= this.testDuration) {
            this.stopTest();
            return;
        }

        this.totalFrames++;

        // Calculate metrics
        const elbowAngle = PoseUtils.calculateAngle(
            sideLandmarks.shoulder, sideLandmarks.elbow, sideLandmarks.wrist
        );
        const torsoAngle = PoseUtils.angleFromVertical(sideLandmarks.shoulder, sideLandmarks.hip);
        const torsoLength = this.baseline.torsoLength || PoseUtils.torsoLength(sideLandmarks.shoulder, sideLandmarks.hip);

        // Wrist-to-shoulder horizontal distance (normalized by torso length)
        const wristToShoulderDist = PoseUtils.horizontalDistance(sideLandmarks.wrist, sideLandmarks.shoulder);
        const normalizedReach = wristToShoulderDist / (torsoLength || 0.3);

        // Forward displacement from baseline (normalized)
        const baselineReach = this.baseline.wristToShoulderDist / (torsoLength || 0.3);
        const forwardDisplacement = normalizedReach - baselineReach;

        // Track symmetry if both arms visible
        if (allLandmarks) {
            this.trackArmSymmetry(allLandmarks, torsoLength);
        }

        // Debug data
        this.debugData = {
            elbowAngle: elbowAngle?.toFixed(1),
            wristToShoulderDist: wristToShoulderDist?.toFixed(3),
            normalizedReach: normalizedReach?.toFixed(3),
            forwardDisplacement: forwardDisplacement?.toFixed(3),
            torsoAngle: torsoAngle?.toFixed(1),
            state: this.state,
            repCount: this.repCount,
            forwardReachDetected: this.forwardReachDetected,
            baselineReach: baselineReach?.toFixed(3)
        };

        // State machine
        this.updateStateMachine(elbowAngle, forwardDisplacement, torsoAngle, normalizedReach, now);
    }

    /**
     * Update state machine
     */
    updateStateMachine(elbowAngle, forwardDisplacement, torsoAngle, normalizedReach, now) {
        if (elbowAngle === null) return;

        let newState = this.state;

        switch (this.state) {
            case 'READY':
                // Transition to FORWARD_REACH when wrists move forward
                if (forwardDisplacement >= CONFIG.seatedRow.forwardReachTorsoRatio) {
                    newState = 'FORWARD_REACH';
                    this.forwardReachDetected = true;
                    // Track reach distance
                    this.reachDistances.push(normalizedReach);
                    // Track torso lean
                    this.torsoLeanAngles.push(torsoAngle);
                }
                break;

            case 'FORWARD_REACH':
                // Track max reach
                if (normalizedReach > (this.reachDistances[this.reachDistances.length - 1] || 0)) {
                    this.reachDistances[this.reachDistances.length - 1] = normalizedReach;
                }
                // Track max torso lean for this rep
                if (torsoAngle > (this.torsoLeanAngles[this.torsoLeanAngles.length - 1] || 0)) {
                    this.torsoLeanAngles[this.torsoLeanAngles.length - 1] = torsoAngle;
                }

                // Transition to ROW_BACK when wrists start returning
                if (forwardDisplacement < CONFIG.seatedRow.forwardReachTorsoRatio * 0.6) {
                    newState = 'ROW_BACK';
                }
                break;

            case 'ROW_BACK':
                // Transition to READY when wrists return near baseline
                if (forwardDisplacement <= CONFIG.seatedRow.returnTolerance) {
                    newState = 'READY';
                    // Count the rep
                    if (this.forwardReachDetected) {
                        this.countRep(now);
                        this.forwardReachDetected = false;
                    }
                }
                // If reaching forward again before completing return
                if (forwardDisplacement >= CONFIG.seatedRow.forwardReachTorsoRatio) {
                    newState = 'FORWARD_REACH';
                    this.reachDistances.push(normalizedReach);
                    this.torsoLeanAngles.push(torsoAngle);
                }
                break;
        }

        // Apply state persistence (temporal confirmation)
        if (newState !== this.state) {
            if (this.pendingState === newState) {
                if (now - this.pendingStateTime >= CONFIG.seatedRow.statePersistenceMs) {
                    this.state = newState;
                    this.stateStartTime = now;
                    this.pendingState = null;
                }
            } else {
                this.pendingState = newState;
                this.pendingStateTime = now;
            }
        } else {
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
     * Track arm symmetry between left and right sides
     */
    trackArmSymmetry(allLandmarks, torsoLength) {
        const L = CONFIG.landmarks;
        const leftWrist = allLandmarks[L.LEFT_WRIST];
        const rightWrist = allLandmarks[L.RIGHT_WRIST];
        const leftShoulder = allLandmarks[L.LEFT_SHOULDER];
        const rightShoulder = allLandmarks[L.RIGHT_SHOULDER];

        if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder) return;
        if (leftWrist.visibility < 0.4 || rightWrist.visibility < 0.4) return;

        const leftDist = PoseUtils.horizontalDistance(leftWrist, leftShoulder) / (torsoLength || 0.3);
        const rightDist = PoseUtils.horizontalDistance(rightWrist, rightShoulder) / (torsoLength || 0.3);

        this.leftArmDisplacements.push(leftDist);
        this.rightArmDisplacements.push(rightDist);
    }

    /**
     * Get current results
     */
    getResults() {
        const elapsed = this.testElapsed / 1000;
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

        // Consistency
        let consistency = 'N/A';
        if (this.repTimes.length >= 3) {
            const mean = this.repTimes.reduce((a, b) => a + b, 0) / this.repTimes.length;
            const variance = this.repTimes.reduce((sum, t) => sum + (t - mean) ** 2, 0) / this.repTimes.length;
            const cv = Math.sqrt(variance) / mean;
            if (cv < 0.15) consistency = 'Excellent';
            else if (cv < 0.30) consistency = 'Good';
            else consistency = 'Variable';
        }

        // Average forward reach (normalized to torso length)
        const avgReach = this.reachDistances.length > 0
            ? this.reachDistances.reduce((a, b) => a + b, 0) / this.reachDistances.length
            : 0;

        // Average torso lean
        const avgTorsoLean = this.torsoLeanAngles.length > 0
            ? this.torsoLeanAngles.reduce((a, b) => a + b, 0) / this.torsoLeanAngles.length
            : 0;

        // Arm symmetry
        let armSymmetry = 'N/A';
        if (this.leftArmDisplacements.length >= 10 && this.rightArmDisplacements.length >= 10) {
            const avgLeft = this.leftArmDisplacements.reduce((a, b) => a + b, 0) / this.leftArmDisplacements.length;
            const avgRight = this.rightArmDisplacements.reduce((a, b) => a + b, 0) / this.rightArmDisplacements.length;
            const maxDisp = Math.max(avgLeft, avgRight);
            if (maxDisp > 0) {
                const symmetryValue = (1 - Math.abs(avgLeft - avgRight) / maxDisp) * 100;
                armSymmetry = `${symmetryValue.toFixed(0)}%`;
            }
        }

        return {
            completed: true,
            reps,
            elapsedTime: elapsed.toFixed(1),
            averageRepTime: avgRepTime.toFixed(2),
            fastestRep: fastestRep.toFixed(2),
            slowestRep: slowestRep.toFixed(2),
            consistency,
            averageReach: avgReach.toFixed(2),
            averageTorsoLean: avgTorsoLean.toFixed(1),
            armSymmetry,
            manualStop: this.testElapsed < this.testDuration
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
