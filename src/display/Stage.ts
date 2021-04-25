import {Event as CEvent} from "@create2d/core";

import {default as CMouseEvent} from "../events/MouseEvent";
import Rectangle from "../geom/Rectangle";

import Container from "./Container";
import DisplayObject from "./DisplayObject";

interface PointerData {
    x: number,
    y: number,
    rawX?: number,
    rawY?: number,
    event?: any,
    target?: any,
    overTarget?: boolean,
    overX?: boolean,
    overY?: boolean,
    inBounds?: boolean,
    posEvtObj?: any,

    down?: boolean
}

export default class Stage extends Container {
    public readonly isStage: boolean = true;

    public autoClear: boolean = true;
    public canvas: HTMLCanvasElement;

    public mouseX = 0;
    public mouseY = 0;

    public drawRect?: Rectangle;
    public snapToPixelEnabled = false;
    public mouseInBounds = false;
    public tickOnUpdate = true;
    public mouseMoveOutside = false;
    public preventSelection = true;

    private _pointerData: {[k: string]:PointerData} = {};
    // private _pointerCount: number = 0;
    private _primaryPointerID?: number|string;
    private _mouseOverIntervalID?: number;

    private _nextStage?: Stage;
    private _prevStage?: Stage;

    private _eventListeners: {[event: string]: any}|null = null;

    private _mouseOverX?: number;
    private _mouseOverY?: number;
    private _mouseOverTarget?: DisplayObject[];

    constructor(canvas: HTMLCanvasElement|string) {
        super();
        this.canvas = ((typeof canvas == "string") ? document.getElementById(canvas) : canvas) as HTMLCanvasElement;
        this.enableDOMEvents(true);
    }

    public get nextStage(): Stage|undefined {
        return this._nextStage;
    }
    public set nextStage(stage: Stage|undefined) {
        if (this._nextStage) { this._nextStage._prevStage = undefined; }
        if (stage) { stage._prevStage = this; }
        this._nextStage = stage;
    }

    public update(props?: any) {
        if (!this.canvas) {
            return;
        }
        if (this.tickOnUpdate) {
            this.tick(props);
        }
        if (!this.dispatchEvent("drawstart", false, true)) {
            return;
        }
        DisplayObject._snapToPixelEnabled = this.snapToPixelEnabled;
        const r = this.drawRect, ctx = this.canvas.getContext("2d");
        if (!ctx) {
            return;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (this.autoClear) {
            if (r) {
                ctx.clearRect(r.x, r.y, r.width, r.height);
            } else {
                ctx.clearRect(0, 0, this.canvas.width+1, this.canvas.height+1);
            }
        }
        ctx.save();
        if (r) {
            ctx.beginPath();
            ctx.rect(r.x, r.y, r.width, r.height);
            ctx.clip();
        }
        this.updateContext(ctx);
        this.draw(ctx, false);
        ctx.restore();
        this.dispatchEvent("drawend");
    }

    public draw(ctx: CanvasRenderingContext2D, ignoreCache?: boolean): boolean {
        const result = super.draw(ctx, ignoreCache);
        (this.canvas as any)._invalid = true;
        return result;
    }

    public tick(props: any) {
        if (!this.tickEnabled || !this.dispatchEvent("tickstart", false, true)) {
            return;
        }
        const evtObj = new CEvent("tick");
        if (props) {
            for (const n in props) {
                if (props.hasOwnProperty(n)) {
                    // @ts-ignore
                    evtObj[n] = props[n];
                }
            }
        }
        this._tick(evtObj);
        this.dispatchEvent("tickend");
    }

    public handleEvent(evt: Event) {
        if (evt.type == "tick") {
            this.update(evt);
        }
    }

    public clear() {
        if (!this.canvas) { return; }
        const ctx = this.canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width+1, this.canvas.height+1);
    }

    public toDataURL(backgroundColor?: string, mimeType: string = "image/png", encoderOptions: number = 0.92): string|undefined {
        if (!this.canvas) {
            throw "No canvas found";
        }

        let ctx = this.canvas.getContext('2d'), w = this.canvas.width, h = this.canvas.height;
        if (!ctx) {
            throw "No 2D context found";
        }

        const compositeOperation = ctx.globalCompositeOperation;
        const data = ctx.getImageData(0, 0, w, h);
        let dataURL;

        if (backgroundColor) {
            ctx.globalCompositeOperation = "destination-over";
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, w, h);
            dataURL= this.canvas.toDataURL(mimeType, encoderOptions);
            ctx.putImageData(data, 0, 0);
            ctx.globalCompositeOperation = compositeOperation;
        } else {
            dataURL = this.canvas.toDataURL(mimeType, encoderOptions);
        }

        return dataURL;
    }

    public enableMouseOver(frequency: number = 20) {
        if (this._mouseOverIntervalID) {
            clearInterval(this._mouseOverIntervalID);
            this._mouseOverIntervalID = undefined;
            if (frequency === 0) {
                this._testMouseOver(true);
            }
        }

        if (frequency <= 0) {
            return;
        }
        this._mouseOverIntervalID = setInterval(() => this._testMouseOver(), 1000/Math.min(50,frequency));
    }

    public enableDOMEvents(enable: boolean = true) {
        if (enable == null) { enable = true; }
        let n, o, ls = this._eventListeners;
        if (!enable && ls) {
            for (n in ls) {
                o = ls[n];
                o.t.removeEventListener(n, o.f, false);
            }
            this._eventListeners = null;
        } else if (enable && !ls && this.canvas) {
            // @ts-ignore node
            const t = window.addEventListener ? window : document;
            const _this = this;
            ls = this._eventListeners = {
                mouseup: {t:t, f:function(e: MouseEvent) { _this._handleMouseUp(e)} },
                mousemove: {t:t, f:function(e: MouseEvent) { _this._handleMouseMove(e)} },
                dblclick: {t:this.canvas, f:function(e: MouseEvent) { _this._handleDoubleClick(e)} },
                mousedown: {t:this.canvas, f:function(e: MouseEvent & WheelEvent) { _this._handleMouseDown(e)} }
            };

            for (const n in ls) {
                o = ls[n];
                o.t.addEventListener && o.t.addEventListener(n, o.f, false);
            }
        }
    }

    public clone(): Stage {
        throw("Stage cannot be cloned.");
    }

    public toString(): string {
        return `[Stage (name=${this.name})]`;
    }

    protected _getElementRect(e: HTMLElement) {
        let bounds: ClientRect | DOMRect | {top: number, bottom: number, left: number, right: number, width: number, height: number};
        try {
            // this can fail on disconnected DOM elements in IE9
            bounds = e.getBoundingClientRect();
        } catch (err) {
            bounds = {top: e.offsetTop, bottom: 0, left: e.offsetLeft, right: 0, width:e.offsetWidth, height:e.offsetHeight};
        }

        const protoDoc = document as any;
        const offX: number = (window.pageXOffset || protoDoc.scrollLeft || 0) - (protoDoc.clientLeft || protoDoc.body.clientLeft || 0);
        const offY: number = (window.pageYOffset || protoDoc.scrollTop || 0) - (protoDoc.clientTop  || protoDoc.body.clientTop  || 0);

        // @ts-ignore IE <9 compatibility.
        const styles = window.getComputedStyle ? getComputedStyle(e,null) : e.currentStyle;
        const padL = parseInt(styles.paddingLeft)+parseInt(styles.borderLeftWidth);
        const padT = parseInt(styles.paddingTop)+parseInt(styles.borderTopWidth);
        const padR = parseInt(styles.paddingRight)+parseInt(styles.borderRightWidth);
        const padB = parseInt(styles.paddingBottom)+parseInt(styles.borderBottomWidth);

        // note: in some browsers bounds properties are read only.
        return {
            left: bounds.left+offX+padL,
            right: bounds.right+offX-padR,
            top: bounds.top+offY+padT,
            bottom: bounds.bottom+offY-padB
        }
    }

    protected _getPointerData(id: number|string): PointerData {
        let data = this._pointerData && this._pointerData[id];
        if (!data) {
            data = {x:0,y:0};
            this._pointerData && (this._pointerData[id] = data);
        }
        return data;
    }

    protected _handleMouseMove(e: any = window.event) {
        this._handlePointerMove(-1, e, e.pageX, e.pageY);
    }

    _handlePointerMove(id: number|string, e: MouseEvent, pageX: number, pageY: number, owner?: Stage) {
        if (this._prevStage && owner === undefined) { return; } // redundant listener.
        if (!this.canvas) { return; }
        const nextStage=this._nextStage, o=this._getPointerData(id);

        const inBounds = o.inBounds;
        this._updatePointerPosition(id, e, pageX, pageY);
        if (inBounds || o.inBounds || this.mouseMoveOutside) {
            if (id === -1 && o.inBounds == !inBounds) {
                this._dispatchMouseEvent(this, (inBounds ? "mouseleave" : "mouseenter"), false, id, o, e);
            }

            this._dispatchMouseEvent(this, "stagemousemove", false, id, o, e);
            this._dispatchMouseEvent(o.target, "pressmove", true, id, o, e);
        }

        nextStage&&nextStage._handlePointerMove(id, e, pageX, pageY);
    }

    protected _updatePointerPosition(id: number|string, e: object, pageX: number, pageY: number) {
        const rect = this._getElementRect(this.canvas);
        pageX -= rect.left;
        pageY -= rect.top;

        const w = this.canvas.width;
        const h = this.canvas.height;
        pageX /= (rect.right-rect.left)/w;
        pageY /= (rect.bottom-rect.top)/h;
        const o = this._getPointerData(id);
        o.inBounds = pageX >= 0 && pageY >= 0 && pageX <= w-1 && pageY <= h-1;
        if (o.inBounds) {
            o.x = pageX;
            o.y = pageY;
        } else if (this.mouseMoveOutside) {
            o.x = pageX < 0 ? 0 : (pageX > w-1 ? w-1 : pageX);
            o.y = pageY < 0 ? 0 : (pageY > h-1 ? h-1 : pageY);
        }

        o.posEvtObj = e;
        o.rawX = pageX;
        o.rawY = pageY;

        if (id === this._primaryPointerID || id === -1) {
            this.mouseX = o.x;
            this.mouseY = o.y;
            this.mouseInBounds = o.inBounds;
        }
    }

    protected _handleMouseUp(e: MouseEvent) {
        this._handlePointerUp(-1, e, false);
    }

    _handlePointerUp(id: string|number, e: MouseEvent, clear: boolean, owner: Stage | null = null) {
        const nextStage = this._nextStage, o = this._getPointerData(id);
        if (this._prevStage && owner === undefined) { return; } // redundant listener.

        let target, oTarget = o.target;
        if (!owner && (oTarget || nextStage)) {
            target = this._getObjectsUnderPoint(o.x, o.y, null, true);
        }

        if (o.down) {
            this._dispatchMouseEvent(this, "stagemouseup", false, id, o, e, target);
            o.down = false;
        }

        if (target == oTarget) { this._dispatchMouseEvent(oTarget, "click", true, id, o, e); }
        this._dispatchMouseEvent(oTarget, "pressup", true, id, o, e);

        if (clear) {
            if (id==this._primaryPointerID) { this._primaryPointerID = undefined; }
            delete(this._pointerData[id]);
        } else {
            o.target = null;
        }

        nextStage&&nextStage._handlePointerUp(id, e, clear, owner || target && this);
    }

    protected _handleMouseDown (e: MouseEvent) {
        this._handlePointerDown(-1, e, e.pageX, e.pageY);
    }

    _handlePointerDown(id: number|string, e: MouseEvent, pageX: number, pageY: number, owner: Stage | null = null) {
        if (this.preventSelection) { e.preventDefault(); }
        if (this._primaryPointerID == null || id === -1) { this._primaryPointerID = id; } // mouse always takes over.

        if (pageY != null) { this._updatePointerPosition(id, e, pageX, pageY); }
        let target, nextStage = this._nextStage, o = this._getPointerData(id);
        if (!owner) {
            target = o.target = this._getObjectsUnderPoint(o.x, o.y, null, true);
        }

        if (o.inBounds) {
            this._dispatchMouseEvent(this, "stagemousedown", false, id, o, e, target);
            o.down = true;
        }

        this._dispatchMouseEvent(target, "mousedown", true, id, o, e);

        nextStage&&nextStage._handlePointerDown(id, e, pageX, pageY, owner || target && this);
    }

    protected _testMouseOver(clear?: boolean, owner: Stage | null = null, eventTarget: Stage | null = null) {
        if (this._prevStage && owner === undefined) { return; } // redundant listener.

        const nextStage = this._nextStage;
        if (!this._mouseOverIntervalID) {
            // not enabled for mouseover, but should still relay the event.
            nextStage&&nextStage._testMouseOver(clear, owner, eventTarget);
            return;
        }
        const o = this._getPointerData(-1);
        // only update if the mouse position has changed. This provides a lot of optimization, but has some trade-offs.
        if (!o || (!clear && this.mouseX == this._mouseOverX && this.mouseY == this._mouseOverY && this.mouseInBounds)) { return; }

        const e = o.posEvtObj;
        const isEventTarget = eventTarget || e&&(e.target == this.canvas);
        let target, common = -1, cursor="", t, i, l;

        if (!owner && (clear || this.mouseInBounds && isEventTarget)) {
            target = this._getObjectsUnderPoint(this.mouseX, this.mouseY, null, true);
            this._mouseOverX = this.mouseX;
            this._mouseOverY = this.mouseY;
        }

        const oldList = this._mouseOverTarget||[];
        const oldTarget = oldList[oldList.length-1];
        const list: DisplayObject[] = this._mouseOverTarget = [];

        // generate ancestor list and check for cursor:
        // Note: Internet Explorer won't update null or undefined cursor properties
        t = target;
        while (t) {
            list.unshift(t);
            if (!cursor && t.cursor) {
                cursor = t.cursor;
            }
            t = t.parent;
        }
        this.canvas.style.cursor = cursor;
        if (!owner && eventTarget) {
            eventTarget.canvas.style.cursor = cursor;
        }

        // find common ancestor:
        for (i=0,l=list.length; i<l; i++) {
            if (list[i] != oldList[i]) { break; }
            common = i;
        }

        if (oldTarget != target) {
            this._dispatchMouseEvent(oldTarget, "mouseout", true, -1, o, e, target);
        }

        for (i=oldList.length-1; i>common; i--) {
            this._dispatchMouseEvent(oldList[i], "rollout", false, -1, o, e, target);
        }

        for (i=list.length-1; i>common; i--) {
            this._dispatchMouseEvent(list[i], "rollover", false, -1, o, e, oldTarget);
        }

        if (oldTarget != target) {
            this._dispatchMouseEvent(target, "mouseover", true, -1, o, e, oldTarget);
        }

        nextStage&&nextStage._testMouseOver(clear, owner || target && this, eventTarget || isEventTarget ? this : null);
    }

    protected _handleDoubleClick(e: MouseEvent, owner: Stage | null = null) {
        let target=null, nextStage=this._nextStage, o=this._getPointerData(-1);
        if (!owner) {
            target = this._getObjectsUnderPoint(o.x, o.y, null, true);
            this._dispatchMouseEvent(target, "dblclick", true, -1, o, e);
        }
        nextStage&&nextStage._handleDoubleClick(e, owner || target && this);
    }

    protected _dispatchMouseEvent(target: DisplayObject|undefined, type: string, bubbles: boolean, pointerId: number|string, o: any, nativeEvent?: MouseEvent, relatedTarget?: DisplayObject) {
        // TODO: might be worth either reusing MouseEvent instances, or adding a willTrigger method to avoid GC.
        if (!target || (!bubbles && !target.hasEventListener(type))) { return; }
        /*
        // TODO: account for stage transformations?
        this._mtx = this.getConcatenatedMatrix(this._mtx).invert();
        var pt = this._mtx.transformPoint(o.x, o.y);
        var evt = new createjs.MouseEvent(type, bubbles, false, pt.x, pt.y, nativeEvent, pointerId, pointerId==this._primaryPointerID || pointerId==-1, o.rawX, o.rawY);
        */
        const evt = new CMouseEvent(type, bubbles, false, o.x, o.y, nativeEvent, pointerId, pointerId === this._primaryPointerID || pointerId === -1, o.rawX, o.rawY, relatedTarget);
        target.dispatchEvent(evt);
    }
}
