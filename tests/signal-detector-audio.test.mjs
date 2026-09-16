import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { AUDIO_EVENT_CONFIG } from "../app/audio-event-manager.ts";
import { isSignalDetectorIllustration } from "../app/signal-detector-screens.ts";

test("scan audio is registered as an immediate one-shot and preserves source bytes", () => {
  const config = AUDIO_EVENT_CONFIG.signalDetectorIllustrationOpened;
  assert.equal(config.loop, false);
  assert.equal(config.delaySeconds, 0);
  assert.equal(config.volume, 1);
  assert.deepEqual(
    readFileSync(new URL("../" + config.sourceAssetPaths[0], import.meta.url)),
    readFileSync(new URL("../public/" + config.sources[0], import.meta.url)),
  );
});

test("opening triggers once, rerenders and closing stay silent, reopening plays again", () => {
  const source = readFileSync(new URL("../app/interaction-illustration.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  let cursor = 0, plays = 0;
  const refs = [];
  const react = {
    useRef(value) { const i = cursor++; return refs[i] ??= { current: value }; },
    useState() { return [null, () => {}]; }, useEffect() {},
  };
  const sandbox = { exports: {}, setTimeout: () => 1, clearTimeout() {},
    require(name) {
      if (name === "react") return react;
      if (name === "./signal-detector-screens") return { isSignalDetectorIllustration };
      return {};
    },
  };
  vm.runInNewContext(code, sandbox);
  const render = () => { cursor = 0; return sandbox.exports.useInteractionIllustration(() => { plays++; }); };
  let ui = render();
  ui.controller.open("/ui/訊號探測儀_C.png", true);
  assert.equal(plays, 1);
  ui = render(); ui = render();
  ui.controller.close(); ui.controller.close();
  assert.equal(plays, 1);
  ui.controller.open("/ui/訊號探測儀_C.png", false);
  assert.equal(plays, 2);
  ui.controller.open("/ui/other.png", true);
  assert.equal(plays, 2);
});
