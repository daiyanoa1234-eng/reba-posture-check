/** IndexedDB による端末内保存（外部送信なし） */
import type { AssessmentRecord } from './record';

const DB_NAME = 'reba-assessments';
const STORE = 'assessments';
const VERSION = 1;

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('この端末・ブラウザでは端末内保存（IndexedDB）が使えません'));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const st = db.createObjectStore(STORE, { keyPath: 'id' });
        st.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('保存領域を開けません'));
  });
  dbp.catch(() => {
    dbp = null;
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (st: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error ?? req.error ?? new Error('保存処理に失敗しました'));
        t.onabort = () => reject(t.error ?? new Error('保存処理が中断されました（容量不足の可能性）'));
      }),
  );
}

export async function saveRecord(r: AssessmentRecord): Promise<void> {
  await tx('readwrite', (st) => st.put(r));
  // 可能なら永続化を要求（ブラウザが自動削除しにくくなる）
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* noop */
  }
}

export async function listRecords(): Promise<AssessmentRecord[]> {
  const all = await tx<AssessmentRecord[]>('readonly', (st) => st.getAll());
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getRecord(id: string): Promise<AssessmentRecord | undefined> {
  return tx<AssessmentRecord | undefined>('readonly', (st) => st.get(id));
}

export async function deleteRecord(id: string): Promise<void> {
  await tx('readwrite', (st) => st.delete(id));
}
