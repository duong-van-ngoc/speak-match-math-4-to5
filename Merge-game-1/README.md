# Comparison Game – So sánh số lượng bóng & hoa

`comparison-game` là một mini game học toán cho trẻ em, xây dựng bằng **Phaser 3 + TypeScript + Vite**.  
Trẻ sẽ so sánh số lượng bóng hoặc hoa ở hai bạn nhỏ và chọn bên “nhiều hơn” hoặc “ít hơn” theo câu hỏi tiếng Việt và voice hướng dẫn.

## 1. Gameplay

- Mỗi màn chơi hiển thị:
  - Một bạn gái và một bạn trai.
  - Bóng hoặc hoa trên mỗi bên.
  - Banner câu hỏi, ví dụ:
    - “BẠN NÀO CẦM NHIỀU BÓNG HƠN?”
    - “BÊN NÀO CÓ ÍT HOA HƠN?”
- Trẻ chạm / click chọn bên trái hoặc bên phải:
  - Đúng: hiện nút đúng/sai, phát `sfx_correct` + voice `correct`, sau đó chuyển sang màn phụ làm cân bằng (BalanceScene).
  - Sai: phát `sfx_wrong` + voice `wrong`, hiện nút sai và cho chọn lại.
- Hoàn thành đủ số màn sẽ chuyển tới màn kết thúc (EndGameScene) với feedback tổng.

Các scene chính trong `src/`:

- `PreloadScene.ts`: preload hình, âm thanh (bgm, sfx, voice) và chuyển vào `GameScene`.
- `GameScene.ts`: màn chính, hiển thị câu hỏi, hai nhân vật và xử lý chọn đáp án.
- `BalanceScene.ts`: màn phụ sau khi trả lời đúng, cân bằng số lượng bóng/hoa.
- `EndGameScene.ts`: màn kết thúc, hiển thị kết quả và nút chơi lại / tiếp tục.
- `OverlayScene.ts`: overlay/khung ngoài nếu được sử dụng.
- `main.ts`: khởi tạo Phaser game, cấu hình canvas, background HTML, gắn `playVoiceLocked` và logic nút HTML `btn-replay`, `btn-next`.

## 2. Chạy dự án

Yêu cầu:

- Node.js LTS (khuyến nghị >= 18)
- npm

Cài dependency:

```bash
cd comparison-game
npm install
```

Chạy dev server:

```bash
npm run dev
```

- Mặc định dùng **Vite (rolldown-vite)**, hỗ trợ HMR.
- Mở URL do Vite in ra (thường là `http://localhost:5173`).

Build production:

```bash
npm run build
```

Xem thử bản build:

```bash
npm run preview
```

## 3. Cấu trúc thư mục chính

- `index.html`  
  Canvas và các nút HTML bên ngoài game (`btn-replay`, `btn-next`), được `main.ts` gắn sự kiện.
- `public/assets`  
  Ảnh nền, nhân vật, icon, nút bấm và file âm thanh:
  - `bg/` – background cho intro, game, end.
  - `char/` – sprite nhân vật và đồ vật.
  - `button/` – nút chọn, replay, next…
  - `audio/` – `bgm_main.ogg`, `sfx_correct.ogg`, `sfx_wrong.ogg`, `voice_*`, `correct.ogg`, `wrong.ogg`, v.v.
- `src/`  
  Tất cả code TypeScript của game:
  - `GameScene.ts`, `BalanceScene.ts`, `EndGameScene.ts`, `PreloadScene.ts`, `OverlayScene.ts`
  - `types.ts` – định nghĩa `LevelConfig`, `CompareMode`.
  - `main.ts` – entrypoint Vite, cấu hình Phaser, gắn helper vào `window`.

## 4. Kỹ thuật & thư viện

- **Phaser 3** (`phaser`): engine 2D cho toàn bộ gameplay.
- **TypeScript**: type-safe cho scene, cấu hình level, v.v.
- **Vite + React plugin**:
  - Dự án khởi tạo từ template React + Vite, nhưng phần game hiện tại dùng Phaser thuần trong `main.ts` và các scene; React không bắt buộc để chạy game.
- **ESLint**:
  - Cấu hình trong `eslint.config.js`, dùng `@eslint/js`, `typescript-eslint` và một số plugin React mặc định từ template.
  - Có thể chạy lint bằng:

    ```bash
    npm run lint
    ```

## 5. Tuỳ biến / mở rộng

- Thêm level:
  - Chỉnh logic sinh `levels` trong `GameScene.ts`.
  - Cập nhật số lượng level khi truyền `total` cho `EndGameScene` trong `GameScene.ts`/`main.ts` nếu cần.
- Đổi âm thanh:
  - Thay file trong `public/assets/audio` nhưng giữ nguyên key trong code (`correct`, `wrong`, `sfx_correct`, `sfx_wrong`, `voice_*`).
- Thay hình nhân vật / đồ vật:
  - Cập nhật file trong `public/assets/char` và mapping key texture trong `GameScene.ts` / `BalanceScene.ts`.

