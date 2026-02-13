# README — Tích hợp SDK Items cho game PAINT (tô vùng theo mask)

## Mục tiêu bạn sẽ đạt được

Sau khi tích hợp xong, khi game kết thúc, payload `stats.items[]` sẽ ra đúng kiểu:

* `expected.regions[]` có đủ:

  * `id`, `area_px`, `allowed_colors`, `correct_color`
* `history[].response` có đủ:

  * `selected_color`, `brush_size`, `regions_result[]`, `completion_pct`, …

Và bạn không phải tự build `items[]` thủ công — chỉ gọi tracker.

---

## 0) Bản đồ tư duy: 1 part = 1 item

Trong Scene2:

* mỗi part (S2_DuckBody_0, S2_Speculum_1, …) = 1 `ItemResult`
* mỗi lần bé tô (pointerdown → pointerup) = 1 `attempt` trong `history[]`

---

## 1) Bạn cần chuẩn bị dữ liệu “expected” từ level config

### ✅ Cách dễ nhất (chuẩn nhất): thêm vào JSON config

Ví dụ `level_s2_config.json` (minh họa):

```jsonc
{
  "min_region_coverage": 0.9,
  "max_spill_ratio": 0,
  "parts": [
    {
      "id": "S2_IconResult_0",
      "key": "S2_IconResult",
      "area_px": 2492,
      "allowed_colors": ["0xff595e","0xffca3a","0x8ac926","0x1982c4"],
      "correct_color": null
    }
  ]
}
```

**Giải thích cho người mới:**

* `area_px`: diện tích vùng mask (bao nhiêu pixel “hợp lệ” để tô)
* `allowed_colors`: palette cho BI biết bé dùng màu nào (nếu không giới hạn thì vẫn nên đưa palette)
* `correct_color`: nếu game không bắt đúng màu → `null`

> Nếu bạn chưa có `area_px` trong JSON, vẫn chơi được nhưng sẽ không “đúng chuẩn” hoàn toàn. Chuẩn nội bộ là **phải có**.

---

## 2) Bước tích hợp trong code — theo đúng Scene2 của bạn

### 2.1 Import tracker + khai báo store trackers

Ở đầu file Scene2:

```ts
const createPaintTracker = game.createPaintTracker;

private runSeq = 1;
private nextItemSeq = 0;
private paintTrackers = new Map<string, ReturnType<typeof createPaintTracker>>();
```

---

## 3) Điền expected đúng chuẩn trong `getOrCreatePaintTracker`

Bạn đang có:

```ts
expected: {
  regions: [{ id: partId, key: partKey }],
  min_region_coverage: GameConstants.PAINT.WIN_PERCENT,
  max_spill_ratio: 0,
},
```

=> Sai ở chỗ thiếu `area_px, allowed_colors, correct_color`.

### ✅ Ví dụ code chuẩn (cụ thể)

Giả sử `hitArea` của bạn đã được `LevelLoader` setData đủ (phần 4 mình hướng dẫn):

```ts
private getOrCreatePaintTracker(partId: string, partKey: string) {
  let t = this.paintTrackers.get(partId);
  if (!t) {
    const seq = ++this.nextItemSeq;

    const hitArea = this.unfinishedPartsMap.get(partId);

    const areaPx = hitArea?.getData("area_px") ?? 0;
    const allowedColors = hitArea?.getData("allowed_colors") ?? ["any"];
    const correctColor = hitArea?.getData("correct_color") ?? null;

    const minCov =
      hitArea?.getData("min_region_coverage") ?? GameConstants.PAINT.WIN_PERCENT;

    const maxSpill =
      hitArea?.getData("max_spill_ratio") ?? 0;

    t = createPaintTracker({
      meta: {
        item_id: `PAINT_${partId}`,
        item_type: "paint",
        seq,
        run_seq: this.runSeq,
        difficulty: 1,
        scene_id: "SCN_PAINT_01",
        scene_seq: seq,
        scene_type: "paint",
        skill_ids: [],
      },
      expected: {
        regions: [
          {
            id: partId,
            area_px: areaPx,
            allowed_colors: allowedColors,
            correct_color: correctColor,
          },
        ],
        min_region_coverage: minCov,
        max_spill_ratio: maxSpill,
      },
    });

    this.paintTrackers.set(partId, t);
  }
  return t;
}
```

**Người mới đọc hiểu ngay:**

* `hitArea.getData(...)` chính là “config cho part”
* Tracker lấy config đó để đổ vào `expected`

---

## 4) Sửa LevelLoader để setData đúng chuẩn (phần quan trọng)

Trong `spawnParts(...)`, bạn đang setData các thứ như `partKey, partId...`
Bạn chỉ cần **thêm thêm 5 dòng** lấy từ JSON part:

### ✅ Ví dụ sửa spawnParts (cụ thể)

```ts
hitArea.setData("partKey", part.key);
hitArea.setData("partId", id);

// ✅ NEW: fields cho expected
hitArea.setData("area_px", part.area_px ?? 0);
hitArea.setData("allowed_colors", part.allowed_colors ?? ["any"]);
hitArea.setData("correct_color", part.correct_color ?? null);

// ✅ NEW: rule chung (nếu config có)
hitArea.setData("min_region_coverage", data.min_region_coverage ?? GameConstants.PAINT.WIN_PERCENT);
hitArea.setData("max_spill_ratio", data.max_spill_ratio ?? 0);
```

**Đây là chỗ “điền dữ liệu cần thiết” đúng chuẩn nhất** vì:

* rule nằm trong level config
* game code không cần hardcode

---

## 5) Ghi attempt vào tracker: pointerdown + pointerup

### 5.1 Khi user chạm vào vùng (pointerdown)

Mục tiêu: gọi `tracker.onShown(ts)` đúng 1 lần (lần đầu bé chạm vùng).

Ví dụ bạn làm ngay trong `PaintManager.createPaintableLayer` (đây là chỗ ổn nhất):

```ts
hitArea.on("pointerdown", () => {
  const t = scene.getOrCreatePaintTracker(uniqueId, key);
  t.onShown(Date.now());
});
```

> Nếu bạn không muốn sửa PaintManager, bạn có thể làm trong Scene2 bằng hitTest, nhưng sẽ khó hơn.

---

### 5.2 Khi user nhấc tay (pointerup) → tạo response và `onDone`

Bạn đang có logic tính:

* `coverage`
* `match_px`
* `total_px`
* `usedColors`
* `brushSize`

=> quá đẹp. Chỉ cần build đúng response rồi gọi `t.onDone(...)`.

✅ Ví dụ response chuẩn:

```ts
const response = {
  selected_color: usedColors.size === 1 ? this.toHex([...usedColors][0]) : "multi",
  brush_size: brushSize,
  color_change_count: Math.max(0, usedColors.size - 1),
  brush_change_count: 0,

  regions_result: [
    {
      region_id: partId,
      area_px: total_px,          // ✅ IMPORTANT: area_px nằm ở đây
      paint_in_px: match_px,
      paint_out_px: 0,
      coverage,
      spill_ratio: 0,
    },
  ],

  total_paint_in_px: match_px,
  total_paint_out_px: 0,
  completion_pct: coverage,
  spill_ratio: 0,
};
```

Gọi tracker:

```ts
const t = this.getOrCreatePaintTracker(partId, partKey);
t.onDone(response, Date.now(), {
  isCorrect: coverage >= minCov,
  errorCode: coverage >= minCov ? null : "LOW_COVERAGE",
});

if (coverage >= minCov) {
  t.finalize();
  this.paintTrackers.delete(partId);
}
```

---

## 6) Khi kết thúc game / user exit

Trước khi gọi `prepareSubmitData` (hoặc game end):
Bạn phải finalize mọi tracker chưa xong:

```ts
for (const [partId, t] of this.paintTrackers.entries()) {
  t.finalize(); // sẽ tạo USER_ABANDONED nếu đang open
}
this.paintTrackers.clear();
```

---

## 7) Vì sao dữ liệu của bạn thiếu field (đúng lỗi bạn gặp)

Bạn gửi payload có:

```json
"expected": { "regions": [{ "id": "...", "key": "..." }] }
```

=> thiếu vì game **không truyền** `area_px/allowed_colors/correct_color`

Và có attempt quit `response: {}` vì:

* user quit → tracker close kiểu quit → bạn không truyền response cho quit attempt
* fix đẹp nhất: trước khi quit, finalize + (tuỳ chọn) snapshot response hiện tại

---

# TL;DR — Người mới chỉ cần nhớ 3 điểm

1. **expected phải đủ** ngay lúc tạo tracker
   → sửa `getOrCreatePaintTracker` + `LevelLoader` setData

2. **mỗi pointerup** tạo 1 response chuẩn và gọi `t.onDone(...)`

3. **endgame** finalize tất cả tracker còn dở

