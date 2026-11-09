// 把疑似 base64 的串解码；不是可读文本（可打印 ASCII / 中日韩字符 / 全角标点）就返回 null，避免把普通单词误判
function tryDecode(s) {
  const body = s.replace(/=+$/, '');
  if (body.length < 8 || body.length % 4 === 1) return null;
  let text;
  try {
    const bin = atob(body + '='.repeat((4 - body.length % 4) % 4));
    text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  } catch {
    return null;
  }
  text = text.trim();
  return /^[\x20-\x7e\t\n\r　-〿㐀-鿿＀-￯]+$/.test(text) ? text : null;
}

if (typeof module !== 'undefined') module.exports = tryDecode;
