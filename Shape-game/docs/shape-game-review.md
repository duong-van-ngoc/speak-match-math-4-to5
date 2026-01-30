# Shape Game – Technical Review

## 1. Luồng tổng thể & tổ chức code
- `src/main.ts`
  - Tạo container HTML, set background, unlock audio.
  - Khởi tạo tất cả scene (`PreloadScene`, `GameScene`, `ColorScene`, `CountConnectScene`, `CircleMarkScene`, `EndGameScene`).
  - Tích hợp Iruka Mini Game SDK: nhận resize/pause, phát `FLOW_GO_END` cho hub.
- `PreloadScene`
  - Load các asset chung.
  - Chuyển thẳng sang `GameScene` sau khi load xong.
- `GameScene`
  - Launch scene Tô màu đầu tiên và đảm bảo nút HTML "Chơi lại" hiển thị qua `window.setGameButtonsVisible`.
  - Lắng nghe `FLOW_GO_COUNT` để stop Color và launch `CountConnectScene`.
- `ColorScene.ts` (~1.100 dòng)
  - Dựng board + banner, tạo nhân vật từ asset, tạo bảng màu và xử lý input tô.
  - Theo dõi trạng thái từng nhóm shape theo `PAINT_ORDER`, quản lý tay hướng dẫn + audio.
  - Khi mọi shape đúng màu và đúng thứ tự thì emit `FLOW_GO_COUNT`.
- `CountConnectScene.ts`
  - Vẽ tranh mẫu (frame 142), tạo cột icon 4 hình học và cột số 1‑5.
  - Cho phép kéo đường nối; đủ 4 kết nối đúng thì emit `FLOW_GO_END`.
- `CircleMarkScene`
  - Vẫn nằm trong danh sách scene nhưng không có event/flow nào kích hoạt → scene thừa.

## 2. Đánh giá theo 4 góc độ "chuẩn phát triển hiệu quả"

### 2.1 Tư duy BA – bóc tách đề bài
- `README.md`
  - Vẫn mô tả game so sánh bóng/hoa với `BalanceScene` – không liên quan gameplay hiện tại.
  - Không có mô tả nào cho bài toán "tô màu + đếm + nối".
- `gameData.ts`
  - Có các trường `maxNumber`, `marblesBags`, `ballsBags` nhưng mọi scene bỏ qua.
  - Quy tắc màu, số lượng shape đều hard-code trong scene → không có checklist input/output.
- Event flow
  - Định nghĩa `FLOW_GO_COLOR`, `FLOW_GO_CIRCLE_MARK` nhưng không nơi nào sử dụng.
  - `CircleMarkScene` không có tài liệu BA đi kèm => không rõ mục tiêu.

### 2.2 Tư duy phân tích & thử nghiệm giải pháp
- Thuật toán đánh giá phủ màu
  - Yêu cầu coverage ≥98% và xóa sạch vùng nếu sai màu hoặc sai thứ tự.
  - Không có tài liệu giải thích vì sao chọn ngưỡng này hay đánh giá UX trẻ em.
- Hàm `rebuildCoverageSamples`
  - Mỗi lần layout đọc lại bitmap stencil, dựng sample grid trên main thread.
  - Chưa phân tích trade-off hiệu năng (resize/orientation liên tục sẽ nặng CPU).
- Scene đếm số
  - Chỉ cho phép kéo-thả 1 cách, không có phương án tap-tap hay gợi ý highlight.
  - Không thấy tài liệu mô tả input mong muốn, tiêu chí thành công hay fallback.

### 2.3 Tư duy implement top-down
- `ColorScene.ts`
  - Gom mọi trách nhiệm (asset, layout, paint engine, guide hand, audio) vào một class lớn.
  - Không có module/helper riêng → khó đọc, khó test, khó tái sử dụng.
- `CountConnectScene`
  - Copy lại phần layout board/banner/guide-hand thay vì dùng helper chung.
- Repo còn nhiều file không dùng (`CircleMarkScene`, `ChoiceFeedback`, `ui/helpers.ts`, hằng số flow).
  - Không có bước clean-up sau khi đổi yêu cầu.

### 2.4 Tư duy QA – quản lý chất lượng
- Testing
  - Không có unit test, integration test hay checklist thủ công trong repo.
- Dữ liệu kết quả
  - `FlowEndPayload` luôn emit `{ marblesTotal: 0, ballsTotal: 0 }` → không đo lường gì.
- Telemetry/logging
  - Không log số lần sai/đúng, số shape hoàn thành, thời gian chơi…
  - Không có script kiểm tra số lượng shape thực tế trong tranh khớp với yêu cầu.

## 3. Rủi ro & vấn đề chính
1. **Sai lệch đề bài/BOM**
   - Không có tài liệu chuẩn, README mô tả game khác → người mới rất dễ hiểu sai task.
2. **Hard-code dữ liệu domain**
   - Quy tắc màu, số lượng, thứ tự nằm rải trong code → thay đổi asset phải sửa tay nhiều nơi.
3. **Thiếu phân rã module**
   - Scene dài, đa trách nhiệm → khó bảo trì, trái với tư duy top-down.
4. **Không có QA pipeline**
   - Thiếu checklist, thiếu test, thiếu đo lường → không thể đảm bảo chất lượng khi nâng cấp.
5. **Dead code / scene thừa**
   - `CircleMarkScene` được preload nhưng không dùng, làm tăng thời gian load và gây rối kiến trúc.

## 4. Đề xuất bước tiếp theo
1. **Viết lại tài liệu BA**
   - Mô tả mục tiêu gameplay, yêu cầu từng scene, bảng mapping shape ↔ màu ↔ số lượng, tiêu chí hoàn thành.
   - Lưu tài liệu tại `docs/` hoặc Google Sheet chung để cả team nắm.
2. **Chuẩn hoá dữ liệu**
   - Đưa quy tắc màu và số lượng vào JSON/config để scene chỉ đọc dữ liệu.
   - Hỗ trợ mở rộng level mà không phải đụng code core.
3. **Tách module**
   - Chia `ColorScene` thành các service nhỏ (layout, paint engine, guide UI, audio cues).
   - Tạo helper chung cho board/banner để `CountConnectScene` tái sử dụng.
4. **Làm sạch flow**
   - Nếu bỏ `CircleMarkScene`/`FLOW_GO_COLOR` thì loại khỏi build.
   - Nếu cần scene này, mô tả rõ event chuyển và nhiệm vụ cụ thể.
5. **Thiết lập QA checklist & logging**
   - Viết checklist cho từng scene (ví dụ: tô sai màu thì reset, nối sai phát âm thanh lỗi).
   - Log số lần sai/đúng, thời gian hoàn thành để QA/telemetry theo dõi.
6. **Tối ưu hiệu năng UX**
   - Cache kết quả `rebuildCoverageSamples`, cân nhắc giảm yêu cầu coverage hoặc thêm auto-fill khi trẻ đã tô đủ.
