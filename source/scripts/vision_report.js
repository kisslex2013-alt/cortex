#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const visionPath = path.join('/root/.openclaw/workspace', 'VISION.md');

if (!fs.existsSync(visionPath)) {
    console.log("VISION.md не найден. Сэр, кажется, я потерял ориентиры.");
    process.exit(1);
}

const content = fs.readFileSync(visionPath, 'utf8');
console.log("🦾 *Jarvis Strategic Vision:*");
console.log(content);
