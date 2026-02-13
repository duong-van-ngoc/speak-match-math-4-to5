import Phaser from 'phaser';
import { GameConstants } from '../consts/GameConstants';

export class PaintManager {
    private scene: Phaser.Scene;

    // Config
    private brushColor: number = GameConstants.PAINT.DEFAULT_COLOR;
    private brushSize: number = GameConstants.PAINT.BRUSH_SIZE;
    private brushTexture: string = 'brush_circle';

    // State
    private isErasing: boolean = false;
    private activeRenderTexture: Phaser.GameObjects.RenderTexture | null = null;
    private activeHitArea: Phaser.GameObjects.Image | null = null;

    // ✅ FIX LAG: Biến lưu vị trí cũ để vẽ LERP
    private lastX: number = 0;
    private lastY: number = 0;

    // Config camera filter
    private ignoreCameraId: number = 0;

    // ✅ LOGIC MÀU: Map lưu danh sách màu đã dùng cho từng phần (Key: ID, Value: Set màu)
    private partColors: Map<string, Set<number>> = new Map();

    // ✅ OPTIMIZATION: Track unchecked painting distance per part
    private partUncheckedMetrics: Map<string, number> = new Map();
    // ✅ OPTIMIZATION: Cache mask data to avoid redundant draw calls and readback
    private maskCache: Map<string, Uint8ClampedArray> = new Map();

    private readonly CHECK_THRESHOLD: number = 300; // Check progress every ~300px of painting

    // ✅ TỐI ƯU RAM: Tạo sẵn Canvas tạm để tái sử dụng, không new mới liên tục
    private helperCanvasPaint: HTMLCanvasElement;
    private helperCanvasMask: HTMLCanvasElement;

    // Callback trả về khi bé nhấc tay (mỗi lần tô)
    private onAttempt: (id: string, coverage: number, total_px: number, match_px: number, usedColors: Set<number>) => void;
    // Callback trả về cả Set màu thay vì 1 màu lẻ
    private onPartComplete: (id: string, rt: Phaser.GameObjects.RenderTexture, usedColors: Set<number>) => void;

    constructor(
        scene: Phaser.Scene,
        onComplete: (id: string, rt: Phaser.GameObjects.RenderTexture, usedColors: Set<number>) => void,
        onAttempt: (id: string, coverage: number, total_px: number, match_px: number, usedColors: Set<number>) => void
    ) {
        this.scene = scene;
        this.onPartComplete = onComplete;
        this.onAttempt = onAttempt;
        this.scene.input.topOnly = false;

        // Khởi tạo Canvas tạm 1 lần duy nhất
        this.helperCanvasPaint = document.createElement('canvas');
        this.helperCanvasMask = document.createElement('canvas');

        this.createBrushTexture();
    }

    private createBrushTexture() {
        if (!this.scene.textures.exists(this.brushTexture)) {
            const canvas = this.scene.textures.createCanvas(this.brushTexture, this.brushSize, this.brushSize);
            if (canvas) {
                const ctx = canvas.context;
                const grd = ctx.createRadialGradient(this.brushSize / 2, this.brushSize / 2, 0, this.brushSize / 2, this.brushSize / 2, this.brushSize / 2);
                grd.addColorStop(0, 'rgba(255, 255, 255, 1)');
                grd.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = grd;
                ctx.fillRect(0, 0, this.brushSize, this.brushSize);
                canvas.refresh();
            }
        }
    }

    public setColor(color: number) {
        this.isErasing = false;
        this.brushColor = color;
    }

    public setEraser() {
        this.isErasing = true;
    }

    public setIgnoreCameraId(id: number) {
        this.ignoreCameraId = id;
    }

    public isPainting(): boolean {
        return this.activeRenderTexture !== null;
    }

    public createPaintableLayer(x: number, y: number, key: string, scale: number, uniqueId: string): Phaser.GameObjects.Image {
        const maskImage = this.scene.make.image({ x, y, key, add: false }).setScale(scale);
        const mask = maskImage.createBitmapMask();

        const rtW = maskImage.width * scale;
        const rtH = maskImage.height * scale;
        const rt = this.scene.add.renderTexture(x - rtW / 2, y - rtH / 2, rtW, rtH);

        // @NOTE: clear dữ liệu của GPU để không bị issue tô dữ liệu sai vào vùng nội dung
        rt.clear().setAlpha(0);

        // ✅ TỐI ƯU: Không set mask ngay lập tức để giảm tải render
        // rt.setMask(mask); 
        rt.setOrigin(0, 0).setDepth(10);

        rt.setData('id', uniqueId);
        rt.setData('key', key);
        rt.setData('isFinished', false);
        rt.setData('mask', mask); // Lưu mask vào data để dùng sau

        if (this.ignoreCameraId) rt.cameraFilter = this.ignoreCameraId;

        // ✅ LOGIC MÀU: Tạo hitArea với opacity thấp để dễ nhìn
        const hitArea = this.scene.add.image(x, y, key).setScale(scale).setAlpha(0.01).setDepth(50);
        hitArea.setInteractive({ useHandCursor: true, pixelPerfect: true });
        if (this.ignoreCameraId) hitArea.cameraFilter = this.ignoreCameraId;

        // ✅ NEW: Link layer and ID to hitArea for switching logic
        hitArea.setData('layer', rt);
        hitArea.setData('id', uniqueId);

        hitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // 🔥 CƠ CHẾ CHUYỂN ĐỔI THÔNG MINH (SWITCHING) 🔥
            if (this.activeHitArea !== hitArea) {
                if (this.activeHitArea) {
                    this.freezePart(this.activeHitArea);
                }
                this.unfreezePart(hitArea);
                this.activeHitArea = hitArea;
            }

            // Retrieve the CURRENT active layer (it might be a new RT after unfreeze)
            const activeLayer = hitArea.getData('layer');
            if (!(activeLayer instanceof Phaser.GameObjects.RenderTexture)) return;

            // ✅ TỐI ƯU: Khi chạm vào mới bật mask lên
            if (!activeLayer.mask) {
                const storedMask = activeLayer.getData('mask');
                if (storedMask) activeLayer.setMask(storedMask);
            }

            this.activeRenderTexture = activeLayer;

            // ✅ QUAN TRỌNG: Lưu vị trí bắt đầu để tính toán LERP
            this.lastX = pointer.x - activeLayer.x;
            this.lastY = pointer.y - activeLayer.y;

            this.paint(pointer, activeLayer);
        });

        return hitArea;
    }

    public handlePointerMove(pointer: Phaser.Input.Pointer) {
        if (pointer.isDown && this.activeRenderTexture) {
            this.paint(pointer, this.activeRenderTexture);
        }
    }

    public handlePointerUp() {
        if (this.isErasing) {
            this.activeRenderTexture = null;
            return;
        }
        if (this.activeRenderTexture) {
            // ✅ "Đúng chuẩn": Mỗi lần nhấc tay là 1 attempt
            this.checkProgress(this.activeRenderTexture);

            this.activeRenderTexture = null;
        }
    }

    private freezePart(hitArea: Phaser.GameObjects.Image) {
        const currentLayer = hitArea.getData('layer');
        if (currentLayer instanceof Phaser.GameObjects.RenderTexture) {
            const uniqueId = hitArea.getData('id');
            const key = `painted_tex_${uniqueId}`;

            // Save current RT content to Texture Manager
            if (this.scene.textures.exists(key)) {
                this.scene.textures.remove(key);
            }
            currentLayer.saveTexture(key);

            // Create static Image replacement
            const img = this.scene.add.image(currentLayer.x, currentLayer.y, key);
            img.setOrigin(0, 0).setDepth(10);

            // Transfer Mask
            const storedMask = currentLayer.getData('mask');
            if (storedMask) img.setMask(storedMask);
            if (this.ignoreCameraId) img.cameraFilter = this.ignoreCameraId;

            // Transfer Data
            img.setData('id', uniqueId);
            img.setData('key', currentLayer.getData('key'));
            img.setData('isFinished', currentLayer.getData('isFinished'));
            img.setData('mask', storedMask);

            // Update link
            hitArea.setData('layer', img);

            // Destroy heavy RT
            currentLayer.destroy();
        }
    }

    private unfreezePart(hitArea: Phaser.GameObjects.Image) {
        const currentLayer = hitArea.getData('layer');

        // If it's a static Image, convert back to RT
        if (currentLayer instanceof Phaser.GameObjects.Image) {
            const width = currentLayer.width;
            const height = currentLayer.height;
            const x = currentLayer.x;
            const y = currentLayer.y;

            const rt = this.scene.add.renderTexture(x, y, width, height);
            rt.setOrigin(0, 0).setDepth(10);

            // Clear mask
            currentLayer.clearMask();

            // Draw the frozen texture onto the new RT
            rt.draw(currentLayer, 0, 0);

            // Restore context
            const storedMask = currentLayer.getData('mask');
            if (storedMask) rt.setMask(storedMask);
            if (this.ignoreCameraId) rt.cameraFilter = this.ignoreCameraId;

            // Restore Data
            rt.setData('id', currentLayer.getData('id'));
            rt.setData('key', currentLayer.getData('key'));
            rt.setData('isFinished', currentLayer.getData('isFinished'));
            rt.setData('mask', storedMask);

            // Update link
            hitArea.setData('layer', rt);

            // Cleanup static Image
            currentLayer.destroy();
        }
    }

    // ✅ HÀM PAINT MỚI: DÙNG LERP ĐỂ VẼ MƯỢT
    private paint(pointer: Phaser.Input.Pointer, rt: Phaser.GameObjects.RenderTexture) {
        // 1. Lấy toạ độ hiện tại (Local)
        const currentX = pointer.x - rt.x;
        const currentY = pointer.y - rt.y;

        // 2. Tính khoảng cách
        const distance = Phaser.Math.Distance.Between(this.lastX, this.lastY, currentX, currentY);

        // Tối ưu: Nếu di chuyển quá ít (< 5px) thì bỏ qua
        if (distance < 10) return;

        // ✅ Accumulate distance for throttling checks
        const id = rt.getData('id');
        const currentDist = this.partUncheckedMetrics.get(id) || 0;
        this.partUncheckedMetrics.set(id, currentDist + distance);

        // 3. Thuật toán LERP (Nội suy)
        const stepSize = this.brushSize * 0.65;
        let steps = Math.ceil(distance / stepSize);
        if (steps > 50) steps = 50;
        const offset = this.brushSize / 2;

        for (let i = 0; i < steps; i++) {
            const t = i / steps;
            const interpX = this.lastX + (currentX - this.lastX) * t;
            const interpY = this.lastY + (currentY - this.lastY) * t;

            if (this.isErasing) {
                rt.erase(this.brushTexture, interpX - offset, interpY - offset);
            } else {
                rt.draw(this.brushTexture, interpX - offset, interpY - offset, 1.0, this.brushColor);
            }
        }

        // Vẽ chốt hạ tại điểm cuối
        if (this.isErasing) {
            rt.erase(this.brushTexture, currentX - offset, currentY - offset);
        } else {
            rt.draw(this.brushTexture, currentX - offset, currentY - offset, 1.0, this.brushColor);

            // ✅ MOVED OUTSIDE OF LOOP: color tracking only triggers ONCE per paint action
            // Optimization: checking set has/add is fast, but doing it inside loop is wasteful.
            // Since activeRenderTexture is set, we do it here (once per pointermove event).
            if (!this.partColors.has(id)) {
                this.partColors.set(id, new Set());
            }
            this.partColors.get(id)?.add(this.brushColor);
        }

        // 4. Cập nhật vị trí cũ
        this.lastX = currentX;
        this.lastY = currentY;
    }

    // ✅ HÀM CHECK PROGRESS MỚI: TỐI ƯU BỘ NHỚ
    private checkProgress(rt: Phaser.GameObjects.RenderTexture) {
        if (rt.getData('isFinished')) return;

        const id = rt.getData('id');
        const key = rt.getData('key');

        rt.snapshot((snapshot) => {
            if (!(snapshot instanceof HTMLImageElement)) return;

            const w = snapshot.width;
            const h = snapshot.height;
            const checkW = Math.floor(w / 4);
            const checkH = Math.floor(h / 4);

            // ✅ TÁI SỬ DỤNG CANVAS (Không tạo mới)
            const ctxPaint = this.getRecycledContext(this.helperCanvasPaint, snapshot, checkW, checkH);

            if (!ctxPaint) return;
            const paintData = ctxPaint.getImageData(0, 0, checkW, checkH).data;

            // ✅ TỐI ƯU HIỆU NĂNG: Lấy Mask Data từ Cache (nếu có) hoặc tính mới 1 lần
            let maskData = this.maskCache.get(id);

            if (!maskData) {
                const sourceImg = this.scene.textures.get(key).getSourceImage() as HTMLImageElement;
                const ctxMask = this.getRecycledContext(this.helperCanvasMask, sourceImg, checkW, checkH);

                if (!ctxMask) return;

                // Lưu vào cache dạng TypedArray
                maskData = ctxMask.getImageData(0, 0, checkW, checkH).data;
                this.maskCache.set(id, maskData);
            }

            let match = 0;
            let total = 0;

            // Thuật toán đếm Pixel (Giữ nguyên logic của bạn)
            for (let i = 3; i < paintData.length; i += 4) {
                if (maskData[i] > 0) { // Nếu pixel thuộc vùng mask
                    total++;
                    if (paintData[i] > 0) match++; // Nếu đã được tô
                }
            }

            const percentage = total > 0 ? match / total : 0;

            // ✅ GỬI DANH SÁCH MÀU VỀ SCENE
            const usedColors = this.partColors.get(id) || new Set([this.brushColor]);

            // ✅ LUÔN GỌI onAttempt để tracker ghi nhận history
            this.onAttempt(id, percentage, total, match, usedColors);

            if (percentage > GameConstants.PAINT.WIN_PERCENT) {
                rt.setData('isFinished', true);

                this.onPartComplete(id, rt, usedColors);

                // Clear bộ nhớ màu của phần này cho nhẹ
                this.partColors.delete(id);
                this.partUncheckedMetrics.delete(id); // Cleanup metrics
                // Không cần xóa maskCache ngay nếu muốn memory stable, hoặc xóa nếu cần tiết kiệm RAM. 
                // Với game nhỏ, giữ lại cho đến khi chuyển scene cũng được.
            }
        });
    }

    // Hàm helper để tái sử dụng Context
    private getRecycledContext(canvas: HTMLCanvasElement, img: HTMLImageElement, w: number, h: number) {
        canvas.width = w; // Set lại width tự động clear nội dung cũ
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, w, h); // Clear chắc chắn lần nữa
            ctx.drawImage(img, 0, 0, w, h);
        }
        return ctx;
    }
}