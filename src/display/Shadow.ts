export default class Shadow {

    constructor(
        public readonly color: string = 'black',
        public readonly offsetX: number = 0,
        public readonly offsetY: number = 0,
        public readonly blur: number = 0
    ) {}

    public static readonly identity = new Shadow("transparent", 0, 0, 0);

    public toString(): string {
        return "[Shadow]";
    }

    public clone(): Shadow {
        return new Shadow(this.color, this.offsetX, this.offsetY, this.blur);
    }
}