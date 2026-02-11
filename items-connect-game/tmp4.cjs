const fs = require('fs'); 
const text = fs.readFileSync('src/GameScene.ts','utf-8'); 
const pos = text.indexOf('private recordCorrect('); 
if (pos >= 0) console.log(text.slice(pos, pos + 400)); 
