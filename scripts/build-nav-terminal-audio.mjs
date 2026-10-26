// 靜態終端預覽使用同一份 AudioEventManager；勿手動編輯產生檔。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = new URL('../app/audio-event-manager.ts', import.meta.url);
const target = new URL('../public/minigames/nav-terminal/audio-event-manager.generated.js', import.meta.url);
const { outputText } = ts.transpileModule(readFileSync(source, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, removeComments: true },
  fileName: fileURLToPath(source),
});
writeFileSync(target, '// Generated from app/audio-event-manager.ts by scripts/build-nav-terminal-audio.mjs\n' + outputText);
