const fs = require('fs'); 
const text = fs.readFileSync('src/EndGameScene.ts','utf-8'); 
const pos = text.indexOf('exitBtn'); 
if (pos >= 0) console.log(text.slice(pos, pos + 800)); 
