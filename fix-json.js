const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const replacePattern1 = /JSON\.parse\((?!.*?replace)(.*?)\)/g;
  content = content.replace(replacePattern1, (match, p1) => {
    if (p1.includes('.replace(') || p1 === 'stored' || p1 === 'users' || p1 === 'session' || p1 === 'data' || p1 === 'cached') {
      return match;
    }
    changed = true;
    return `JSON.parse(typeof ${p1} === 'string' ? ${p1}.replace(/^\\\`\\\`\\\`(json)?/gi, '').replace(/\\\`\\\`\\\`$/gi, '').trim() : ${p1})`;
  });

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed', filePath);
  }
}

function walk(dir) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && file !== 'node_modules') {
      walk(filePath);
    } else if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      processFile(filePath);
    }
  }
}

walk('./pages');
walk('./components');
