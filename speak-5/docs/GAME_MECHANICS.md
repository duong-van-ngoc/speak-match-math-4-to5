# 🎯 Game Mechanics

## 1. Tổng quan Game

Game dành cho trẻ 5-6 tuổi, tập trung vào việc luyện phát âm tiếng Việt thông qua 2 màn chơi:

1. **SpeakScene** – Nghe và đọc lại bài đồng dao
2. **UnderlineCharScene** – Gạch chân ký tự trong từ
3. **EndGameScene** – Màn kết thúc với confetti và nút điều hướng

---

## 2. SpeakScene – Nghe & Đọc lại

### Flow chính

1. **Intro**: Phát nhạc nền + voice giới thiệu
2. **Nghe đồng dao**:
   - Nhấn vào **biểu tượng loa** để nghe bài đồng dao
   - Animation miệng nói hiển thị trong khi phát audio
   - Ngón tay chỉ trượt theo từng dòng text (ReadingFinger)
3. **Ghi âm**:
   - Sau khi đồng dao kết thúc, **biểu tượng mic** xuất hiện
   - Nhấn mic để bắt đầu ghi âm (calibrating → recording)
   - Nhấn lần 2 hoặc im lặng quá lâu → tự động dừng
4. **Chấm điểm**:
   - Gửi audio lên API backend (Gemini AI)
   - Hiển thị "Đang chấm điểm..." với overlay
   - Nếu đạt `PASS_SCORE` → chuyển màn tiếp theo
   - Nếu không đạt → cho phép thử lại

### Tính năng đặc biệt

- **Adaptive VAD**: Tự động phát hiện giọng nói, lọc nhiễu môi trường
- **Speech Range Filter**: Chỉ thu âm trong khoảng âm lượng hợp lệ
- **Idle Hint**: Nếu không tương tác, hiện ngón tay chỉ vào nút cần nhấn

---

## 3. UnderlineCharScene – Gạch chân ký tự

### Flow chính

1. Hiển thị các từ có chứa ký tự cần học (ví dụ: "D", "Đ")
2. Trẻ nhấn vào ký tự tương ứng trong từ
3. Khi đúng: Ký tự được highlight và phát voice từ đó
4. Hoàn thành tất cả → chuyển sang EndGameScene

---

## 4. EndGameScene

- Confetti + âm thanh success
- Hai nút: **Reset** (quay lại SpeakScene) và **Exit** (thoát game/callback host)

---

## 5. Hệ thống điểm

- **SpeakScene**: API trả về `score` (0-100), so sánh với `PASS_SCORE` để quyết định pass/fail
- **UnderlineCharScene**: Không có điểm số học, chỉ "đúng" hoặc "sai"
- Hiệu ứng phản hồi: `sfx-correct`, `sfx-wrong`, voice khen

---

## 6. Điều kiện Win/Loss

| Trạng thái | Mô tả |
|------------|-------|
| **Win** | Hoàn thành cả SpeakScene (đạt điểm) + UnderlineCharScene |
| **Retry** | Điểm phát âm chưa đạt → thông báo và cho thử lại |
| **Idle** | Không tương tác → hiện hint tay chỉ |

---

## 7. Assets & Cấu hình

- **PreloadScene**: Load tất cả assets theo `TextureKeys`, `AudioKeys`
- **GameConstants.ts**: Cấu hình vị trí UI, timing, VAD parameters
- **AudioManager**: Quản lý tất cả audio (BGM, voice, SFX)
