const DB = "studio-welcome-inspiration-v1";
const STORE = "files";

export type WelcomeInspirationFile = {
  name: string;
  mime: string;
  data: ArrayBuffer;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/** Stash inspiration files before navigating away from the marketing page. */
export async function idbPutWelcomeInspirations(
  sessionId: string,
  files: File[],
): Promise<void> {
  if (files.length === 0) return;
  const rows: WelcomeInspirationFile[] = [];
  for (const f of files) {
    rows.push({
      name: f.name,
      mime: f.type || "application/octet-stream",
      data: await f.arrayBuffer(),
    });
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("IDB write failed"));
    tx.objectStore(STORE).put(rows, sessionId);
  });
}

/** Read and remove queued files for a welcome session. */
export async function idbTakeWelcomeInspirations(
  sessionId: string,
): Promise<WelcomeInspirationFile[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(sessionId);
    getReq.onerror = () => reject(getReq.error ?? new Error("IDB read failed"));
    getReq.onsuccess = () => {
      const val = getReq.result as WelcomeInspirationFile[] | undefined;
      store.delete(sessionId);
      tx.oncomplete = () => {
        db.close();
        resolve(Array.isArray(val) ? val : []);
      };
    };
    tx.onerror = () => reject(tx.error ?? new Error("IDB tx failed"));
  });
}
