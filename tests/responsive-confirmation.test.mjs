import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmationLayout} from '../app/responsive-confirmation.ts';
test('confirmation stages are continuous and freeze layout before scaling',()=>{
 const desktop=confirmationLayout(700,800,450);
 assert.equal(desktop.width,600);assert.equal(desktop.scale,1);
 assert.equal(confirmationLayout(580,800,450).compact,0);
 assert.equal(confirmationLayout(510,800,450).compact,.5);
 assert.equal(confirmationLayout(460,800,450).compact,1);
 assert.equal(confirmationLayout(460,800,450).label,0);
 assert.equal(confirmationLayout(440,800,450).label,.5);
 for(const available of [420,390,320,256]){
  const result=confirmationLayout(available,800,450);
  assert.equal(result.width,420);assert.equal(result.compact,1);assert.equal(result.label,1);
  assert.equal(result.scale,available/420);
 }
 assert.equal(confirmationLayout(600,225,450).scale,.5);
});
