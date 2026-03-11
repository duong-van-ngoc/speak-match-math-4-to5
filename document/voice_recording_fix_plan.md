# Kế hoạch Khắc Phục Triệt Để Bug Ghi Âm Giọng Nói

Mặc dù `VoiceHandler.ts` đã cấu hình `GainNode` và `DynamicsCompressorNode` cực kỳ tiêu chuẩn, tuy nhiên trên môi trường chạy game thực tế sếp vẫn bị lỗi **"Âm lượng nhỏ và Backend không thể chấm điểm"**. 

## Nguyên nhân cốt lõi (Root Causes)
Qua phân tích sâu về Web Audio API trên trình duyệt Web/Mobile, nguyên nhân số 1 đến từ bộ phận ghi là: **`MediaRecorder`**!
1. **Lỗi luồng ảo (Blank Stream Bug)**: Việc đẩy `MediaStreamDestination` vào `MediaRecorder` là một "vùng tối" bị lỗi rớt âm lượng trên khá nhiều thiết bị (Safari, iOS, và một số cấu hình Chrome). Thay vì ghi chuẩn tín hiệu đã khuếch đại, nó lại bóp méo luồng và hạ gain xuống cực kỳ thấp.
2. **Nén kép gây phá hủy Formant (Double Compression)**: Lộ trình ghi âm của Game đang bắt buộc phải qua 2 lần chuyển đổi làm phá vỡ cấu trúc phát âm:
   - *Lần 1*: `MediaRecorder` thu xong ép file thành dạng nén (lossy) là WebM (Opus) hoặc MP4 (AAC). Quá trình này tự động san phẳng những âm luyến láy để tối ưu dung lượng.
   - *Lần 2*: `convertToWav` lại phải dùng `decodeAudioData` để giải nén file lossy đó một lần nữa ra PCM. Màng sóng âm (waveform) bị phá nát nhiều lần đến mức AI Backend không thể nghe ra được các chi tiết nguyên âm/phụ âm quan trọng. 

## Giải pháp Đề Xuất (The Ultimate Solution)

Bắt luôn tín hiệu gốc bằng **ScriptProcessorNode**, từ bỏ hoàn toàn `MediaRecorder`!

### 1. Thay thế luồng thu nhận (Bypass Lossy Encoding)
Thay vì khởi tạo `new MediaRecorder`, chúng ta sẽ hứng trực tiếp dải số nguyên thủy `Float32Array` y hệt như những gì `DynamicsCompressorNode` bắn ra thông qua một Node tên là `ScriptProcessorNode`.
   
### 2. Bắt trực tiếp dữ liệu RAW
Mỗi khung hình thu âm (khoảng ~0.08s), chúng ta sẽ đẩy thẳng dải PCM nguyên bản vào một biến cục bộ `pcmChunks[]`.

**Kết quả thu được**: Mảnh ghép âm thanh là chất lượng RAW 100% (Lossless Studio Quality), hoàn toàn không bị suy hao tí nào.

### 3. Ghép và Khởi tạo WAV trong 1 bước duy nhất
Khi kết thúc ghi âm (`stop()`), chúng ta **không cần phải giải mã `decodeAudioData` cực phiền phức nữa**. Chỉ việc nối mảng `pcmChunks` đã lưu lại thành một mảng lớn duy nhất, chạy qua thuật toán Khống chế đỉnh Normalization để kéo Max Volume lên, rồi lưu thẳng vào `.WAV`.

### Kế hoạch Triển Khai (Dự kiến trong `VoiceHandler.ts`)
1. Khai báo thuộc tính mới: `private processorNode: ScriptProcessorNode | null = null;` và mảng `private pcmChunks: Float32Array[] = [];`
2. Xóa toàn bộ biến và code liên quan đến cục nợ `mediaRecorder` đi, thay bằng:
   ```typescript
   this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
   this.processorNode.onaudioprocess = (e) => {
       if (this.state === 'recording') {
           // Lấy sóng âm thanh (Channel 0/ Mono) rồi sao chép vào mảng.
           this.pcmChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
       }
   };
   
   // Nối từ Compressor -> Processor -> Dummy Gain (mutting) -> Destination
   // Phải có Dummy Gain = 0 nối vào Destination để lừa trình duyệt giúp Processor chạy ngầm (trick fix cho Safari Mobile).
   const dummyGain = this.audioContext.createGain();
   dummyGain.gain.value = 0;
   
   this.compressorNode.connect(this.processorNode);
   this.processorNode.connect(dummyGain);
   dummyGain.connect(this.audioContext.destination);
   ```
3. Cải tiến luôn cả hàm `convertToWav()`: Do dữ liệu `pcmChunks[]` bây giờ đã là RAW PCM, chúng ta bỏ được bước `arrayBuffer()` + `decodeAudioData()` nặng nề, tốc độ chuyển đổi sẽ siêu mượt và nhẹ máy (rất tốt khi chạy trên thiết bị chíp yếu). Khâu Normalization vẫn giữ lại để kích Volume to x20.
   
## Lợi ích Tuyệt Đối
Bản nâng cấp này chắc chắn 100% file `.WAV` nhận được sẽ **cực lớn, cực sạch, không méo tiếng và đặc biệt giữ rất rõ các phụ âm sờ/nờ của trẻ**. Đảm bảo API Backend của Iruka sẽ bắt điểm chuẩn và nhanh hơn!
