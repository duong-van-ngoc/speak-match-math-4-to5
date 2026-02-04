# Speak Matching Đ Game

Pronunciation learning game for letter "Đ" for children ages 5-6.

## Features

### 1. SpeakScene - Read Nursery Rhyme
- Play nursery rhyme audio
- Display reading finger animation following each line
- Record child's voice (line by line)
- Score using Voice Session API
- Display score results

### 2. UnderlineScene - Underline Letter Đ
- Identify and underline letter Đ in words
- Animation effects for correct/wrong selections

### 3. EndGameScene - Game End
- Display final results summary
- Celebration effects

## Installation

```bash
# Install dependencies
pnpm install

# Run dev server
pnpm run dev

# Build for production
pnpm run build
```

## Folder Structure

```
src/
  audio/          # AudioManager - sound management (Howler.js)
  client-sdk/     # Voice Session API client
  consts/         # GameConstants, Keys
  scenes/
    speak/        # SpeakScene, SpeakUI, SpeakVoice, LineScoreManager
    underline/    # UnderlineCharScene
    EndGameScene.ts
    PreloadScene.ts
  utils/          # VoiceSessionManager, VoiceHandler, etc.
  main.ts         # Entry point + SDK integration
```

## Main Logic Flow

### SpeakScene Flow:
1. `create()` - Initialize UI, VoiceSessionManager
2. `startWithAudio()` - Play intro audio + finger animation
3. `onMicroClick()` - Start recording current line
4. `handleRecordingComplete()` - Submit audio via VoiceSessionManager
5. `moveToNextLine()` - Move to next line
6. `finishAllLines()` - End session, calculate average score
7. `showFinalScore()` - Display score and transition scene

### Voice Session Flow:
1. `startSession()` - Create new session with backend
2. `submitLine()` - Submit audio for each line to score
3. `endSession()` - End session, get final score

## Debug & Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Audio not playing | AudioContext suspended | Call `AudioManager.unlockAudio()` after user gesture |
| Session start failed | Network/API error | Check console, retry |
| Score NaN | Invalid API response | Fallback to score 0 |
| Recording not working | Microphone permission | Request permission first |

### Important Console Logs

```
[SpeakScene] Starting backend session...
[VoiceSessionManager] Session started: {sessionId}
[LineScoreManager] Submitting line X...
[VoiceSessionManager] Line submitted, score: X
[SpeakScene] Final score: X
```

### Test Mode

In `GameConstants.ts`:
```typescript
VOICE_RECORDING: {
  TEST_MODE: true,  // Skip auth, use test audio files
}
```

## Links

- [Voice Session API Docs](./src/client-sdk/README.md)
- [Game SDK](https://github.com/iruka-edu/mini-game-sdk)
