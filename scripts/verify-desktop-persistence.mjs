// Run against an already-running packaged app with MAYOBUILD_CDP=9222.
// Invoke with "write", restart the app, then invoke with "read". CI only.
const action = process.argv[2];
if (!['write', 'read'].includes(action)) throw new Error('Expected write or read');
let page;
for (let i = 0; i < 90; i++) {
  try {
    const response = await fetch('http://127.0.0.1:9222/json');
    const targets = await response.json();
    page = targets.find((target) => target.type === 'page' && target.url.startsWith('http://127.0.0.1:38491/'));
    if (page) break;
  } catch { /* app is still starting */ }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (!page) throw new Error('Stable desktop app origin did not start');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
const expression = `(async () => {
  const req = indexedDB.open('mayocut-db', 3);
  req.onupgradeneeded = () => { for (const name of ['media','blobs','projects','templates','exports','luts','fonts']) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' }); };
  const db = await new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  const id = '__persistence_ci_test__';
  if (${JSON.stringify(action)} === 'write') {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['projects','media','blobs'], 'readwrite');
      tx.objectStore('projects').put({id, name:'Persistence test', createdAt:1, updatedAt:1, main:[], tracks:[]});
      tx.objectStore('media').put({id, name:'Persistence test.wav', kind:'audio', size:5, createdAt:1});
      tx.objectStore('blobs').put({id, blob:new Blob(['audio'], {type:'audio/wav'})});
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
    });
  } else {
    const values = await Promise.all(['projects','media','blobs'].map((name) => new Promise((resolve, reject) => {
      const r = db.transaction(name, 'readonly').objectStore(name).get(id);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    })));
    if (values[0]?.name !== 'Persistence test' || values[1]?.name !== 'Persistence test.wav' || await values[2]?.blob?.text() !== 'audio') throw new Error('Saved project or media missing after restart');
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['projects','media','blobs'], 'readwrite');
      for (const name of ['projects','media','blobs']) tx.objectStore(name).delete(id);
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
    });
  }
  db.close();
  return location.origin;
})()`;
const reply = new Promise((resolve, reject) => {
  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== 1) return;
    if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
    else resolve(message.result.result.value);
  };
});
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
console.log(`Desktop persistence ${action}:`, await reply);
ws.close();
