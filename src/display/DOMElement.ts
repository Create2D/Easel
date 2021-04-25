import DisplayProps from "../geom/DisplayProps";

import DisplayObject from "./DisplayObject";

export default class DOMElement extends DisplayObject {

    public htmlElement?: HTMLElement;
    protected _oldProps?: DisplayProps;
    protected _oldStage?: DisplayObject;
    protected _drawAction: any;

    constructor(htmlElement: HTMLElement|string|null) {
        super();

        if (typeof (htmlElement) == "string") {
            htmlElement = document.getElementById(htmlElement);
        }
        this.mouseEnabled = false;

        if (htmlElement) {
            const style: CSSStyleDeclaration = htmlElement.style;
            style.position = "absolute";
            style.transformOrigin = "0% 0%";
            // @ts-ignore compatibility
            style.WebkitTransformOrigin = style.msTransformOrigin = style.MozTransformOrigin = style.OTransformOrigin = style.transformOrigin;
            this.htmlElement = htmlElement;
        }
    }

    public isVisible(): boolean {
        return !!this.htmlElement;
    }

    public draw(ctx: CanvasRenderingContext2D, ignoreCache: boolean): boolean {
        // this relies on the _tick method because draw isn't called if the parent is not visible.
        // the actual update happens in _handleDrawEnd
        return true;
    }

    public cache() {}
    public uncache() {}
    public updateCache() {}
    // public hitTest() {}
    // public localToGlobal() {}
    // public globalToLocal() {}
    // public localToLocal() {};

    public clone(recursive?: boolean): never {
        throw("DOMElement cannot be cloned.");
    }

    public toString(): string {
        return `[DOMElement (name=${this.name})]`;
    }

    public _tick(evtObj: any) {
        const stage = this.stage;
        if(stage && stage !== this._oldStage) {
            this._drawAction && stage.off("drawend", this._drawAction);
            this._drawAction = stage.on("drawend", this._handleDrawEnd, this);
            this._oldStage = stage;
        }
        super._tick(evtObj);
    }

    protected _handleDrawEnd(evt: object): boolean|void {
        const o = this.htmlElement;
        if (!o) { return; }
        const style = o.style;

        const props = this.getConcatenatedDisplayProps(this._props), mtx = props.matrix;

        const visibility = props.visible ? "visible" : "hidden";
        if (visibility != style.visibility) { style.visibility = visibility; }
        if (!props.visible) { return; }

        let oldProps = this._oldProps, oldMtx = oldProps&&oldProps.matrix;
        const n = 10000; // precision

        if (!oldMtx || !oldMtx.equals(mtx)) {
            const str = "matrix(" + (mtx.a*n|0)/n +","+ (mtx.b*n|0)/n +","+ (mtx.c*n|0)/n +","+ (mtx.d*n|0)/n +","+ (mtx.tx+0.5|0);
            // @ts-ignore
            style.transform = style.WebkitTransform = style.OTransform = style.msTransform = str +","+ (mtx.ty+0.5|0) +")";
            // @ts-ignore
            style.MozTransform = str +"px,"+ (mtx.ty+0.5|0) +"px)";
            if (!oldProps) {
                oldProps = this._oldProps = new DisplayProps(true);
            }
            oldProps.matrix.copy(mtx);
        }

        if (oldProps && oldProps.alpha != props.alpha) {
            style.opacity = ""+(props.alpha*n|0)/n;
            oldProps.alpha = props.alpha;
        }
    }
}
