# Voice Session API - TypeScript Client SDK

TypeScript/JavaScript client SDK for Iruka Voice Evaluation API.

**Base URL**: `https://iruka-api-h7j3ksnhva-as.a.run.app`

---

## Installation

Copy `voice-session-client.ts` to your project:

```bash
cp voice-session-client.ts src/lib/
```

---

## Quick Start

### 1. Import the SDK

```typescript
import VoiceSessionClient, { 
  StartSession, 
  Submit, 
  EndSession,
  ExerciseType 
} from './lib/voice-session-client';
```

### 2. Complete Flow Example

```typescript
async function runVoiceSession() {
  // Step 1: Start session
  const startResponse = await StartSession({
    childId: "learner_123",
    gameId: "game_nursery_rhyme_01",
    lessonId: "lesson_abc",
    gameVersion: "1.0.0",
    gameType: ExerciseType.NURSERY_RHYME,
    ageLevel: "3-4",
    testmode: true // Set to false in production
  });

  const sessionId = startResponse.sessionId;
  console.log("✅ Session started:", sessionId);
  console.log("   Index:", startResponse.index);

  // Step 2: Submit answers
  for (let i = 1; i <= 3; i++) {
    const audioBlob = await recordAudio(); // Your audio recording function
    const audioFile = new File([audioBlob], `answer${i}.wav`, { type: "audio/wav" });

    const submitResponse = await Submit({
      sessionId: sessionId,
      childId: "learner_123",
      audioFile: audioFile,
      questionIndex: i,
      targetText: { text: "Lúa ngô là cô đậu nành" },
      durationMs: 4500,
      exerciseType: ExerciseType.NURSERY_RHYME,
      testmode: true
    });

    console.log(`✅ Answer ${i} submitted:`);
    console.log(`   Score: ${submitResponse.score}`);
    console.log(`   Attitude: ${submitResponse.attitude_level}`);
  }

  // Step 3: End session
  const endResponse = await EndSession({
    sessionId: sessionId,
    totalQuestionsExpect: 3,
    isUserAborted: false,
    testmode: true,
    learner_id: "learner_123",  // Required in test mode
    age_level: "3-4"  // Required in test mode
  });

  console.log("✅ Session ended:");
  console.log(`   Final Score: ${endResponse.finalScore}`);
  console.log(`   Completion: ${endResponse.completionPct}%`);
}
```

---

## API Reference

### `StartSession(request)`

Start a new voice evaluation session or resume an existing one.

**Parameters:**

```typescript
{
  childId: string;           // Required: Learner ID
  gameSessionId?: string;    // Optional: For resume
  ageLevel?: string;         // Default: "3-4"
  gameId: string;            // Required: Game ID
  lessonId: string;          // Required: Lesson ID
  gameVersion: string;       // Required: Game version
  gameType: ExerciseType;    // Required: NURSERY_RHYME | COUNTING | SPELLING
  testmode?: boolean;        // Default: false
}
```

**Returns:**

```typescript
{
  sessionId: string;         // Use for Submit/End calls
  allowPlay: boolean;        // False if banned/no quota
  index: number;             // Current index (0 for new, >0 for resume)
  quotaRemaining: number;    // Remaining quota
  message?: string;          // Error/ban message
}
```

**Example:**

```typescript
const response = await StartSession({
  childId: "learner_123",
  gameId: "game_nursery_rhyme_01",
  lessonId: "lesson_abc",
  gameVersion: "1.0.0",
  gameType: ExerciseType.NURSERY_RHYME,
  testmode: true
});

const sessionId = response.sessionId;
```

---

### `Submit(request)`

Submit an answer for AI evaluation.

**Parameters:**

```typescript
{
  sessionId: string;         // Required: From StartSession
  childId: string;           // Required: Learner ID
  audioFile: File | Blob;    // Required: Audio recording
  questionIndex: number;     // Required: Question number (1-based)
  targetText: string | object; // Required: Expected text/data
  durationMs: number;        // Required: Audio duration
  exerciseType: ExerciseType; // Required: Exercise type
  testmode?: boolean;        // Default: false
}
```

**Returns:**

```typescript
{
  score: number;             // 0-100
  attitude_level: string;    // FOCUSED, DISTRACTED, etc.
  feedback: string;          // Feedback message
}
```

**Example:**

```typescript
const audioFile = new File([audioBlob], "answer.wav", { type: "audio/wav" });

const response = await Submit({
  sessionId: "session-uuid-here",
  childId: "learner_123",
  audioFile: audioFile,
  questionIndex: 1,
  targetText: { text: "Lúa ngô là cô đậu nành" },
  durationMs: 4500,
  exerciseType: ExerciseType.NURSERY_RHYME,
  testmode: true
});

console.log("Score:", response.score);
```

---

### `EndSession(request)`

End a session and get final results.

**Parameters:**

```typescript
{
  sessionId: string;         // Required: Session ID
  totalQuestionsExpect: number; // Required: Expected total questions
  isUserAborted: boolean;    // Required: Whether user quit early
  testmode?: boolean;        // Default: false
  learner_id?: string;       // Required in test mode (when JWT not available)
  age_level?: string;        // Required in test mode (e.g., "3-4", "4-5", "5-6")
}
```

**Returns:**

```typescript
{
  status: string;            // "completed"
  finalScore: number;        // Final score
  completionPct: number;     // Completion percentage
  quotaDeducted: boolean;    // Whether quota was deducted
  violations?: any;          // Detected violations
}
```

**Example:**

```typescript
const response = await EndSession({
  sessionId: "session-uuid-here",
  totalQuestionsExpect: 6,
  isUserAborted: false,
  testmode: true,
  learner_id: "learner_123",  // Required in test mode
  age_level: "3-4"  // Required in test mode
});

console.log("Final Score:", response.finalScore);
console.log("Completion:", response.completionPct + "%");
```

---

## Resume Session

To resume an existing session, pass the `gameSessionId`:

```typescript
// Start new session
const session1 = await StartSession({
  childId: "learner_123",
  // ... other params
});

// Submit some answers...
await Submit({ sessionId: session1.sessionId, ... });

// Later, resume the SAME session
const session2 = await StartSession({
  childId: "learner_123",
  gameSessionId: session1.sessionId,  // ← Resume!
  // ... other params
});

// session2.sessionId === session1.sessionId (TRUE!)
// session2.index = 1 (if submitted 1 answer before)
```

---

## Exercise Types

```typescript
enum ExerciseType {
  NURSERY_RHYME = "NURSERY_RHYME",  // Đọc thơ/đồng dao
  COUNTING = "COUNTING",            // Đếm số
  SPELLING = "SPELLING"             // Đánh vần
}
```

**Target Text Format:**

- **NURSERY_RHYME**: `{ text: "Lúa ngô là cô đậu nành..." }`
- **COUNTING**: `{ start: 1, end: 10 }`
- **SPELLING**: `{ word: "đọc", spelling_steps: [...] }`

---

## Error Handling

```typescript
try {
  const response = await StartSession({ ... });
} catch (error) {
  if (error instanceof Error) {
    console.error("Error:", error.message);
    // Handle: "Start session failed: QUOTA_EXCEEDED"
  }
}
```

Common errors:

- `"QUOTA_EXCEEDED"` - No quota remaining
- `"ACCESS_BANNED"` - User is banned
- `"SESSION_NOT_FOUND"` - Invalid session ID
- `"Failed to submit answer: ..."` - Network/API error

---

## Using Client Class (Advanced)

For custom configuration:

```typescript
import VoiceSessionClient from './lib/voice-session-client';

const client = new VoiceSessionClient({
  baseUrl: "https://iruka-api-h7j3ksnhva-as.a.run.app",
  timeout: 120000,  // 2 minutes
  testMode: true    // Default test mode
});

// All requests will use custom config
const response = await client.startSession({ ... });
```

---

## Test Mode vs Production

**Test Mode** (`testmode: true`):

- ✅ Skips JWT authentication
- ✅ Skips quota checks
- ✅ No database writes
- ✅ Returns debug info
- ⚠️ Use ONLY for development/testing!

**Production** (`testmode: false`):

- Requires authentication token
- Enforces quota limits
- Writes to database
- Deducts quota on session end

---

## Complete Example: React

```typescript
import { useState } from 'react';
import { StartSession, Submit, EndSession, ExerciseType } from './lib/voice-session-client';

function VoiceGame() {
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleStart = async () => {
    const response = await StartSession({
      childId: "learner_123",
      gameId: "game_001",
      lessonId: "lesson_001",
      gameVersion: "1.0.0",
      gameType: ExerciseType.NURSERY_RHYME,
      ageLevel: "3-4",
      testmode: true
    });
    setSessionId(response.sessionId);
  };

  const handleSubmit = async (audioBlob: Blob) => {
    if (!sessionId) return;

    const audioFile = new File([audioBlob], "answer.wav", { type: "audio/wav" });

    const response = await Submit({
      sessionId: sessionId,
      childId: "learner_123",
      audioFile: audioFile,
      questionIndex: 1,
      targetText: { text: "Test" },
      durationMs: 3000,
      exerciseType: ExerciseType.NURSERY_RHYME,
      testmode: true
    });

    console.log("Score:", response.score);
  };

  const handleEnd = async () => {
    if (!sessionId) return;

    const response = await EndSession({
      sessionId: sessionId,
      totalQuestionsExpect: 3,
      isUserAborted: false,
      testmode: true,
      learner_id: "learner_123",  // Required in test mode
      age_level: "3-4"  // Required in test mode
    });

    console.log("Final Score:", response.finalScore);
  };

  return (
    <div>
      <button onClick={handleStart}>Start</button>
      <button onClick={() => handleSubmit(audioBlob)}>Submit</button>
      <button onClick={handleEnd}>End</button>
    </div>
  );
}
```

---

## TypeScript Support

The SDK is written in TypeScript with full type definitions. No additional `@types` package needed!

```typescript
// ✅ Type safety
const request: StartSessionRequest = {
  childId: "learner_123",
  // TypeScript will autocomplete and validate!
};

// ✅ Response types
const response: StartSessionResponse = await StartSession(request);
const sessionId: string = response.sessionId; // Type-safe!
```

---

## Troubleshooting

### CORS Errors

Ensure your domain is whitelisted in backend `BACKEND_CORS_ORIGINS`.

### 404 Not Found

- Check `sessionId` is correct
- Session may have been ended/deleted

### 500 Internal Server Error

- Check backend logs
- Verify request payload format

### Network Timeout

- Default timeout: 60s
- Increase if needed: `new VoiceSessionClient({ timeout: 120000 })`

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/voice-sessions/start` | Start/resume session |
| POST | `/api/v1/voice-sessions/{sessionId}/submit` | Submit answer |
| POST | `/api/v1/voice-sessions/{sessionId}/end` | End session |

---

## License

Proprietary - Iruka Education Service
