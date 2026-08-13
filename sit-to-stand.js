/**
 * Silver HYROX Home Challenge - Sit-to-Stand Station
 * 
 * SIMPLIFIED DETECTION:
 * - Track shoulder Y position (goes UP when standing, DOWN when sitting)
 * - Track hip Y position as secondary confirmation
 * - State machine: SEATED → STANDING → SEATED = 1 rep
 * - Temporal persistence prevents jitter
 * 
 * In screen coordinates: Y=0 is top, Y=1 is bottom.
 * So standing = shoulder.y goes LOWER (toward 0).
 */

class SitToStandStation {
    constructor() {
        this.reset();
    }

    reset() {
        this.state = 'WAITING'; // WAITING, SEATED, STANDING
        this.isCalibrating = false;
        this.calibrationComplete = false;
        this.calibrationData = [];
        
        // Baseline (seated position)
        this.baseline = { shoulderY: null, hipY: null };
        
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
        this.testDuration = CONFIG.sitToStand.durationSeconds * 1000;
        
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
        if (!sideLandmarks || !sideLandmarks.shoulder || !sideLandmarks.hip) return false;

        this.calibrationData.push({
            shoulderY: sideLandmarks.shoulder.y,
            hipY: sideLandmarks.hip.y
        });

        // ~2 seconds worth of frames
        if (this.calibrationData.length >= 30) {
            this.finalizeCalibration();
            return true;
        }
        return false;
    }

    finalizeCalibration() {
        const avg = (arr, key) => arr.reduce((s, d) => s + d[key], 0) / arr.length;
        this.baseline.shoulderY = avg(this.calibrationData, 'shoulderY');
        this.baseline.hipY = avg(this.calibrationData, 'hipY');
        this.isCalibrating = false;
        this.calibrationComplete = true;
        this.state = 'SEATED';
    }

    startTest() {
        this.testStartTime = performance.now();
        this.testRunning = true;
        this.repCount = 0;
        this.repTimes = [];
        this.currentRepStartTime = performance.now();
        this.state = 'SEATED';
    }

    stopTest() {
        this.testRunning = false;
        this.testElapsed = performance.now() - this.testStartTime;
    }

    processFrame(sideLandmarks, allLandmarks) {
        if (!this.testRunning) return;
        if (!sideLandmarks || !sideLandmarks.shoulder || !sideLandmarks.hip) return;

        const now = performance.now();
        this.testElapsed = now - this.testStartTime;
        if (this.testElapsed >= this.testDuration) { this.stopTest(); return; }

        const shoulderY = sideLandmarks.shoulder.y;
        const hipY = sideLandmarks.hip.y;

        // How much has shoulder risen from seated baseline?
        // Positive = risen (in screen coords, risen means Y decreased)
        const shoulderRise = this.baseline.shoulderY - shoulderY;
        const hipRise = this.baseline.hipY - hipY;

        // Threshold: shoulder needs to rise by at least 15% of the distance
        // between baseline shoulder and hip (roughly torso length)
        const torsoLength = Math.abs(this.baseline.hipY - this.baseline.shoulderY);
        const riseThreshold = torsoLength * CONFIG.sitToStand.hipRiseThreshold;

        this.debugData = {
            shoulderY: shoulderY.toFixed(3),
            hipY: hipY.toFixed(3),
            shoulderRise: shoulderRise.toFixed(3),
            hipRise: hipRise.toFixed(3),
            riseThreshold: riseThreshold.toFixed(3),
            torsoLength: torsoLength.toFixed(3),
            state: this.state,
            repCount: this.repCount
        };

        // Simple state machine
        let newState = this.state;

        if (this.state === 'SEATED') {
            // Transition to STANDING when shoulder rises significantly
            if (shoulderRise > riseThreshold && hipRise > riseThreshold * 0.5) {
                newState = 'STANDING';
            }
        } else if (this.state === 'STANDING') {
            // Transition back to SEATED when shoulder drops back near baseline
            if (shoulderRise < riseThreshold * 0.4) {
                newState = 'SEATED';
            }
        }

        // Temporal persistence
        if (newState !== this.state) {
            if (this.pendingState === newState) {
                if (now - this.pendingStateTime >= CONFIG.sitToStand.statePersistenceMs) {
                    // State confirmed - apply transition
                    const prevState = this.state;
                    this.state = newState;
                    this.pendingState = null;

                    // Count rep: STANDING → SEATED
                    if (prevState === 'STANDING' && newState === 'SEATED') {
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
