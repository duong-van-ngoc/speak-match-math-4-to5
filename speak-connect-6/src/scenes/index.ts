/**
 * Scenes Index - Export tất cả scenes để main.ts import dễ dàng
 */

// Base scenes (giữ ở root)
export { default as SceneBase } from './SceneBase';
export { default as PreloadScene } from './PreloadScene';

// Game scenes (trong thư mục con)
// export { default as SpeakScene } from './speak/SpeakScene';
// export { default as UnderlineCharScene } from './underline/UnderlineCharScene';
export { default as ConnectSixScene } from './connect/ConnectSixScene';
export { default as EndGameScene } from './end/EndScene';
