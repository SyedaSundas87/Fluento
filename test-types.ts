import fs from 'fs';
const dtspath = 'node_modules/@google/genai/dist/types.d.ts';
if (fs.existsSync(dtspath)) {
  const content = fs.readFileSync(dtspath, 'utf8');
  console.log(content.split('\n').filter(l => l.includes('inputAudioTranscription') || l.includes('LiveServerMessage') || l.includes('ServerContent')).join('\n'));
} else {
  console.log("No types.d.ts found");
}
