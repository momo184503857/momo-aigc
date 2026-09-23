import { DB_NAME } from './model'

let connection: Promise<IDBDatabase> | undefined
function database(): Promise<IDBDatabase> {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('images')
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); connection = undefined }
      resolve(request.result)
    }
    request.onerror = () => { connection = undefined; reject(request.error) }
    request.onblocked = () => { connection = undefined; reject(new Error('图片存储被占用')) }
  })
  return connection
}
export async function imageOperation(action: 'put' | 'get' | 'clear', id = '', blob?: Blob): Promise<Blob | undefined> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', action === 'get' ? 'readonly' : 'readwrite')
    const store = tx.objectStore('images')
    const request = action === 'put' ? store.put(blob, id) : action === 'clear' ? store.clear() : store.get(id)
    tx.oncomplete = () => resolve(action === 'get' ? request.result : undefined)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('图片存储未完成'))
  })
}
