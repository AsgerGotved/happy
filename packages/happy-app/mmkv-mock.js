/**
 * In-memory MMKV mock for Expo Go development.
 * Replaces react-native-mmkv when native modules aren't available.
 * Data is not persisted between reloads.
 */
class MMKVMock {
    constructor() {
        this._store = new Map();
    }
    getString(key) {
        const val = this._store.get(key);
        return typeof val === 'string' ? val : undefined;
    }
    getNumber(key) {
        const val = this._store.get(key);
        return typeof val === 'number' ? val : undefined;
    }
    getBoolean(key) {
        const val = this._store.get(key);
        return typeof val === 'boolean' ? val : undefined;
    }
    set(key, value) {
        this._store.set(key, value);
    }
    delete(key) {
        this._store.delete(key);
    }
    clearAll() {
        this._store.clear();
    }
    getAllKeys() {
        return Array.from(this._store.keys());
    }
    contains(key) {
        return this._store.has(key);
    }
}

module.exports = { MMKV: MMKVMock };
