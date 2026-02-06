// src/utils/backgroundManager.ts

let isBgAActive = true;

export function changeBackground(imageUrl: string) {
    const bgA = document.getElementById('bg-layer-a');
    const bgB = document.getElementById('bg-layer-b');

    if (!bgA || !bgB) return;

    const active = isBgAActive ? bgA : bgB;
    const hidden = isBgAActive ? bgB : bgA;

    // Định dạng đường dẫn cho CSS
    const targetBg = `url('${imageUrl}')`;

    // Nếu ảnh chưa đổi thì không làm gì
    if (active.style.backgroundImage === targetBg) return;

    // Set ảnh cho layer ẩn
    hidden.style.backgroundImage = targetBg;
    
    // Fade in layer ẩn
    hidden.classList.add('visible');
    
    // Fade out layer hiện tại
    active.classList.remove('visible');

    // Đảo trạng thái
    isBgAActive = !isBgAActive;
}