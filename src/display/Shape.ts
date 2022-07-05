import DisplayObject from "./DisplayObject";
import Graphics from "./Graphics";

export default class Shape extends DisplayObject {

    constructor(public graphics: Graphics = new Graphics()) {
        super();
    }

    public isVisible(): boolean {
        const hasContent = this.cacheCanvas || (this.graphics && !this.graphics.isEmpty());
        return !!(this.visible && this.alpha > 0 && this.scaleX != 0 && this.scaleY != 0 && hasContent);
    }

    public draw(ctx: CanvasRenderingContext2D, ignoreCache?: boolean): boolean {
        if (super.draw(ctx, ignoreCache)) {
            return true;
        }
        this.graphics.draw(ctx);
        return true;
    }

    public clone(recursive?: boolean): Shape {
        const g = (recursive && this.graphics) ? this.graphics.clone() : this.graphics;
        const shape = new Shape((g));
        this.cloneProps(shape);
        return shape;
    }

    public toString(): string {
        return `[Shape (name=${this.name})]`;
    }
}