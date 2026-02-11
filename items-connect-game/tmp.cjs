const fs = require('fs'); 
const text = fs.readFileSync('src/GameScene.ts','utf-8'); 
console.log('startRound at', text.indexOf('startRound(')); 
const pos = text.indexOf('startRound('); 
console.log(text.slice(Math.max(0,pos-120), Math.min(text.length,pos+400))); 
