/**
 * Silver HYROX Home Challenge - Seated Row Station
 * 
 * SIMPLE DETECTION:
 * - Track wrist X position
 * - "Forward" = wrist moves away from baseline by any noticeable amount
 * - "Back" = wrist returns near baseline
 * - One rep = forward + back
 * 
 * No body lean checks. No strict form enforcement.
 * If hands move forward and come back, that's a rep.
 */

class SeatedRowStation {
    constructor() {
        this.reset();
    }

    reset() {
        this.state = 'READY'; // READY, FORWARD
        this.isCalibrating = false;
        this.calibrationComplete = false;
        this.calibrationData = [];

        // Baseline (arms at rest beside body)
        this.baseline = { wristX: null, torsoLength: null };

        // Detection
        this.repCount = 0;
        this.repTimes = [];
        this.currentRepStartTime = null;
        this.maxReachThisRep = 0;
        this.reachDistances = [];

        // Temporal persistence
        this.pendingState = null;
        this.pendingStateTime = 0;

        // Timer
        this.testStartTime = null;
        this.testElapsed = 0;
        this.testRunning = false;
        this.testDuration = CONFIG.seatedRow.durationSeconds * 1000;

        // Debug
        this.debugData = {};
    }

    startCalibration() {
        this.isCalibrating = true;
        this.calibrationData = [];
        this.calibrationComplete = false;
    }

    processCalibrationFrame(sideLandmarks) {
        if (!this.isCalibrating) return false;
        if (!sideLandmarks || !sideLandmarks.wrist || !sideLandmarks.shoulder || !sideLandmarks.hip) return false;

        const torsoLength = Math.abs(sideLandmarks.hip.y - sideLandmarks.shoulder.y);
        this.calibrationData.push({
            wristX: sideLandmarks.wrist.x,
            torsoLength: torsoLength
        });

        if (this.calibrationData.length >= 30) {
            this.finalizeCalibration();
            return true;
        }
        return false;
    }

    finalizeCalibration() {
        const avg = (arr, key) => arr.reduce((s, d) => s + d[key], 0) / arr.length;
        this.baseline.wristX = avg(this.calibrationData, 'wristX');
        this.baseline.torsoLength = avg(this.calibrationData, 'torsoLength');
        this.isCalibrating = false;
        this.calibrationComplete = true;
        this.state = 'READY';
    }

    startTest() {
        this.testStartTime = performance.now();
        this.testRunning = true;
        this.repCount = 0;
        this.repTimes = [];
        this.reachDistances = [];
        this.currentRepStartTime = performance.now();
        this.state = 'READY';
        this.maxReachThisRep = 0;
    }

    stopTest() {
        this.testRunning = false;
        this.testElapsed = performance.now() - this.testStartTime;
    }

    processFrame(sideLandmarks, allLandmarks) {
        if (!this.testRunning) return;
        if (!sideLandmarks || !sideLandmarks.wrist) return;

        const now = performance.now();
        this.testElapsed = now - this.testStartTime;
        if (this.testElapsed >= this.testDuration) { this.stopTest(); return; }

        const wristX = sideLandmarks.wrist.x;

        // Displacement from baseline (absolute value — direction doesn't matter)
        const displacement = Math.abs(wristX - this.baseline.wristX);
        const normalizedDisplacement = displacement / (this.baseline.torsoLength || 0.25);

        // Very lenient thresholds:
        // Forward = wrist moved 12% of torso length from baseline
        // Return = wrist within 8% of baseline
        const forwardThreshold = CONFIG.seatedRow.forwardReachTorsoRatio;
        const returnThreshold = CONFIG.seatedRow.returnTolerance;

        this.debugData = {
            wristX: wristX.toFixed(3),
            baseline: this.baseline.wristX?.toFixed(3),
            displacement: normalizedDisplacement.toFixed(3),
            fwdThresh: forwardThreshold,
            retThresh: returnThreshold,
            state: this.state,
            reps: this.repCount
        };

        // State machine
        let newState = this.state;

        if (this.state === 'READY') {
            if (normalizedDisplacement >= forwardThreshold) {
                newState = 'FORWARD';
                this.maxReachThisRep = normalizedDisplacement;
            }
        } else if (this.state === 'FORWARD') {
            // Track max reach
            if (normalizedDisplacement > this.maxReachThisRep) {
                this.maxReachThisRep = normalizedDisplacement;
            }
            // Return detected
            if (normalizedDisplacement <= returnThreshold) {
                newState = 'READY';
            }
        }

        // Temporal persistence (short — 120ms)
        if (newState !== this.state) {
            if (this.pendingState === newState) {
                if (now - this.pendingStateTime >= CONFIG.seatedRow.statePersistenceMs) {
                    const prevState = this.state;
                    this.state = newState;
                    this.pendingState = null;

                    // Count rep: FORWARD → READY
                    if (prevState === 'FORWARD' && newState === 'READY') {
                        this.repCount++;
                        const repTime = now - this.currentRepStartTime;
                        this.repTimes.push(repTime);
                        this.reachDistances.push(this.maxReachThisRep);
                        this.currentRepStartTime = now;
                        this.maxReachThisRep = 0;
                    }
                }
            } else {
                this.pendingState = newState;
                this.pendingStateTime = now;
            }
        } else {
            this.pendingState = null;
        }
    }

    getResults() {
        const elapsed = this.testElapsed / 1000;
        const reps = this.repCount;
        const avgRepTime = this.repTimes.length > 0 ? this.repTimes.reduce((a,b) => a+b, 0) / this.repTimes.length / 1000 : 0;
        const fastestRep = this.repTimes.length > 0 ? Math.min(...this.repTimes) / 1000 : 0;
        const slowestRep = this.repTimes.length > 0 ? Math.max(...this.repTimes) / 1000 : 0;

        let consistency = 'N/A';
        if (this.repTimes.length >= 3) {
            const mean = this.repTimes.reduce((a,b) => a+b, 0) / this.repTimes.length;
            const variance = this.repTimes.reduce((sum, t) => sum + (t-mean)**2, 0) / this.repTimes.length;
            const cv = Math.sqrt(variance) / mean;
            consistency = cv < 0.15 ? 'Excellent' : cv < 0.30 ? 'Good' : 'Variable';
        }

        const avgReach = this.reachDistances.length > 0
            ? this.reachDistances.reduce((a,b) => a+b, 0) / this.reachDistances.length : 0;

        return {
            completed: true, reps, elapsedTime: elapsed.toFixed(1),
            averageRepTime: avgRepTime.toFixed(2), fastestRep: fastestRep.toFixed(2),
            slowestRep: slowestRep.toFixed(2), consistency,
            averageReach: avgReach.toFixed(2),
            manualStop: this.testElapsed < this.testDuration
        };
    }

    getTimeRemaining() {
        if (!this.testRunning) return 0;
        return Math.max(0, (this.testDuration - this.testElapsed) / 1000);
    }

    isComplete() {
        return !this.testRunning && this.testElapsed >= this.testDuration;
    }
}
