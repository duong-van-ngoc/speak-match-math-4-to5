# 🛠️ Development Guide

## 1. Cấu trúc thư mục

```
speak-matching-d-game/
├── src/
│   ├── audio/          # AudioManager
│   ├── consts/         # Keys.ts, GameConstants.ts
│   ├── scenes/
│   │   ├── PreloadScene.ts
│   │   ├── SceneBase.ts
│   │   ├── speak/      # SpeakScene, SpeakUI, SpeakVoice, ReadingFinger
│   │   ├── underline/  # UnderlineCharScene
│   │   └── end/        # EndScene
│   ├── utils/          # VoiceHandler, DebugGrid, IdleManager
│   └── main.ts
├── assets/             # Images, audio files
└── docs/               # Documentation
```

---

## 2. Chạy Development Server

```bash
npm install
npm run dev
```

Mở browser tại `http://localhost:5173/`

---

## 3. Cấu hình quan trọng

### GameConstants.ts

| Section | Mô tả |
|---------|-------|
| `VOICE_RECORDING` | API URL, keywords, thông số VAD |
| `SPEAK_SCENE` | Vị trí UI (speaker, mic, banner...), animation config |
| `TIMING` | Delay giữa các bước |

### TEST_MODE

```typescript
VOICE_RECORDING: {
  TEST_MODE: true,  // true = dùng file test audio
  API_URL_DEV: 'http://0.0.0.0:8000/api/v1/voice/eval/5-6'
}
```

Khi `TEST_MODE = true`:

- Không ghi âm thực, load file từ `assets/test_mode/NoiNgong.wav`
- Gọi API dev để test tích hợp

---

## 4. Thêm Scene mới

1. Tạo file scene trong `src/scenes/[tên]/`
2. Thêm key vào `SceneKeys` trong `Keys.ts`
3. Import và thêm vào `scene` array trong `main.ts`
4. Load assets trong `PreloadScene.ts`

---

## 5. Thêm Assets

### Hình ảnh

1. Đặt file vào `assets/images/[Scene]/`
2. Thêm key vào `TextureKeys` trong `Keys.ts`
3. Load trong `PreloadScene.ts`:

   ```typescript
   this.load.image(TextureKeys.NewImage, 'assets/images/.../file.png');
   ```

### Audio

1. Đặt file vào `assets/audio/`
2. Sử dụng `AudioManager`:

   ```typescript
   AudioManager.play('audio-key');
   ```

---

## 6. Debug Tools

### DebugGrid

Hiển thị lưới và đường reading lines:

```typescript
this.debugGrid = new DebugGrid(this);
this.debugGrid.draw({ showGrid: true, showReadingLines: true });
```

Comment lại khi lên production.

### Console Logs

VoiceHandler có nhiều log để debug VAD. Tắt bằng:

```typescript
VAD_CONFIG.DEBUG_LOG = false
```

---

## 7. Build Production

```bash
npm run build
```

Output trong thư mục `dist/`.
