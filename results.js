/**
 * Silver HYROX Home Challenge - Results Management
 * 
 * Handles result calculation, localStorage persistence,
 * history, and Google Sheets export.
 * 
 * saveChallengeResult() saves locally AND sends to Google Sheets
 * if configured in config.js.
 */

class ResultsManager {
    constructor() {
        this.STORAGE_KEY = 'silverHyrox_results';
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
                consistency: sitToStandResults.consistency
            } : null,
            seatedRow: seatedRowResults ? {
                completed: seatedRowResults.completed,
                reps: seatedRowResults.reps,
                elapsedTime: seatedRowResults.elapsedTime,
                averageRepTime: seatedRowResults.averageRepTime,
                fastestRep: seatedRowResults.fastestRep,
                slowestRep: seatedRowResults.slowestRep,
                consistency: seatedRowResults.consistency,
                averageReach: seatedRowResults.averageReach
            } : null,
            totalScore,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Save challenge result (local + Google Sheets)
     */
    saveChallengeResult(result) {
        try {
            // Save locally
            const history = this.getHistory();
            history.push(result);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));

            // Send to Google Sheets if configured
            if (CONFIG.googleSheetsWebhookUrl) {
                this.sendToGoogleSheets(result);
            }

            return { success: true };
        } catch (e) {
            console.error('Failed to save result:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Send result to Google Sheets via Apps Script webhook
     */
    async sendToGoogleSheets(result) {
        const url = CONFIG.googleSheetsWebhookUrl;
        if (!url) return { sent: false, reason: 'No webhook URL configured' };

        try {
            // Flatten the result for spreadsheet columns
            const flat = {
                timestamp: result.timestamp,
                nickname: result.participant.nickname,
                gender: result.participant.gender,
                age: result.participant.age,
                totalScore: result.totalScore,
                stsReps: result.sitToStand?.reps || 0,
                stsElapsed: result.sitToStand?.elapsedTime || '',
                stsAvgRepTime: result.sitToStand?.averageRepTime || '',
                stsFastestRep: result.sitToStand?.fastestRep || '',
                stsSlowestRep: result.sitToStand?.slowestRep || '',
                stsConsistency: result.sitToStand?.consistency || '',
                rowReps: result.seatedRow?.reps || 0,
                rowElapsed: result.seatedRow?.elapsedTime || '',
                rowAvgRepTime: result.seatedRow?.averageRepTime || '',
                rowFastestRep: result.seatedRow?.fastestRep || '',
                rowSlowestRep: result.seatedRow?.slowestRep || '',
                rowConsistency: result.seatedRow?.consistency || '',
                rowAvgReach: result.seatedRow?.averageReach || ''
            };

            await fetch(url, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(flat)
            });
            return { sent: true };
        } catch (error) {
            console.error('Google Sheets export failed:', error);
            return { sent: false, reason: error.message };
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
     * Clear all history
     */
    clearHistory() {
        localStorage.removeItem(this.STORAGE_KEY);
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

        const stsReps = result.sitToStand?.reps || 0;
        if (stsReps >= 14) profile.lowerBody = 'Strong';
        else if (stsReps >= 10) profile.lowerBody = 'Good';

        const rowReps = result.seatedRow?.reps || 0;
        if (rowReps >= 22) profile.upperBody = 'Strong';
        else if (rowReps >= 16) profile.upperBody = 'Good';

        const stsConsistency = result.sitToStand?.consistency || 'N/A';
        const rowConsistency = result.seatedRow?.consistency || 'N/A';
        if (stsConsistency === 'Excellent' && rowConsistency === 'Excellent') profile.consistency = 'Strong';
        else if (stsConsistency !== 'Variable' && rowConsistency !== 'Variable') profile.consistency = 'Good';

        return profile;
    }

    /**
     * Get settings
     */
    getSettings() {
        try {
            const data = localStorage.getItem(this.SETTINGS_KEY);
            return data ? JSON.parse(data) : { soundEnabled: true };
        } catch {
            return { soundEnabled: true };
        }
    }

    /**
     * Save settings
     */
    saveSettings(settings) {
        localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
    }
}
