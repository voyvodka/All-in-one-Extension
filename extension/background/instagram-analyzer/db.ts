import type { InstagramAnalyzerDurableAccount } from '../../shared/storage.js';

const DB_NAME = 'aio-instagram-analyzer';
const DB_VERSION = 1;
const ACCOUNTS_STORE = 'accounts';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(ACCOUNTS_STORE)) {
      database.createObjectStore(ACCOUNTS_STORE, { keyPath: 'viewerId' });
    }
  };

  return requestToPromise(request);
}

export async function getDurableAnalyzerAccount(viewerId: string): Promise<InstagramAnalyzerDurableAccount | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ACCOUNTS_STORE, 'readonly');
    const store = transaction.objectStore(ACCOUNTS_STORE);
    const result = await requestToPromise(store.get(viewerId) as IDBRequest<InstagramAnalyzerDurableAccount | undefined>);
    return result ?? null;
  } finally {
    database.close();
  }
}

export async function putDurableAnalyzerAccount(account: InstagramAnalyzerDurableAccount): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ACCOUNTS_STORE, 'readwrite');
    const store = transaction.objectStore(ACCOUNTS_STORE);
    store.put(account);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
