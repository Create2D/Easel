export default class Point {
    constructor(
        public x: number = 0,
        public y: number = 0
    ) {}

    public setValues(x: number = 0, y: number = 0): Point {
        this.x = x;
        this.y = y;
        return this;
    }

    public offset(dx: number, dy: number): Point {
        this.x += dx;
        this.y += dy;
        return this;
    }

    public static polar(len: number, angle: number, pt: Point = new Point()): Point {
        pt.x = len * Math.cos(angle);
        pt.y = len * Math.sin(angle);
        return pt;
    }

    public static interpolate(pt1: Point, pt2: Point, f:number, pt: Point = new Point()): Point {
        pt.x = pt2.x + f * (pt1.x - pt2.x);
        pt.y = pt2.y + f * (pt1.y - pt2.y);
        return pt;
    }

    public copy(point: Point): Point {
        this.x = point.x;
        this.y = point.y;
        return this;
    }

    public clone(): Point {
        return new Point(this.x, this.y);
    }

    public toString(): string {
        return `[Point (x=${this.x} y=${this.y})]`;
    }
}