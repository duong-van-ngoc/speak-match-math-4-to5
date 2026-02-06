/**
 * Voice Session API Client for Iruka Education Service
 * 
 * This SDK provides TypeScript functions to interact with the Voice Evaluation backend.
 * Base URL: https://iruka-api-h7j3ksnhva-as.a.run.app
 * 
 * @author Iruka Education Team
 * @version 1.0.0
 */

// ==================== Types ====================

/**
 * Exercise type for pronunciation games
 */
export enum ExerciseType {
    NURSERY_RHYME = "NURSERY_RHYME",
    COUNTING = "COUNTING",
    SPELLING = "SPELLING",
}

/**
 * Request to start a new voice session
 */
export interface StartSessionRequest {
    /** Child/Learner ID */
    childId: string;
    /** Optional: Session ID for resume. If provided, resumes existing session */
    gameSessionId?: string;
    /** Age level: "3-4", "4-5", or "5-6" */
    ageLevel?: string;
    /** Game ID */
    gameId: string;
    /** Lesson ID */
    lessonId: string;
    /** Game version (semver) */
    gameVersion: string;
    /** Exercise type */
    gameType: ExerciseType;
    /** Enable test mode (skips auth/quota checks) */
    testmode?: boolean;
}

/**
 * Response from starting a session
 */
export interface StartSessionResponse {
    /** Session ID - use this for subsequent Submit/End calls */
    sessionId: string;
    /** Whether play is allowed (false if banned/no quota) */
    allowPlay: boolean;
    /** Current question index (0 for new, >0 for resume) */
    index: number;
    /** Remaining quota */
    quotaRemaining: number;
    /** Optional message (e.g., error or ban reason) */
    message?: string;
    /** Test mode flag */
    testMode?: boolean;
    /** Debug info (only in test mode) */
    debugInfo?: any;
}

/**
 * Request to submit an answer
 */
export interface SubmitAnswerRequest {
    /** Session ID from StartSession */
    sessionId: string;
    /** Child ID */
    childId: string;
    /** Audio file (File/Blob in browser, Buffer in Node.js) */
    audioFile: File | Blob;
    /** Question index (1-based) */
    questionIndex: number;
    /** Target text/data for evaluation */
    targetText: string | object;
    /** Audio duration in milliseconds */
    durationMs: number;
    /** Exercise type */
    exerciseType: ExerciseType;
    /** Enable test mode */
    testmode?: boolean;
}

/**
 * Response from submitting an answer
 */
export interface SubmitAnswerResponse {
    /** Pronunciation score (0-100) */
    score: number;
    /** Attitude level (FOCUSED, DISTRACTED, UNCOOPERATIVE, etc.) */
    attitude_level: string;
    /** Feedback message */
    feedback: string;
    /** Test mode flag */
    testMode?: boolean;
    /** Debug info (only in test mode) */
    debugInfo?: any;
}

/**
 * Request to end a session
 */
export interface EndSessionRequest {
    /** Session ID */
    sessionId: string;
    /** Total questions expected */
    totalQuestionsExpect: number;
    /** Whether user manually aborted */
    isUserAborted: boolean;
    /** Enable test mode */
    testmode?: boolean;
    /** Learner ID (required in test mode when JWT is not available) */
    learner_id?: string;
    /** Age level: "3-4", "4-5", or "5-6" (required in test mode) */
    age_level?: string;
}

/**
 * Response from ending a session
 */
export interface EndSessionResponse {
    /** Session status */
    status: string;
    /** Final score */
    finalScore: number;
    /** Completion percentage */
    completionPct: number;
    /** Whether quota was deducted */
    quotaDeducted: boolean;
    /** Violations detected */
    violations?: any;
    /** Test mode flag */
    testMode?: boolean;
    /** Debug info */
    debugInfo?: any;
}

/**
 * API Error response
 */
export interface ApiError {
    detail: string;
}

// ==================== Configuration ====================

const BASE_URL = "https://iruka-cors-proxy-h7j3ksnhva-as.a.run.app"
const API_VERSION = "v1";

/**
 * Configuration for the Voice Session API client
 */
export interface VoiceSessionConfig {
    /** Base URL (default: production) */
    baseUrl?: string;
    /** Request timeout in milliseconds */
    timeout?: number;
    /** Default test mode */
    testMode?: boolean;
}

// ==================== API Client ====================

/**
 * Voice Session API Client
 */
export class VoiceSessionClient {
    private baseUrl: string;
    private timeout: number;
    private defaultTestMode: boolean;

    constructor(config: VoiceSessionConfig = {}) {
        this.baseUrl = config.baseUrl || BASE_URL;
        this.timeout = config.timeout || 60000; // 60s default
        this.defaultTestMode = config.testMode || false;
    }

    /**
     * Start a new voice evaluation session or resume an existing one
     * 
     * @param request - Session start parameters
     * @returns Session information including sessionId
     * 
     * @example
     * ```typescript
     * const response = await client.startSession({
     *   childId: "learner_123",
     *   gameId: "game_nursery_rhyme_01",
     *   lessonId: "lesson_abc",
     *   gameVersion: "1.0.0",
     *   gameType: ExerciseType.NURSERY_RHYME,
     *   ageLevel: "3-4",
     *   testmode: true
     * });
     * console.log("Session ID:", response.sessionId);
     * ```
     */
    async startSession(request: StartSessionRequest): Promise<StartSessionResponse> {
        const testmode = request.testmode ?? this.defaultTestMode;
        const url = `${this.baseUrl}/api/${API_VERSION}/voice-sessions/start?testmode=${testmode}`;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    childId: request.childId,
                    gameSessionId: request.gameSessionId,
                    ageLevel: request.ageLevel || "3-4",
                    gameId: request.gameId,
                    lessonId: request.lessonId,
                    gameVersion: request.gameVersion,
                    gameType: request.gameType,
                }),
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                const error: ApiError = await response.json();
                throw new Error(`Start session failed: ${error.detail}`);
            }

            return await response.json();
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to start session: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Submit an answer for evaluation
     * 
     * @param request - Answer submission parameters
     * @returns Evaluation result with score and feedback
     * 
     * @example
     * ```typescript
     * const audioFile = new File([audioBlob], "answer.wav", { type: "audio/wav" });
     * 
     * const response = await client.submitAnswer({
     *   sessionId: "session-uuid",
     *   childId: "learner_123",
     *   audioFile: audioFile,
     *   questionIndex: 1,
     *   targetText: { text: "Lúa ngô là cô đậu nành" },
     *   durationMs: 4500,
     *   exerciseType: ExerciseType.NURSERY_RHYME,
     *   testmode: true
     * });
     * 
     * console.log("Score:", response.score);
     * console.log("Attitude:", response.attitude_level);
     * ```
     */
    async submitAnswer(request: SubmitAnswerRequest): Promise<SubmitAnswerResponse> {
        const testmode = request.testmode ?? this.defaultTestMode;
        const url = `${this.baseUrl}/api/${API_VERSION}/voice-sessions/${request.sessionId}/submit?testmode=${testmode}`;

        try {
            const formData = new FormData();
            formData.append("childId", request.childId);
            formData.append("audio_file", request.audioFile, "audio.wav");
            formData.append("questionIndex", request.questionIndex.toString());
            formData.append(
                "targetText",
                typeof request.targetText === "string"
                    ? request.targetText
                    : JSON.stringify(request.targetText)
            );
            formData.append("durationMs", request.durationMs.toString());
            formData.append("exercise_type", request.exerciseType);

            const response = await fetch(url, {
                method: "POST",
                body: formData,
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                const error: ApiError = await response.json();
                throw new Error(`Submit answer failed: ${error.detail}`);
            }

            return await response.json();
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to submit answer: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * End a voice evaluation session
     * 
     * @param request - Session end parameters
     * @returns Final results including score and violations
     * 
     * @example
     * ```typescript
     * const response = await client.endSession({
     *   sessionId: "session-uuid",
     *   totalQuestionsExpect: 6,
     *   isUserAborted: false,
     *   testmode: true
     * });
     * 
     * console.log("Final Score:", response.finalScore);
     * console.log("Completion:", response.completionPct + "%");
     * console.log("Quota Deducted:", response.quotaDeducted);
     * ```
     */
    async endSession(request: EndSessionRequest): Promise<EndSessionResponse> {
        const testmode = request.testmode ?? this.defaultTestMode;
        const url = `${this.baseUrl}/api/${API_VERSION}/voice-sessions/${request.sessionId}/end?testmode=${testmode}`;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    totalQuestionsExpect: request.totalQuestionsExpect,
                    isUserAborted: request.isUserAborted,
                    learner_id: request.learner_id,
                    age_level: request.age_level,
                }),
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                const error: ApiError = await response.json();
                throw new Error(`End session failed: ${error.detail}`);
            }

            return await response.json();
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to end session: ${error.message}`);
            }
            throw error;
        }
    }
}

// ==================== Standalone Functions ====================

/**
 * Default client instance
 */
const defaultClient = new VoiceSessionClient();

/**
 * Start a voice evaluation session
 * 
 * @see VoiceSessionClient.startSession
 */
export async function StartSession(
    request: StartSessionRequest
): Promise<StartSessionResponse> {
    return defaultClient.startSession(request);
}

/**
 * Submit an answer for evaluation
 * 
 * @see VoiceSessionClient.submitAnswer
 */
export async function Submit(
    request: SubmitAnswerRequest
): Promise<SubmitAnswerResponse> {
    return defaultClient.submitAnswer(request);
}

/**
 * End a voice evaluation session
 * 
 * @see VoiceSessionClient.endSession
 */
export async function EndSession(
    request: EndSessionRequest
): Promise<EndSessionResponse> {
    return defaultClient.endSession(request);
}

// ==================== Export ====================

export default VoiceSessionClient;
