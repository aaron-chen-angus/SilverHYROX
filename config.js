/**
 * Silver HYROX Home Challenge - Configuration
 * 
 * These values are initial engineering parameters.
 * They REQUIRE testing and tuning with real participants.
 * Adjust thresholds based on observed performance in your environment.
 */
const CONFIG = {
    // Application metadata
    app: {
        name: 'Silver HYROX Home Challenge',
        altName: 'Silver Fitness Home Challenge', // Trademark-safe alternative
        version: '1.0.0'
    },

    // Google Sheets integration
    // Set this to your Google Apps Script Web App URL to enable auto-export
    googleSheetsWebhookUrl: '',

    // MediaPipe Pose Landmarker settings
    pose: {
        numPoses: 1,
        detectionConfidence: 0.60,
        presenceConfidence: 0.60,
        trackingConfidence: 0.60,
        modelPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
    },

    // Sit-to-Stand station configuration
    sitToStand: {
        durationSeconds: 30,
        // Knee angle thresholds (degrees)
        seatedKneeAngleMin: 60,
        seatedKneeAngleMax: 110,
        standingKneeAngleMin: 120,
        // Hip rise threshold (proportion of leg length)
        hipRiseThreshold: 0.15,
        // Torso angle for standing (degrees from vertical)
        standingTorsoAngleMax: 30,
        // State persistence (ms) - prevents jitter-based false reps
        statePersistenceMs: 200,
        // Calibration duration (ms)
        calibrationDurationMs: 2000,
        // Arms-crossed monitoring: wrist-to-opposite-shoulder distance threshold
        armsCrossedThreshold: 0.3 // proportion of torso length
    },

    // Seated Row station configuration
    seatedRow: {
        durationSeconds: 30,
        // Forward reach threshold (proportion of torso length)
        // Very lenient: 12% of torso length = "hands moved forward"
        forwardReachTorsoRatio: 0.12,
        // Return tolerance: within 8% of baseline = "hands came back"
        returnTolerance: 0.08,
        // State persistence (ms) - short for responsive counting
        statePersistenceMs: 120,
        // Calibration duration (ms)
        calibrationDurationMs: 2000
    },

    // Tracking loss settings
    tracking: {
        // Smoothing: number of frames for moving average
        smoothingFrames: 5,
        // Warning after this many ms without pose
        lostWarningMs: 750,
        // Critical loss threshold
        lostCriticalMs: 2000
    },

    // Countdown settings
    countdown: {
        durationSeconds: 3
    },

    // Sound settings
    sounds: {
        enabled: true,
        repBeepFrequency: 800,
        repBeepDuration: 100,
        countdownFrequency: 600,
        countdownDuration: 200,
        goFrequency: 1000,
        goDuration: 400,
        warningFrequency: 500,
        warningDuration: 300,
        completeFrequency: 1200,
        completeDuration: 600
    },

    // Visual design
    ui: {
        timerFontSize: '72px',
        repsFontSize: '80px',
        buttonMinHeight: '48px'
    },

    // Age bands for future normative data
    ageBands: {
        // Structure for future reference data
        // Each band: { min, max, maleAvg, femaleAvg }
        // Currently empty - do NOT fabricate normative values
        sitToStand: [],
        seatedRow: []
    },

    // Landmark indices (MediaPipe Pose)
    landmarks: {
        LEFT_SHOULDER: 11,
        RIGHT_SHOULDER: 12,
        LEFT_ELBOW: 13,
        RIGHT_ELBOW: 14,
        LEFT_WRIST: 15,
        RIGHT_WRIST: 16,
        LEFT_HIP: 23,
        RIGHT_HIP: 24,
        LEFT_KNEE: 25,
        RIGHT_KNEE: 26,
        LEFT_ANKLE: 27,
        RIGHT_ANKLE: 28
    }
};
