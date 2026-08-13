/**
 * Silver HYROX Home Challenge - Seated Row Station
 * 
 * SIMPLIFIED DETECTION:
 * - Track wrist position relative to shoulder (horizontal distance)
 * - Forward reach = wrist moves forward from baseline
 * - Row back = wrist returns to near baseline
 * - State: READY → FORWARD → READY = 1 rep
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
        this.baseline = { wristX: null, shoulderX: null, torsoLength: null };

        // Detection
        this.repCount = 0;
        this.repTimes = [];
        this.currentRepStartTime = null;

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
            shoulderX: sideLandmarks.shoulder.x,
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
        this.baseline.shoulderX = avg(this.calibrationData, 'shoulderX');
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
        this.currentRepStartTime = performance.now();
        this.state = 'READY';
    }

    stopTest() {
        this.testRunning = false;
        this.testElapsed = performance.now() - this.testStartTime;
    }

    processFrame(sideLandmarks, allLandmarks) {
        if (!this.testRunning) return;
        if (!sideLandmarks || !sideLandmarks.wrist || !sideLandmarks.shoulder) return;

        const now = performance.now();
        this.testElapsed = now - this.testStartTime;
        if (this.testElapsed >= this.testDuration) { this.stopTest(); return; }

        const wristX = sideLandmarks.wrist.x;
        const shoulderX = sideLandmarks.shoulder.x;

        // How far wrist has moved from baseline (normalized by torso length)
        const wristDisplacement = Math.abs(wristX - this.baseline.wristX);
        const normalizedDisplacement = wristDisplacement / (this.baseline.torsoLength || 0.3);

        const forwardThreshold = CONFIG.seatedRow.forwardReachTorsoRatio;
        const returnThreshold = CONFIG.seatedRow.returnTolerance;

        this.debugData = {
            wristX: wristX.toFixed(3),
            baseline: this.baseline.wristX.toFixed(3),
            displacement: normalizedDisplacement.toFixed(3),
            forwardThreshold: forwardThreshold.toFixed(3),
            state: this.state,
            repCount: this.repCount
        };

        // Simple state machine
        let newState = this.state;

        if (this.state === 'READY') {
            // Wrist moves forward past threshold
            if (normalizedDisplacement >= forwardThreshold) {
                newState = 'FORWARD';
            }
        } else if (this.state === 'FORWARD') {
            // Wrist returns near baseline
            if (normalizedDisplacement <= returnThreshold) {
                newState = 'READY';
            }
        }

        // Temporal persistence
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
                        this.currentRepStartTime = now;
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

        return {
            completed: true, reps, elapsedTime: elapsed.toFixed(1),
            averageRepTime: avgRepTime.toFixed(2), fastestRep: fastestRep.toFixed(2),
            slowestRep: slowestRep.toFixed(2), consistency,
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
