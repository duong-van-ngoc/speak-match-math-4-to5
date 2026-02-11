const fs = require('fs'); 
const text = fs.readFileSync('src/GameScene.ts','utf-8'); 
let idx = text.indexOf('irukaGame'); 
while (idx >= 0) { console.log('irukaGame', idx); idx = text.indexOf('irukaGame', idx + 1); } 
