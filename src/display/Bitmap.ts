import Rectangle from "../geom/Rectangle";

import DisplayObject, {StageGLStyle} from "./DisplayObject";

export default class Bitmap extends DisplayObject {
    sourceRect: Rectangle|null = null;
    image: CanvasImageSource;

    // Not sure it belongs here
    _uvRect?: any;

    constructor(imageOrUri: CanvasImageSource|string) {
        super();

        if (typeof imageOrUri == "string") {
            this.image = document.createElement("img");
            this.image.src = imageOrUri;
        } else {
            this.image = imageOrUri;
        }

        this._webGLRenderStyle = StageGLStyle.BITMAP;
    }

    public isVisible(): boolean {
        const image = this.image;
        const protoImage = image as any;
        const hasContent = this.cacheCanvas || (image && (protoImage.naturalWidth || protoImage.getContext || protoImage.readyState >= 2));
        return !!(this.visible && this.alpha > 0 && this.scaleX != 0 && this.scaleY != 0 && hasContent);
    }

    /**
     * Draws the display object into the specified context ignoring its visible, alpha, shadow, and transform.
     * Returns true if the draw was handled (useful for overriding functionality).
     *
     * NOTE: This method is mainly for internal use, though it may be useful for advanced uses.
     * @method draw
     * @param {CanvasRenderingContext2D} ctx The canvas 2D context object to draw into.
     * @param {Boolean} [ignoreCache=false] Indicates whether the draw operation should ignore any current cache.
     * For example, used for drawing the cache (to prevent it from simply drawing an existing cache back
     * into itself).
     * @return {Boolean}
     **/
    public draw(ctx: CanvasRenderingContext2D, ignoreCache: boolean = false): boolean {
        if (super.draw(ctx, ignoreCache)) {
            return true;
        }
        const rect = this.sourceRect;
        let img = this.image;
        if ((img as any).getImage) {
            img = (img as any).getImage();
        }
        if (!img) {
            return true;
        }
        if (rect && !(img instanceof SVGImageElement)) {
            // some browsers choke on out of bound values, so we'll fix them:
            let x1 = rect.x, y1 = rect.y, x2 = x1 + rect.width, y2 = y1 + rect.height, x = 0, y = 0, w = img.width, h = img.height;
            if (x1 < 0) { x -= x1; x1 = 0; }
            if (x2 > w) { x2 = w; }
            if (y1 < 0) { y -= y1; y1 = 0; }
            if (y2 > h) { y2 = h; }
            ctx.drawImage(img, x1, y1, x2-x1, y2-y1, x, y, x2-x1, y2-y1);
        } else {
            ctx.drawImage(img, 0, 0);
        }
        return true;
    }

    public get bounds(): Rectangle|undefined {
        let rect = super.bounds;
        if (rect) { return rect; }
        const image = this.image as any;
        const o = this.sourceRect || image;
        const hasContent = (image && (image.naturalWidth || image.getContext || image.readyState >= 2));
        return (hasContent && !(o instanceof SVGImageElement)) ? this._rectangle.setValues(0, 0, o.width, o.height) : undefined;
    }

    public clone(node: boolean = false): Bitmap {
        let image = this.image as any;
        if(image && node){
            image = image.cloneNode();
        }
        const o = new Bitmap(image);
        this.sourceRect && (o.sourceRect = this.sourceRect.clone());
        this.cloneProps(o);
        return o;
    }

    /**
     * Returns a string representation of this object.
     * @method toString
     * @return {String} a string representation of the instance.
     **/
    public toString(): string {
        return `[Bitmap (name=${this.name})]`;
    }
}