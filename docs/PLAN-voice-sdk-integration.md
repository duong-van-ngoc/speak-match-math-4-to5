# Kế hoạch Tích hợp Voice SDK vào SpeakScene

## 1. Mục tiêu (Objective)
Tích hợp chính xác các hàm `StartSession`, `Submit`, và `EndSession` của thư viện Voice SDK (`@iruka-edu/mini-game-sdk`) vào `SpeakScene.ts` theo đúng tài liệu Hướng dẫn chuẩn (`Quy trình tích hợp Game vào Game Hub.txt`).

## 2. Phân tích hiện trạng
- `SpeakScene.ts` hiện tại có gọi `voice.StartSession` một cách không đồng bộ (không `await`) trong cấu trúc try-catch của `initGameFlow`. Do không chờ `StartSession` hoàn tất hoặc không có cơ chế lưu trữ kết nối, khi vào localhost nó bị fail 401 thì đến lúc bấm lưu `Submit`, nó không có `sessionId` và ném lỗi 401/Missing session.
- Tài liệu quy định rõ 3 hàm chính vòng đời: `StartSession` -> `Submit` -> `EndSession`. Mọi hàm đều là non-blocking async (cần `await`).

## 3. Các thay đổi dự kiến (Task Breakdown)

### Phase 1: Tạo Session an toàn (`StartSession`)
- **Vị trí sửa:** Viết lại một hàm `ensureVoiceSession()` hoặc thay đổi logic bên trong khối gọi sự kiện nhấn Mic. 
- **Cách làm tiêu chuẩn:** Trước khi bắt đầu gọi hàm `voice.Submit()`, ta phải kiểm tra xem Session đã được khởi tạo chưa bằng cách gọi `await voice.StartSession({ testmode: GameConstants.VOICE_RECORDING.TEST_MODE })`. Hàm này phải giải quyết triệt để lỗi khi người dùng gọi lần đầu tiên.
- **Tại sao lỗi 401?** Vì trên localhost chưa gửi Token xác thực. Với `testmode = true` SDK sẽ bypass 401 qua local, nên ta cần cấu hình biến TEST_MODE xuyên suốt mạch này.

### Phase 2: Nộp bài chấm điểm (`Submit`)
- **Vị trí sửa:** Hàm `onRecordingComplete` trong `SpeakScene.ts`.
- **Cách làm tiêu chuẩn:** Thay đổi chuẩn Payload truyền vào:
  ```typescript
  await voice.Submit({
      audioFile: wavRecordFile,
      questionIndex: this.currentLevel + 1, // Tài liệu yêu cầu là +1 so với index mảng
      targetText: targetTextObj,
      durationMs: durationMs,
      exerciseType: "COUNTING", // Hoặc kiểu enum từ thư viện
      testmode: GameConstants.VOICE_RECORDING.TEST_MODE
  });
  ```

### Phase 3: Kết thúc Session (`EndSession`)
- **Vị trí sửa:** Hàm `onAllLevelsComplete` trong `SpeakScene.ts`.
- **Cách làm tiêu chuẩn:** Chờ dứt điểm việc gọi đóng Session trước khi chuyển qua Scene hiển thị EndGame.
  ```typescript
  await voice.EndSession({ 
      totalQuestionsExpect: GameConstants.SPEAK_SCENE.LEVELS.length, 
      isUserAborted: false, 
      testmode: GameConstants.VOICE_RECORDING.TEST_MODE 
  });
  ```

## 4. Danh sách kiểm tra Validation
- [ ] Chạy game với `TEST_MODE: true` sẽ gửi `Submit` cục bộ không gặp lỗi 401/Missing.
- [ ] Ghi âm thành công, nhận điểm (mock) và chuyển tiếp kịch bản.
- [ ] File console xuất hiện log EndSession thành công.

## 5. Agent Assignments
- **Antigravity (Execution):** Chờ người dùng phê duyệt Kế hoạch trên, sau đó sẽ áp dụng chỉnh sửa một lần duy nhất vào file `SpeakScene.ts`.
