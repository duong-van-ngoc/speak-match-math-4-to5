# 🔍 Debug: Sự cố ghi âm giọng nói quá nhỏ để hệ thống chấm điểm

## 1. Symptom (Triệu chứng)
Khi nhấn vào mic ghi âm giọng nói, âm thanh lưu lại và gửi lên backend bị rất nhỏ. Cường độ âm thanh không đủ lớn khiến hệ thống backend khó phân tích và chấm điểm chính xác.

## 2. Information Gathered (Thông tin thu thập)
Quá trình xử lý âm thanh trong file `src/voice/VoiceHandler.ts` cho thấy:
- **Dòng 160**: Trình duyệt bị buộc tắt tự động điều chỉnh âm lượng mic (`autoGainControl: false`).
- **Dòng 238**: Âm lượng được nhân lên 2.5 lần bằng `GainNode`, nhưng có thể chưa đủ khi đầu vào quá nhỏ.
- **Dòng 253-259**: Sử dụng một **DynamicsCompressorNode** nén rất mạnh (`ratio: 12`, `threshold: -50`). Điều này khiến mọi âm thanh vượt quá -50dB (mức khá nhỏ) ngay lập tức bị ép xuống, dẫn tới toàn bộ bản thu cuối cùng bị nhỏ đi nhiều lần.
- **Dòng 582-591**: Quá trình Normalize (kích âm) ở cuối lấy giá trị lớn nhất (đã bị bóp nhỏ trước đó) để khuyếch đại, nhưng do tín hiệu nguyên bản bị nén sai cách nên hiệu quả không cao.

## 3. Hypotheses (Các giả thuyết nguyên nhân)
1. ❓ **Mất tính năng phân tầng âm lượng tự nhiên của Mic**: Việc tắt `autoGainControl` khiến các microphone bình thường, vốn cần được HDH kích âm lên, ghi nhận tín hiệu quá nhỏ.
2. ❓ **Sát thủ thu nhỏ âm thanh - DynamicsCompressor**: Tỉ lệ nén `12` và ngưỡng bắt đầu nén `-50` là cấu hình cho các nhạc cụ lớn hoặc môi trường quá ồn (Club), không phù hợp với giọng nói trẻ em thông thường. Nó đã dập tắt toàn bộ độ mở của giọng thu vào.
3. ❓ **Tăng Gain bị lỗi nhịp**: Vì nguồn vào nhỏ và bị compressor đè nghẹt, nên `GainNode` tăng lên 2.5 lần hay tự động nén `Normalization` cuối cùng cũng không cứu được dải động thật của âm thanh.

## 4. Kế hoạch Thực hiện (Fix Plan)
Cần tối ưu lại Workflow âm thanh trực tiếp trong file `VoiceHandler.ts`:

- **Giai đoạn 1**: Phục hồi sức mạnh của Microphone gốc.
  - Sửa `autoGainControl: true` ở bước hàm xin cấp quyền `getUserMedia` để tận dụng hệ thống khuếch đại tự nhiên của trình duyệt và OS.

- **Giai đoạn 2**: Cấu hình lại (hoặc Bypass) Compressor dập tiếng.
  - Sửa đổi cấu hình `DynamicsCompressorNode`: Đưa `threshold` về `-24` (chỉ nén tiếng hét lớn chặn vỡ tiếng) và `ratio` về khoảng `3` (nén mềm). Thay vì đè bẹp giọng ngay khi vừa cất lên.
  
- **Giai đoạn 3**: Điều chỉnh `GainNode` đầu vào cân bằng.
  - Giảm giá trị `GainNode.gain.value` xuống mức `1.5 - 2.0` để phối hợp nhịp nhàng với AutoGainControl từ bước 1. Không tự kích âm mù quáng.

- **Giai đoạn 4**: Cải thiện Normalization.
  - Có thể nới lỏng mốc giới hạn nhân multiplier (vd: `Math.min(multiplier, 20.0)` giảm xuống vừa đủ) để tránh kéo luôn cả Noise floor (tiếng ù nền) lên to bất thường nếu trong phòng quá ồn.

## 5. Hành động (Action)
* Kế hoạch sẽ được thực thi trực tiếp vào mã nguồn của `VoiceHandler.ts` sau khi được phê duyệt.
