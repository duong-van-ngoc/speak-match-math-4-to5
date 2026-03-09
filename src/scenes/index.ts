/**
 * Scenes Index - Export tất cả scenes để main.ts import dễ dàng
 */

// Scene cơ sở (giữ ở root)
export { default as SceneBase } from './SceneBase';
export { default as PreloadScene } from './PreloadScene';

// Các scene game (trong thư mục con) d.
export { default as SpeakScene } from './speak/SpeakScene';
export { default as UnderlineCharScene } from './underline/UnderlineCharScene';
export { default as EndGameScene } from './end/EndScene';
