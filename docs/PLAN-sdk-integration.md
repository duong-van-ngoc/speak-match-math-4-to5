# Project Plan: Integrate SDK into Game Hub

**Objective:** Tích hợp SDK vào dự án để hỗ trợ luồng Game Hub, đáp ứng các tiêu chuẩn upload, tự kiểm tra QA và duyệt QA.

## Phase -1: Context Check
Dự án game đã có luồng hoàn tất ở `SpeakScene.ts`, `EndScene.ts` cùng `main.ts` xử lý SDK (iruka-edu/mini-game-sdk) gồm `startQuestionTimer`, `progress`, `score`, và `finalizeAttempt`.
Quy trình hiện tại yêu cầu tích hợp End-to-End Test (E2E) và đảm bảo các file chuẩn cho quá trình kiểm thử QA của tổ chức. Đồng thời đáp ứng các hàm SDK mới hoặc update nếu cần để Game được Approve/Publish.


## Phase 0: Socratic Gate (Clarifications)
1. Trong file `Quy trình tích hợp Game vào Game Hub.txt` có yêu cầu tạo thêm mục Auto Test (E2E) thông qua export `installIrukaE2E` ở file `src/e2e/installIrukaE2E.ts`. Đã chuẩn bị được file này chưa hay cần khởi tạo mới?
2. Có yêu cầu sử dụng hàm mock `configureSdkContext` và `voice` để test mode? Mình cần áp dụng ở đâu, hay dùng trực tiếp trong API của SpeakScene.ts?


## Phase 1: Thêm luồng Auto Test E2E vào dự án
- **File**: `src/e2e/installIrukaE2E.ts`
  - Nếu chưa có, tạo file và copy hàm `installIrukaE2E(sdk)` từ hướng dẫn tích hợp SDK.
- **File**: `src/main.ts`
  - Import hàm `installIrukaE2E`.
  - Gọi hàm `installIrukaE2E(sdk)` sau khi biến `sdk` được tạo ra (Dưới hàm `game.createGameSdk`).


## Phase 2: Đánh giá & Điều chỉnh quy trình Mock Test cho module Voice (Tuỳ chọn nếu chưa setup)
- **Cập nhật `SpeakScene.ts` (Tuỳ chọn)**:
  - Nếu chưa có mock hub cho giọng nói lúc dev ở môi trường local offline, thêm hàm `configureSdkContext({  ... })` ở đầu file.
- **Bổ sung `game.addHint()`** (Nên có nếu game hỗ trợ sử dụng Hint).
  - Gắn vào logic khi Mascot của SpeakScene chỉ tay giúp bé làm trò.

## Phase 3: Kiểm tra hoàn thành theo Self-QA Checklist
- Đảm bảo Game load và chạy hoàn chỉnh.
- Đảm bảo SDK được nạp, log đúng điểm/tiến độ (`sdk.score`, `sdk.progress`, `sdk.complete`).
- Đóng gói dự án theo checklist để sẵn sàng upload chờ QA (Mobile/PC view hoạt động đầy đủ).


## Agent Assignments
- **Frontend Specialist & SDK Specialist**: Chịu trách nhiệm hoàn thành Phase 1 và Phase 2.
- **QA Engineer**: Xác nhận Phase 3 bằng cách chạy E2E mock local.
