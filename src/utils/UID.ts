export default class UID {
    private constructor() {
        throw "UID cannot be instantiated";
    }

    private static _nextID: number = 0;

    public static get(): number {
        return this._nextID++;
    }
}