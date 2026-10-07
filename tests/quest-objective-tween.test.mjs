import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../app/movement-lab.tsx', import.meta.url), 'utf8');
const start = source.indexOf('  const triggerQuestObjectiveTween = (');
const end = source.indexOf('  const triggerQuestObjectiveUnlockTween = (', start);
assert.ok(start >= 0 && end > start);
const handler = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness() {
  let now = 0, nextId = 0, state = {}, unlocks = {}, active = { id: 'Q1', stageId: 'S1' };
  const timers = new Map(), pending = [], sounds = [];
  const timerRef = { current: new Map() }, unlockTimerRef = { current: new Map() };
  const env = {
    getFirstActiveQuestHud: () => active,
    questHudStageTransitionPresentationRef: { current: null },
    playOneShotAudio: event => sounds.push(event),
    questObjectiveTweenTimerRefs: timerRef,
    questObjectiveUnlockTweenTimerRefs: unlockTimerRef,
    setQuestObjectiveUnlockTweens: update => { unlocks = update(unlocks); },
    questHudEventSequenceRef: { current: 0 },
    setActiveQuestHud: view => { active = view; },
    revealQuestHudForAutomaticPresentation: () => {},
    setQuestObjectiveTweens: update => pending.push(update),
    getQuestObjectiveTweenKey: (quest, objective) => quest + ':' + objective,
    window: {
      setTimeout: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, due: now + delay }); return id; },
      clearTimeout: id => timers.delete(id),
    },
  };
  const trigger = new Function('env', 'const {' + Object.keys(env).join(',') + '} = env;\n' + handler + '\nreturn triggerQuestObjectiveTween;')(env);
  const flush = () => { while (pending.length) state = pending.shift()(state); return state; };
  return {
    env, timers, sounds, timerRef, unlockTimerRef,
    trigger: (id, quest = 'Q1', stage = 'S1') => trigger({ id: quest, stageId: stage }, id),
    flush,
    advance: ms => {
      now += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].due - b[1].due)) {
        if (timer.due <= now && timers.has(id)) { timers.delete(id); timer.callback(); }
      }
      return flush();
    },
    seedUnlock: (key, sequence) => {
      const timer = env.window.setTimeout(() => {}, 1000);
      unlockTimerRef.current.set(key, timer); unlocks[key] = { sequence }; return timer;
    },
    unlocks: () => unlocks,
  };
}

test('two completions in one React batch both retain independent 1s animations', () => {
  const h = harness();
  h.trigger('A'); h.trigger('B');
  const state = h.flush();
  assert.deepEqual(Object.keys(state), ['Q1:A', 'Q1:B']);
  assert.equal(state['Q1:A'].sequence, 1);
  assert.equal(state['Q1:B'].sequence, 2);
  assert.equal(h.timerRef.current.size, 2);
  assert.deepEqual(h.advance(999), state);
  assert.deepEqual(h.advance(1), {});
  assert.equal(h.timerRef.current.size, 0);
});

test('nearby completions expire individually without restarting or truncating the other', () => {
  const h = harness(); h.trigger('A');
  const first = h.flush()['Q1:A']; h.advance(200); h.trigger('B');
  assert.equal(h.flush()['Q1:A'], first);
  assert.deepEqual(Object.keys(h.advance(800)), ['Q1:B']);
  assert.equal(h.timerRef.current.size, 1);
  assert.deepEqual(Object.keys(h.advance(199)), ['Q1:B']);
  assert.deepEqual(h.advance(1), {});
});

test('stale same-OBJ expiry cannot remove its replacement or another completion', () => {
  const h = harness(); h.trigger('A'); h.flush();
  const oldTimer = h.timers.get(h.timerRef.current.get('Q1:A')).callback;
  h.advance(100); h.trigger('A'); h.trigger('B');
  const current = h.flush(); oldTimer();
  assert.deepEqual(h.flush(), current);
  assert.equal(h.timerRef.current.size, 2);
  assert.deepEqual(h.advance(1000), {});
});

test('quest identity scopes matching OBJ IDs and completing one cancels only its own unlock', () => {
  const h = harness();
  const ownUnlock = h.seedUnlock('Q1:A', 10), otherUnlock = h.seedUnlock('Q1:B', 11);
  h.trigger('A'); h.trigger('A', 'Q2');
  assert.deepEqual(Object.keys(h.flush()), ['Q1:A', 'Q2:A']);
  assert.equal(h.timers.has(ownUnlock), false);
  assert.equal(h.timers.has(otherUnlock), true);
  assert.deepEqual(Object.keys(h.unlocks()), ['Q1:B']);
});

test('stale stage cannot start a completion unless the HUD holds its departing stage', () => {
  const h = harness(); h.trigger('A', 'Q1', 'OLD');
  assert.deepEqual(h.flush(), {}); assert.equal(h.timers.size, 0);
  h.env.questHudStageTransitionPresentationRef.current = { questId: 'Q1', stageId: 'OLD' };
  h.trigger('A', 'Q1', 'OLD');
  assert.deepEqual(Object.keys(h.flush()), ['Q1:A']);
});

test('render and both teardown paths use per-OBJ state and timer ownership', () => {
  assert.match(source, /const objectiveCompletionTween = questObjectiveTweens\[/);
  assert.match(source, /objectiveCompletionTween\?\.sequence \?\? 0/);
  assert.equal((source.match(/questObjectiveTweenTimerRefs\.current\.clear\(\)/g) ?? []).length, 2);
  assert.match(source, /setQuestObjectiveTweens\(\{\}\)/);
  assert.doesNotMatch(source, /questObjectiveTweenTimerRef\.current|setQuestObjectiveTween\(/);
});
