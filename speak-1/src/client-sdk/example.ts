/**
 * Example usage of Voice Session API Client
 * 
 * This example demonstrates the complete flow:
 * 1. Start session
 * 2. Submit 3 answers
 * 3. End session
 */

import {
    StartSession,
    Submit,
    EndSession,
    ExerciseType,
    type StartSessionResponse,
    type SubmitAnswerResponse,
    type EndSessionResponse,
} from "./voice-session-client";

/**
 * Mock function to simulate audio recording
 * In real app, replace with actual audio recording
 */
async function mockRecordAudio(index: number): Promise<Blob> {
    // In real implementation, use MediaRecorder API
    // For demo, return empty blob
    return new Blob([], { type: "audio/wav" });
}

/**
 * Complete voice session flow example
 */
async function completeVoiceSessionExample() {
    console.log("=== Voice Session Example ===\n");

    try {
        // Step 1: Start Session
        console.log("📝 Starting session...");
        const startResponse: StartSessionResponse = await StartSession({
            childId: "learner_demo_123",
            gameId: "game_nursery_rhyme_01",
            lessonId: "lesson_abc",
            gameVersion: "1.0.0",
            gameType: ExerciseType.NURSERY_RHYME,
            ageLevel: "3-4",
            testmode: true, // Use test mode for demo
        });

        console.log("✅ Session started!");
        console.log(`   Session ID: ${startResponse.sessionId}`);
        console.log(`   Current Index: ${startResponse.index}`);
        console.log(`   Quota Remaining: ${startResponse.quotaRemaining}\n`);

        if (!startResponse.allowPlay) {
            console.error("❌ Cannot play:", startResponse.message);
            return;
        }

        const sessionId = startResponse.sessionId;

        // Step 2: Submit Answers
        const questions = [
            { text: "Lúa ngô là cô đậu nành" },
            { text: "Đậu nành là anh dưa chuột" },
            { text: "Dưa chuột là chị ruột dưa gang" },
        ];

        for (let i = 0; i < questions.length; i++) {
            console.log(`📤 Submitting answer ${i + 1}/${questions.length}...`);

            // Simulate audio recording
            const audioBlob = await mockRecordAudio(i + 1);
            const audioFile = new File([audioBlob], `answer${i + 1}.wav`, {
                type: "audio/wav",
            });

            const submitResponse: SubmitAnswerResponse = await Submit({
                sessionId: sessionId,
                childId: "learner_demo_123",
                audioFile: audioFile,
                questionIndex: i + 1,
                targetText: questions[i],
                durationMs: 4500,
                exerciseType: ExerciseType.NURSERY_RHYME,
                testmode: true,
            });

            console.log("✅ Answer submitted!");
            console.log(`   Score: ${submitResponse.score}`);
            console.log(`   Attitude: ${submitResponse.attitude_level}`);
            console.log(`   Feedback: ${submitResponse.feedback}\n`);

            // Simulate delay between questions
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Step 3: End Session
        console.log("🏁 Ending session...");
        const endResponse: EndSessionResponse = await EndSession({
            sessionId: sessionId,
            totalQuestionsExpect: questions.length,
            isUserAborted: false,
            testmode: true,
            learner_id: "learner_demo_123",  // Required in test mode
            age_level: "3-4",  // Required in test mode
        });

        console.log("✅ Session ended!");
        console.log(`   Status: ${endResponse.status}`);
        console.log(`   Final Score: ${endResponse.finalScore}`);
        console.log(`   Completion: ${endResponse.completionPct}%`);
        console.log(`   Quota Deducted: ${endResponse.quotaDeducted}`);

        if (endResponse.violations) {
            console.log(`   Violations:`, endResponse.violations);
        }

        console.log("\n=== Example Complete ===");
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

/**
 * Resume session example
 */
async function resumeSessionExample() {
    console.log("=== Resume Session Example ===\n");

    try {
        // Start initial session
        const session1 = await StartSession({
            childId: "learner_resume_demo",
            gameId: "game_001",
            lessonId: "lesson_001",
            gameVersion: "1.0.0",
            gameType: ExerciseType.NURSERY_RHYME,
            ageLevel: "3-4",
            testmode: true,
        });

        console.log("✅ Session 1 created:", session1.sessionId);
        console.log(`   Index: ${session1.index}\n`);

        // Submit one answer
        const audioBlob = await mockRecordAudio(1);
        const audioFile = new File([audioBlob], "answer.wav", { type: "audio/wav" });

        await Submit({
            sessionId: session1.sessionId,
            childId: "learner_resume_demo",
            audioFile: audioFile,
            questionIndex: 1,
            targetText: { text: "Test" },
            durationMs: 3000,
            exerciseType: ExerciseType.NURSERY_RHYME,
            testmode: true,
        });

        console.log("✅ Submitted 1 answer\n");

        // Resume the SAME session
        const session2 = await StartSession({
            childId: "learner_resume_demo",
            gameSessionId: session1.sessionId, // ← Pass previous session ID
            gameId: "game_001",
            lessonId: "lesson_001",
            gameVersion: "1.0.0",
            gameType: ExerciseType.NURSERY_RHYME,
            ageLevel: "3-4",
            testmode: true,
        });

        console.log("✅ Session resumed!");
        console.log(`   Session ID: ${session2.sessionId}`);
        console.log(`   Same as before? ${session1.sessionId === session2.sessionId}`);
        console.log(`   Current Index: ${session2.index} (should be 1)`);

        console.log("\n=== Resume Example Complete ===");
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

// Run examples
if (require.main === module) {
    (async () => {
        await completeVoiceSessionExample();
        console.log("\n" + "=".repeat(50) + "\n");
        await resumeSessionExample();
    })();
}

export { completeVoiceSessionExample, resumeSessionExample };
