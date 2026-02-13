# Game Nối Hình (Match / Connect Pairs) – SDK Integration Guide (Phaser)

Game: Bé kéo một vật (object - Hand/Feet) nối vào hình tương ứng (shape - Glove/Shoe).  
Mục tiêu: Tích hợp **Item Tracker (matchTracker)** để hệ thống ghi lại lịch sử từng lần nối (attempt), đúng/sai, thời gian, hint, và thống kê cuối game.

---

## 0) Bạn sẽ có gì sau khi làm xong?

Khi game chạy, SDK sẽ bắn ra payload `COMPLETE` trong đó có:

- `items[0].expected.correct_pairs`: danh sách cặp đúng (from -> to)
- `items[0].history[]`: mỗi lần kéo-thả là 1 attempt:
  - `from_node`, `to_node`
  - `path_length_px`
  - `is_correct`
  - `error_code` (WRONG_PAIR / USER_ABANDONED / TIMEOUT)
  - `hint_used` (hint của attempt)
- `items[0].hint_used`: tổng hint của cả item (màn)

---

## 1) Luồng hoạt động của game nối (cực dễ hiểu)

Trong Phaser, game nối thường có 3 điểm chạm chính:

1. **dragstart**: bé bắt đầu kéo object  
   ✅ Đây là lúc **mở attempt** (`onMatchStart`)

2. **dragend**: bé thả  
   - Nếu thả vào shape: kiểm tra đúng/sai  
   - Nếu thả ra ngoài: coi như bỏ dở  
   ✅ Đây là lúc **đóng attempt** (`onMatchEnd`)

3. **LEVEL_END / quit**: bé nối xong hết hoặc thoát game  
   ✅ Đây là lúc **finalize item** (`finalize`) hoặc **quit** (`onQuit`)

---

## 2) Cài SDK (nếu project chưa có)

```bash
pnpm run setup
````

---

## 3) Tạo `matchTracker` (Item Tracker) trong Scene

### 3.1 Import SDK tracker factory

**Ở đầu file Scene** (ví dụ `GameScene.ts`):

```ts
import { game as irukaSdkGame } from "@iruka-edu/mini-game-sdk";

// lấy factory từ SDK
const createMatchTracker = irukaSdkGame.createMatchTracker;
```

### 3.2 Thêm biến trong class

**Trong class `GameScene`**:

```ts
// ===== SDK Match (items) =====
private runSeq = 1;
private itemSeq = 0;
private matchTracker: ReturnType<typeof createMatchTracker> | null = null;

// hint chờ để gắn vào attempt kế tiếp
private pendingHint = 0;
```

---

## 4) Tạo 1 `item match` cho cả màn (startRound)

Trong game của bạn, **1 màn = 1 item match** (bé nối nhiều cặp trong cùng 1 scene).

### 4.1 Chuẩn bị dữ liệu Pair

Trong `GameScene.ts` bạn đã có `LEFT_IDS` (Hand/Feet) và `RIGHT_IDS` (Glove/Shoe), cùng `RIGHT_MATCH_KEY` để map.

### 4.2 Tạo tracker trong `startRound()`

**Trong `startRound()`**, trước khi gọi `startHubQuestion()`:

```ts
// ===== SDK ITEMS: tạo 1 item match cho cả màn =====
this.itemSeq += 1;

const nodes = [...LEFT_IDS, ...RIGHT_IDS];

// correct_pairs: from (Left) -> to (Right)
// Dựa vào logic match của game để map đúng cặp
const correct_pairs = RIGHT_IDS.map((rightId) => ({
  from: RIGHT_MATCH_KEY[rightId], // VD: HAND_SMALL
  to: rightId,                    // VD: GLOVE_SMALL
}));

this.matchTracker = createMatchTracker({
  meta: {
    item_id: `CONNECT_HANDS_FEET_${this.itemSeq}`,
    item_type: "match",
    seq: this.itemSeq,
    run_seq: this.runSeq,
    difficulty: 1,
    scene_id: "SCN_MATCH_01",
    scene_seq: this.itemSeq,
    scene_type: "match",
    skill_ids: ["noi_cap_34_tv_001"],
  },
  expected: {
    nodes,
    correct_pairs,
  },
  errorOnWrong: "WRONG_PAIR",
});
```

✅ Ý nghĩa: tracker biết **đáp án đúng** là gì (ví dụ `HAND_SMALL` phải nối với `GLOVE_SMALL`), để tự đánh giá `is_correct`.

---

## 5) Ghi hint đúng cách (để hint_used nằm trong attempt)

### 5.1 Khi hint xuất hiện (guide hand)

Trong `startGuideHand()` có `recordHubHint();`.

👉 Thêm dòng này ngay sau đó:

```ts
// Hint xuất hiện -> chưa mở attempt ngay, nên tăng pendingHint
this.pendingHint += 1;
```

**Không gọi hint trực tiếp** ở đây, vì lúc này chưa chắc bé đang kéo.

### 5.2 Khi bé bắt đầu kéo (dragstart) -> apply hint vào attempt

Trong `dragstart`, ngay sau `onMatchStart`:

```ts
const objectId = img.getData("itemId"); // VD: HAND_SMALL hoặc GLOVE_SMALL
const ts = Date.now();
this.matchTracker?.onMatchStart?.(objectId, ts);

// apply hint đã xuất hiện trước đó vào attempt này
if (this.pendingHint > 0) {
  this.matchTracker?.hint?.(this.pendingHint);
  this.pendingHint = 0;
}
```

✅ Kết quả: `hint_used` sẽ xuất hiện trong đúng attempt mà bé kéo sau khi thấy hint.

---

## 6) Ghi attempt đúng/sai trong đúng vị trí

### 6.1 Mở attempt: trong `dragstart`

Bạn đã có:

```ts
this.matchTracker?.onMatchStart?.(objectId, Date.now());
```

✅ Chuẩn.

---

### 6.2 Drop ra ngoài shape: đóng attempt kiểu bỏ dở (USER_ABANDONED)

Trong `dragend`, nếu `!target`:

```ts
const ts = Date.now();
// Lấy ID của object đang kéo
const fromId = img.getData("itemId"); 

this.matchTracker?.onMatchEnd?.(
  { from_node: fromId, to_node: null, path_length_px: len }, // len tính khoảng cách nếu cần
  ts,
  { isCorrect: false, errorCode: "USER_ABANDONED" }
);
```

✅ Kết quả: history attempt có `to_node: null` + `USER_ABANDONED`

---

### 6.3 Thả vào shape: đóng attempt đúng/sai trong `checkMatch()`

Trong `checkMatch(leftKey, rightKey)`:

Lưu ý: hàm `checkMatch` của bạn nhận vào `MatchKey`, nên cần tìm lại Image/ID thực tế để log cho chính xác.

#### A) Chuẩn bị dữ liệu attempt

```ts
const ts = Date.now();

// Tìm lại image object từ key để lấy ID thực tế
const leftImg = this.leftItems.find((i) => i.getData('matchKey') === leftKey);
const rightImg = this.rightItems.find((i) => i.getData('matchKey') === rightKey);

const fromNode = leftImg?.getData("itemId"); // VD: HAND_SMALL
const toNode = rightImg?.getData("itemId");  // VD: GLOVE_SMALL

// Tính độ dài đường kéo (ước lượng từ khoảng cách 2 lỗ)
const start = leftImg ? this.getHoleWorldPoint(leftImg) : { x: 0, y: 0 };
const end = rightImg ? this.getHoleWorldPoint(rightImg) : { x: 0, y: 0 };
const len = Math.round(Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y));
```

#### B) Nếu nối đúng: `isCorrect: true`

Nằm trong block `if (left === right)`:

```ts
this.matchTracker?.onMatchEnd?.(
  { from_node: fromNode, to_node: toNode, path_length_px: len },
  ts,
  { isCorrect: true, errorCode: null }
);
```

#### C) Nếu nối sai: `isCorrect: false`

Nằm trong phần xử lý sai (dưới `if (left === right)`):

```ts
this.matchTracker?.onMatchEnd?.(
  { from_node: fromNode, to_node: toNode, path_length_px: len },
  ts,
  { isCorrect: false, errorCode: "WRONG_PAIR" }
);
```

✅ Quan trọng: **nối đúng thì tuyệt đối không ghi `isCorrect:false`**.

---

## 7) Khi kết thúc màn: finalize đúng thứ tự

Khi nối đủ hết object (`matched.size >= LEFT_IDS.length`):

✅ Thứ tự chuẩn:

1. Đóng attempt cuối bằng `onMatchEnd` (đúng) - đã làm ở bước trên.
2. `finalize()` item
3. set tracker = null
4. gọi `irukaGame.finalizeAttempt()` để game hub complete

Ví dụ:

```ts
// ... sau khi log onMatchEnd true ...

// finalize item
this.matchTracker?.finalize?.();
this.matchTracker = null;

// complete session
irukaGame.finalizeAttempt();
this.time.delayedCall(1000, () => { /* chuyển scene */ });
```

---

## 8) Debug nhanh khi nghi tracker vẫn sai

Thêm log trước `onMatchEnd` trong `checkMatch()`:

```ts
console.log("[MATCH]", fromNode, "->", toNode, "Correct?", leftKey === rightKey);
```

Nếu `leftKey === rightKey` mà SDK vẫn báo sai → kiểm tra lại `correct_pairs` lúc `createMatchTracker` có khớp với logic game không.

---

## 9) Checklist “không thể sai được”

* [ ] `correct_pairs` dùng đúng ID thật (VD `HAND_SMALL` -> `GLOVE_SMALL`)
* [ ] `dragstart` gọi `onMatchStart(objectId)`
* [ ] `dragend` luôn đóng attempt:
  * [ ] vào shape -> `onMatchEnd(from, to)`
  * [ ] ra ngoài -> `onMatchEnd(from, null)` (USER_ABANDONED)
* [ ] hint: dùng `pendingHint` để gắn hint vào attempt kế tiếp
* [ ] kết thúc: `onMatchEnd` (lần cuối) -> `finalize()` -> `finalizeAttempt()`

---

## 10) Ví dụ payload output (rút gọn)

Một attempt đúng sẽ giống:

```json
{
  "response": { "from_node": "HAND_SMALL", "to_node": "GLOVE_SMALL", "path_length_px": 355 },
  "is_correct": true,
  "error_code": null,
  "hint_used": 1
}
```

Một attempt sai:

```json
{
  "response": { "from_node": "HAND_SMALL", "to_node": "GLOVE_BIG", "path_length_px": 290 },
  "is_correct": false,
  "error_code": "WRONG_PAIR",
  "hint_used": 0
}
```

---

## Done.
