// node b64.test.js
const assert = require('assert');
const tryDecode = require('./b64.js');

assert.strictEqual(tryDecode('aGVsbG8gd29ybGQ='), 'hello world');
assert.strictEqual(tryDecode('aGVsbG8gd29ybGQ'), 'hello world'); // 缺 padding
assert.strictEqual(tryDecode('ZG9vb2JvQDE2My5jb20='), 'dooobo@163.com');
assert.strictEqual(tryDecode('5L2g5aW95LiW55WM'), '你好世界');
for (const s of ['password', 'HelloWorld', 'abcdefgh', 'function', 'TextDecoder', '1234567890', '20261109', 'claude/opus/4/6'])
  assert.strictEqual(tryDecode(s), null, s);
console.log('ok');
