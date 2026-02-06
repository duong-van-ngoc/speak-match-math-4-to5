# 🧮 Algorithms & Technical Implementation

## 1. Voice Activity Detection (VAD)

### Adaptive VAD với Hysteresis

VoiceHandler sử dụng VAD thích ứng để phát hiện giọng nói trong môi trường ồn:

```
Volume hiện tại > Baseline × SPEECH_THRESHOLD + NOISE_MARGIN → Speech detected
```

**Các tham số chính:**

- `EMA_ALPHA`: Hệ số làm mượt baseline (0.05)
- `SPEECH_THRESHOLD`: Ngưỡng trigger (1.15x baseline)
- `SUSTAIN_FACTOR`: Ngưỡng duy trì (50% trigger)
- `HOLD_DELAY`: Hangover time (1500ms)

**Asymmetric Baseline Update:**

- Môi trường yên tĩnh hơn → Cập nhật xuống NHANH (3%)
- Môi trường ồn hơn → Cập nhật lên CHẬM (0.1%)

### Speech Range Filter

Lọc tiếng ồn đột ngột bằng cách chỉ thu âm trong khoảng trung bình ± tolerance:

```typescript
lowerBound = speechVolumeAvg - TOLERANCE
upperBound = speechVolumeAvg + TOLERANCE
isValidSpeech = volume >= lowerBound && volume <= upperBound
```

---

## 2. Audio Processing Pipeline

### Filter Chain

```
Microphone → Highpass (80Hz) → Notch (50Hz) → Lowpass (4000Hz) → Analyser
```

- **Highpass 80Hz**: Loại bỏ tiếng gió, tiếng ù tần số thấp
- **Notch 50Hz**: Loại bỏ tiếng ù điện (quạt, đèn)
- **Lowpass 4000Hz**: Giữ lại dải tần giọng nói

### WAV Encoding

Chuyển đổi PCM float → WAV 16-bit mono 16kHz để gửi lên API.

---

## 3. Animation Sequencing

### Reading Finger Animation

Ngón tay chỉ trượt theo từng dòng text khi đồng dao phát:

```typescript
READING_LINES: [
  { startX: 0.21, endX: 0.48, y: 0.52, duration: 2000 },
  // ...các dòng tiếp theo
]
```

Thuật toán:

1. Tween ngón tay từ `startX` → `endX` trong `duration` ms
2. Khi xong dòng, delay nhỏ rồi nhảy đến dòng tiếp theo
3. Lặp lại cho tất cả dòng

### Speak Animation (Mouth)

Animation miệng nói khi phát đồng dao:

```typescript
FRAMES: ['ani_speak1', 'ani_speak2', 'ani_speak3']
FRAME_DURATION: 700ms
```

Timer đổi texture theo chu kỳ.

---

## 4. State Machine

### VoiceHandler States

```
idle → calibrating → recording → processing → idle
         ↓              ↓
       (error)       (error)
```

### Calibration Phase

- 5 giây đầu để đo baseline noise
- Sử dụng 25th percentile thay vì median (lấy giá trị yên tĩnh hơn)

---

## 5. Idle Detection

`IdleManager` theo dõi thời gian không tương tác:

```typescript
update(delta) {
  this.elapsed += delta;
  if (this.elapsed > this.threshold) {
    this.showHint();
  }
}
```

Reset khi có `pointerdown` event.

---

## 6. Asset Loading Strategy

`PreloadScene` load tất cả assets theo enum keys:

- `TextureKeys`: Hình ảnh UI, sprites, backgrounds
- `AudioKeys`: BGM, voice, SFX

Đảm bảo tất cả assets sẵn sàng trước khi chuyển scene.
