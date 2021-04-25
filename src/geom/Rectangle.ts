import Point from "./Point";

export default class Rectangle {

    constructor(
        public x: number = 0,
        public y: number = 0,
        public width: number = 0,
        public height: number = 0) {
    }

    public setValues(x: number = 0, y: number = 0, width: number = 0, height: number = 0): Rectangle {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        return this;
    }

    public extend({x, y}: Point): Rectangle;
    public extend({x, y, width, height}: Rectangle): Rectangle;
    public extend({x, y, width, height}: {x: number, y: number, width?: number, height?: number}): Rectangle {
        width = width || 0;
        height = height || 0;
        if (x+width > this.x+this.width) { this.width = x+width-this.x; }
        if (y+height > this.y+this.height) { this.height = y+height-this.y; }
        if (x < this.x) { this.width += this.x-x; this.x = x; }
        if (y < this.y) { this.height += this.y-y; this.y = y; }
        return this;
    }

    public pad(top: number, left: number, bottom: number, right: number): Rectangle {
        this.x -= left;
        this.y -= top;
        this.width += left+right;
        this.height += top+bottom;
        return this;
    }

    public copy(r: Rectangle): Rectangle {
        return this.setValues(r.x, r.y, r.width, r.height);
    }

    public contains({x, y}: Point): boolean;
    public contains({x, y, width, height}: Rectangle): boolean;
    public contains({x, y, width, height}: {x: number, y: number, width?: number, height?: number}): boolean {
        return (x >= this.x && x+(width||0) <= this.x+this.width && y >= this.y && y+(height||0) <= this.y+this.height);
    }

    public union(r: Rectangle): Rectangle {
        return this.clone().extend(r);
    }

    public intersection(r: Rectangle): Rectangle|null {
        let x1 = r.x, y1 = r.y, x2 = x1+r.width, y2 = y1+r.height;
        if (this.x > x1) { x1 = this.x; }
        if (this.y > y1) { y1 = this.y; }
        if (this.x + this.width < x2) { x2 = this.x + this.width; }
        if (this.y + this.height < y2) { y2 = this.y + this.height; }
        return (x2 <= x1 || y2 <= y1) ? null : new Rectangle(x1, y1, x2-x1, y2-y1);
    }

    public intersects(r: Rectangle): boolean {
        return (r.x <= this.x+this.width && this.x <= r.x+r.width && r.y <= this.y+this.height && this.y <= r.y + r.height);
    }

    public isEmpty(): boolean {
        return this.width <= 0 || this.height <= 0;
    }

    public clone(): Rectangle {
        return new Rectangle(this.x, this.y, this.width, this.height);
    }

    public toString(): string {
        return `[Rectangle (x=${this.x} y=${this.y} width=${this.width} height=${this.height})]`;
    }
}