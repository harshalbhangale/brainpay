/**
 * Web stub for expo-secure-store.
 * Falls back to localStorage on web (not secure, but fine for dev/testing).
 */

export async function getItemAsync(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export async function setItemAsync(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

export async function deleteItemAsync(key) {
  try {
    localStorage.removeItem(key)
  } catch {}
}

export default { getItemAsync, setItemAsync, deleteItemAsync }
