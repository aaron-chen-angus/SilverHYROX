/**
 * Silver HYROX Home Challenge - Pose Engine
 * 
 * Handles MediaPipe Pose Landmarker initialization, camera setup,
 * landmark processing, side detection, and skeleton overlay rendering.
 */

class PoseEngine {
    constructor() {
        this.poseLandmarker = null;
        this.videoElement = null;
        this.canvasElement = null;
        this.canvasCtx = null;
        this.isRunning = false;
        this.animationFrameId = null;
        this.lastPoseResult = null;
        this.onPoseCallback = null;
        this.dominantSide = null; // 'left' or 'right'
        this.smoothedLandmarks = null;
        this.landmarkHistory = [];
        this.lastDetectionTime = 0;
        this.trackingLost = false;
        this.trackingLostTime = 0;
    }

    /**
     * Initialize MediaPipe Pose Landmarker
     */
    async initialize() {
        const visionModule = await import(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs'
        );

        const { PoseLandmarker, FilesetResolver } = visionModule;

        const filesetResolver = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
        );

        this.poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: CONFIG.pose.modelPath,
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numPoses: CONFIG.pose.numPoses,
            minPoseDetectionConfidence: CONFIG.pose.detectionConfidence,
            minPosePresenceConfidence: CONFIG.pose.presenceConfidence,
            minTrackingConfidence: CONFIG.pose.trackingConfidence
        });

        return true;
    }

    /**
     * Start camera and processing loop
     */
    async startCamera(videoElement, canvasElement) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
        this.canvasCtx = canvasElement.getContext('2d');

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });

        this.videoElement.srcObject = stream;
        await new Promise(resolve => {
            this.videoElement.onloadedmetadata = () => {
                this.videoElement.play();
                resolve();
            };
        });

        // Match canvas to video dimensions
        this.canvasElement.width = this.videoElement.videoWidth;
        this.canvasElement.height = this.videoElement.videoHeight;

        this.isRunning = true;
        this.processFrame();
    }

    /**
     * Stop camera and processing
     */
    stopCamera() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.videoElement && this.videoElement.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(track => track.stop());
            this.videoElement.srcObject = null;
        }
        this.landmarkHistory = [];
        this.smoothedLandmarks = null;
        this.dominantSide = null;
    }

    /**
     * Main processing loop
     */
    processFrame() {
        if (!this.isRunning || !this.poseLandmarker) return;

        const now = performance.now();
        const result = this.poseLandmarker.detectForVideo(this.videoElement, now);

        if (result && result.landmarks && result.landmarks.length > 0) {
            const landmarks = result.landmarks[0];
            this.lastDetectionTime = now;
            this.trackingLost = false;

            // Determine dominant side if not set
            if (!this.dominantSide) {
                this.dominantSide = this.determineDominantSide(landmarks);
            }

            // Smooth landmarks
            this.smoothedLandmarks = this.applySmoothing(landmarks);

            // Draw skeleton overlay
            this.drawSkeleton(this.smoothedLandmarks);

            // Notify callback
            if (this.onPoseCallback) {
                this.onPoseCallback(this.smoothedLandmarks, this.dominantSide);
            }
        } else {
            // Check tracking loss duration
            const lostDuration = now - this.lastDetectionTime;
            if (lostDuration > CONFIG.tracking.lostWarningMs) {
                this.trackingLost = true;
                this.trackingLostTime = lostDuration;
            }

            // Still draw last known state faded
            if (this.smoothedLandmarks) {
                this.drawSkeleton(this.smoothedLandmarks, 0.3);
            }

            if (this.onPoseCallback) {
                this.onPoseCallback(null, this.dominantSide);
            }
        }

        this.lastPoseResult = result;
        this.animationFrameId = requestAnimationFrame(() => this.processFrame());
    }

    /**
     * Determine which side of the body is more visible to the camera
     */
    determineDominantSide(landmarks) {
        const L = CONFIG.landmarks;
        
        const leftVisibility = (
            (landmarks[L.LEFT_SHOULDER]?.visibility || 0) +
            (landmarks[L.LEFT_HIP]?.visibility || 0) +
            (landmarks[L.LEFT_KNEE]?.visibility || 0) +
            (landmarks[L.LEFT_ANKLE]?.visibility || 0) +
            (landmarks[L.LEFT_ELBOW]?.visibility || 0) +
            (landmarks[L.LEFT_WRIST]?.visibility || 0)
        ) / 6;

        const rightVisibility = (
            (landmarks[L.RIGHT_SHOULDER]?.visibility || 0) +
            (landmarks[L.RIGHT_HIP]?.visibility || 0) +
            (landmarks[L.RIGHT_KNEE]?.visibility || 0) +
            (landmarks[L.RIGHT_ANKLE]?.visibility || 0) +
            (landmarks[L.RIGHT_ELBOW]?.visibility || 0) +
            (landmarks[L.RIGHT_WRIST]?.visibility || 0)
        ) / 6;

        return leftVisibility >= rightVisibility ? 'left' : 'right';
    }

    /**
     * Apply temporal smoothing using moving average
     */
    applySmoothing(landmarks) {
        this.landmarkHistory.push(landmarks.map(l => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility })));

        if (this.landmarkHistory.length > CONFIG.tracking.smoothingFrames) {
            this.landmarkHistory.shift();
        }

        const smoothed = landmarks.map((landmark, i) => {
            let sumX = 0, sumY = 0, sumZ = 0, sumVis = 0;
            let count = this.landmarkHistory.length;

            for (const frame of this.landmarkHistory) {
                sumX += frame[i].x;
                sumY += frame[i].y;
                sumZ += frame[i].z;
                sumVis += frame[i].visibility;
            }

            return {
                x: sumX / count,
                y: sumY / count,
                z: sumZ / count,
                visibility: sumVis / count
            };
        });

        return smoothed;
    }

    /**
     * Draw skeleton overlay on canvas
     */
    drawSkeleton(landmarks, opacity = 1.0) {
        const ctx = this.canvasCtx;
        const w = this.canvasElement.width;
        const h = this.canvasElement.height;

        ctx.clearRect(0, 0, w, h);
        ctx.globalAlpha = opacity;

        // Draw connections
        const connections = [
            [11, 12], // shoulders
            [11, 13], [13, 15], // left arm
            [12, 14], [14, 16], // right arm
            [11, 23], [12, 24], // torso sides
            [23, 24], // hips
            [23, 25], [25, 27], // left leg
            [24, 26], [26, 28]  // right leg
        ];

        ctx.strokeStyle = `rgba(0, 210, 210, ${opacity})`;
        ctx.lineWidth = 3;

        for (const [start, end] of connections) {
            const lStart = landmarks[start];
            const lEnd = landmarks[end];
            if (lStart && lEnd && lStart.visibility > 0.5 && lEnd.visibility > 0.5) {
                ctx.beginPath();
                ctx.moveTo(lStart.x * w, lStart.y * h);
                ctx.lineTo(lEnd.x * w, lEnd.y * h);
                ctx.stroke();
            }
        }

        // Draw key landmarks as circles
        const keyIndices = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
        for (const i of keyIndices) {
            const lm = landmarks[i];
            if (lm && lm.visibility > 0.5) {
                ctx.beginPath();
                ctx.arc(lm.x * w, lm.y * h, 6, 0, 2 * Math.PI);
                ctx.fillStyle = `rgba(255, 107, 87, ${opacity})`;
                ctx.fill();
                ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }

        ctx.globalAlpha = 1.0;
    }

    /**
     * Check readiness - are required landmarks visible?
     */
    getReadinessStatus(landmarks) {
        if (!landmarks) return { status: 'not_visible', message: '🔴 Participant not fully visible' };

        const L = CONFIG.landmarks;
        const side = this.dominantSide || 'left';
        const prefix = side === 'left' ? 'LEFT' : 'RIGHT';

        const required = [
            landmarks[L[`${prefix}_SHOULDER`]],
            landmarks[L[`${prefix}_HIP`]],
            landmarks[L[`${prefix}_KNEE`]],
            landmarks[L[`${prefix}_ANKLE`]]
        ];

        const visibleCount = required.filter(lm => lm && lm.visibility > 0.5).length;

        if (visibleCount === 4) {
            return { status: 'ready', message: '🟢 Ready to begin' };
        } else if (visibleCount >= 2) {
            return { status: 'almost', message: '🟠 Almost ready - adjust position' };
        } else {
            return { status: 'not_visible', message: '🔴 Participant not fully visible' };
        }
    }

    /**
     * Get landmarks for the dominant side
     */
    getSideLandmarks(landmarks) {
        if (!landmarks) return null;
        const L = CONFIG.landmarks;
        const side = this.dominantSide || 'left';
        const prefix = side === 'left' ? 'LEFT' : 'RIGHT';

        return {
            shoulder: landmarks[L[`${prefix}_SHOULDER`]],
            elbow: landmarks[L[`${prefix}_ELBOW`]],
            wrist: landmarks[L[`${prefix}_WRIST`]],
            hip: landmarks[L[`${prefix}_HIP`]],
            knee: landmarks[L[`${prefix}_KNEE`]],
            ankle: landmarks[L[`${prefix}_ANKLE`]]
        };
    }

    /**
     * Get landmarks for the opposite side (for symmetry metrics)
     */
    getOppositeSideLandmarks(landmarks) {
        if (!landmarks) return null;
        const L = CONFIG.landmarks;
        const side = this.dominantSide === 'left' ? 'right' : 'left';
        const prefix = side === 'left' ? 'LEFT' : 'RIGHT';

        return {
            shoulder: landmarks[L[`${prefix}_SHOULDER`]],
            elbow: landmarks[L[`${prefix}_ELBOW`]],
            wrist: landmarks[L[`${prefix}_WRIST`]],
            hip: landmarks[L[`${prefix}_HIP`]],
            knee: landmarks[L[`${prefix}_KNEE`]],
            ankle: landmarks[L[`${prefix}_ANKLE`]]
        };
    }

    /**
     * Set callback for pose updates
     */
    onPose(callback) {
        this.onPoseCallback = callback;
    }

    /**
     * Reset side detection (for new station)
     */
    resetSideDetection() {
        this.dominantSide = null;
        this.landmarkHistory = [];
    }
}

// Utility functions for angle calculations
class PoseUtils {
    /**
     * Calculate angle between three points (in degrees)
     * Returns the angle at point B in triangle ABC
     */
    static calculateAngle(a, b, c) {
        if (!a || !b || !c) return null;

        const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs(radians * 180 / Math.PI);
        if (angle > 180) angle = 360 - angle;
        return angle;
    }

    /**
     * Calculate distance between two points (normalized)
     */
    static distance(a, b) {
        if (!a || !b) return null;
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    /**
     * Calculate torso length (shoulder to hip)
     */
    static torsoLength(shoulder, hip) {
        return PoseUtils.distance(shoulder, hip);
    }

    /**
     * Calculate angle of a line from vertical (0 = perfectly vertical)
     */
    static angleFromVertical(top, bottom) {
        if (!top || !bottom) return null;
        const dx = bottom.x - top.x;
        const dy = bottom.y - top.y;
        // Angle from vertical (pointing down)
        const angle = Math.abs(Math.atan2(dx, dy) * 180 / Math.PI);
        return angle;
    }

    /**
     * Calculate horizontal distance (x-component only)
     */
    static horizontalDistance(a, b) {
        if (!a || !b) return null;
        return Math.abs(a.x - b.x);
    }

    /**
     * Calculate vertical distance (y-component only, positive = downward in screen coords)
     */
    static verticalDistance(a, b) {
        if (!a || !b) return null;
        return a.y - b.y; // positive means a is below b
    }
}
