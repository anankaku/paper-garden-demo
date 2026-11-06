import test from 'node:test';import assert from 'node:assert/strict';import {cleanHighlightText} from '../src/highlight-text.js';
test('PDF lines and blank lines become a continuous paragraph',()=>assert.equal(cleanHighlightText('The spring force\n controls spacing.\n\nThe true force\nchanges the path.'),'The spring force controls spacing. The true force changes the path.'));
test('line-end word breaks reconnect and in-line scientific hyphens remain',()=>assert.equal(cleanHighlightText('confor-\nmational chirality and rate-determining steps'),'conformational chirality and rate-determining steps'));
test('soft hyphens and nonbreaking spaces normalize',()=>assert.equal(cleanHighlightText('mole\u00adcular\u00a0\u00a0force\r\nprojection'),'molecular force projection'));
test('Chinese layout line breaks do not introduce spaces',()=>assert.equal(cleanHighlightText('真實力只保留\n垂直分量。'),'真實力只保留垂直分量。'));
test('numbers, symbols, punctuation and existing hyphens are retained',()=>assert.equal(cleanHighlightText('ΔG‡ = 8.8 kcal mol−1;\nSCS-MP2/6-31G*.'),'ΔG‡ = 8.8 kcal mol−1; SCS-MP2/6-31G*.'));
test('normalization is stable on previously saved highlights',()=>{const a=cleanHighlightText('A\n\nB');assert.equal(cleanHighlightText(a),a);assert.equal(cleanHighlightText(''), '')});
