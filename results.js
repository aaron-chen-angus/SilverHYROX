/**
 * Silver HYROX Home Challenge - Results Management
 * 
 * Handles result calculation, localStorage persistence,
 * history, and leaderboard.
 * 
 * saveChallengeResult() is structured for future backend replacement
 * (Google Sheets, Firebase, REST API).
 */

class ResultsManager {
    constructor() {
        this.STORAGE_KEY = 'silverHyrox_results';
        this.LEADERBOARD_KEY = 'silverHyrox_leaderboard';
        this.SETTINGS_KEY = 'silverHyrox_settings';
    }

    /**
     * Build the full session result object
     */
    buildSessionResult(participant, sitToStandResults, seatedRowResults) {
        const totalScore = (sitToStandResults?.reps || 0) + (seatedRowResults?.reps || 0);

        return {
            participant: {
                nickname: participant.nickname,
                gender: participant.gender,
                age: participant.age
            },
            sitToStand: sitToStandResults ? {
                completed: sitToStandResults.completed,
                reps: sitToStandResults.reps,
                elapsedTime: sitToStandResults.elapsedTime,
                averageRepTime: sitToStandResults.averageRepTime,
                fastestRep: sitToStandResults.fastestRep,
                slowestRep: sitToStandResults.slowestRep,
                consistency: sitToStandResults.consistency,
                averageStandingAngle: sitToStandResults.averageStandingAngle,
                armCompliance: sitToStandResults.armCompliance
            } : null,
            seatedRow: seatedRowResults ? {
                completed: seatedRowResults.completed,
                reps: seatedRowResults.reps,
                elapsedTime: seatedRowResults.elapsedTime,
                averageRepTime: seatedRowResults.averageRepTime,
                fastestRep: seatedRowResults.fastestRep,
                slowestRep: seatedRowResults.slowestRep,
                consistency: seatedRowResults.consistency,
                averageReach: seatedRowResults.averageReach,
                averageTorsoLean: seatedRowResults.averageTorsoLean,
                armSymmetry: seatedRowResults.armSymmetry
            } : null,
            totalScore,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Save challenge result
     * Structured for future backend replacement
     */
    saveChallengeResult(result) {
        // Currently saves to localStorage
        // Future: replace with API call to Google Sheets / Firebase / REST
        try {
            const history = this.getHistory();
            history.push(result);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));

            // Update leaderboard
            this.updateLeaderboard(result);

            return { success: true };
        } catch (e) {
            console.error('Failed to save result:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Get results history
     */
    getHistory() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }

    /**
     * Delete a result from history
     */
    deleteResult(index) {
        const history = this.getHistory();
        if (index >= 0 && index < history.length) {
            history.splice(index, 1);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
            this.rebuildLeaderboard();
        }
    }

    /**
     * Clear all history
     */
    clearHistory() {
        localStorage.removeItem(this.STORAGE_KEY);
        localStorage.removeItem(this.LEADERBOARD_KEY);
    }

    /**
     * Update leaderboard with a new result
     */
    updateLeaderboard(result) {
        const leaderboard = this.getLeaderboard();
        leaderboard.push({
            nickname: result.participant.nickname,
            totalScore: result.totalScore,
            timestamp: result.timestamp
        });

        // Sort by score descending
        leaderboard.sort((a, b) => b.totalScore - a.totalScore);

        // Keep top 20
        const trimmed = leaderboard.slice(0, 20);
        localStorage.setItem(this.LEADERBOARD_KEY, JSON.stringify(trimmed));
    }

    /**
     * Rebuild leaderboard from history
     */
    rebuildLeaderboard() {
        const history = this.getHistory();
        const leaderboard = history.map(r => ({
            nickname: r.participant.nickname,
            totalScore: r.totalScore,
            timestamp: r.timestamp
        }));
        leaderboard.sort((a, b) => b.totalScore - a.totalScore);
        localStorage.setItem(this.LEADERBOARD_KEY, JSON.stringify(leaderboard.slice(0, 20)));
    }

    /**
     * Get leaderboard
     */
    getLeaderboard() {
        try {
            const data = localStorage.getItem(this.LEADERBOARD_KEY);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }

    /**
     * Get fitness profile (application-generated, NOT clinical)
     */
    getFitnessProfile(result) {
        const profile = {
            lowerBody: 'Developing',
            upperBody: 'Developing',
            consistency: 'Developing'
        };

        // Lower-body functional endurance (from STS reps)
        const stsReps = result.sitToStand?.reps || 0;
        if (stsReps >= 14) profile.lowerBody = 'Strong';
        else if (stsReps >= 10) profile.lowerBody = 'Good';
        else profile.lowerBody = 'Developing';

        // Upper-body movement endurance (from Seated Row reps)
        const rowReps = result.seatedRow?.reps || 0;
        if (rowReps >= 22) profile.upperBody = 'Strong';
        else if (rowReps >= 16) profile.upperBody = 'Good';
        else profile.upperBody = 'Developing';

        // Movement consistency
        const stsConsistency = result.sitToStand?.consistency || 'N/A';
        const rowConsistency = result.seatedRow?.consistency || 'N/A';
        
        if (stsConsistency === 'Excellent' && rowConsistency === 'Excellent') {
            profile.consistency = 'Strong';
        } else if (stsConsistency !== 'Variable' && rowConsistency !== 'Variable') {
            profile.consistency = 'Good';
        } else {
            profile.consistency = 'Developing';
        }

        return profile;
    }

    /**
     * Get age band comparison text
     */
    getAgeBandComparison(age, totalScore) {
        // Determine age band
        let band = '';
        if (age < 60) band = 'Under 60';
        else if (age < 70) band = '60–69 years';
        else if (age < 80) band = '70–79 years';
        else if (age < 90) band = '80–89 years';
        else band = '90+ years';

        // Check if normative data exists
        const hasNorms = CONFIG.ageBands.sitToStand.length > 0;

        if (hasNorms) {
            // Future: compare against reference values
            return {
                band,
                comparison: 'Reference data available',
                hasReference: true
            };
        }

        return {
            band,
            score: totalScore,
            comparison: null,
            hasReference: false
        };
    }

    /**
     * Get settings (leaderboard enabled, sound, etc.)
     */
    getSettings() {
        try {
            const data = localStorage.getItem(this.SETTINGS_KEY);
            return data ? JSON.parse(data) : { leaderboardEnabled: true, soundEnabled: true };
        } catch {
            return { leaderboardEnabled: true, soundEnabled: true };
        }
    }

    /**
     * Save settings
     */
    saveSettings(settings) {
        localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
    }
}
