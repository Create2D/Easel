import {EventDispatcher} from "@create2d/core";

import BitmapCache from "../filters/BitmapCache";
import DisplayProps from "../geom/DisplayProps";
import Filter from "../filters/Filter";
import Matrix2D from "../geom/Matrix2D";
import Point from "../geom/Point";
import Rectangle from "../geom/Rectangle";
import createCanvas from "../utils/Canvas";
import UID from "../utils/UID";

import Container from "./Container";
import Shadow from "./Shadow";
import Shape from "./Shape";

export declare const enum StageGLStyle {
    NONE,
    SPRITE,
    BITMAP,
}

export default abstract class DisplayObject extends EventDispatcher {
    public visible: boolean = true;
    public alpha: number = 1;
    public shadow?: Shadow;
    public cacheCanvas?: HTMLCanvasElement|WebGLTexture;
    public bitmapCache?: BitmapCache;
    public id = UID.get();
    public mouseEnabled: boolean = true;
    public tickEnabled: boolean = true;
    public name?: string;
    public parent?: Container;

    public x: number = 0;
    public y: number = 0;
    public scaleX: number = 1;
    public scaleY: number = 1;
    public rotation: number = 0;
    public skewX: number = 0;
    public skewY: number = 0;
    public regX: number = 0;
    public regY: number = 0;

    transformMatrix?: Matrix2D;
    public compositeOperation?: CompositeOperation;
    protected snapToPixel?: boolean = true;
    public filters?: Filter[];
    public mask?: Shape;
    public hitArea?: DisplayObject;
    public cursor?: string;

    public _props: DisplayProps = new DisplayProps();
    protected _rectangle: Rectangle = new Rectangle();
    protected _bounds?: Rectangle;
    public _webGLRenderStyle: StageGLStyle = StageGLStyle.NONE;
    public _glMtx: Matrix2D = new Matrix2D();

    protected static _MOUSE_EVENTS = ["click","dblclick","mousedown","mouseout","mouseover","pressmove","pressup","rollout","rollover"];
    public static suppressCrossDomainErrors: boolean = false;
    protected static _snapToPixelEnabled: boolean = false;

    public static _hitTestCanvas: HTMLCanvasElement|object;
    public static _hitTestContext: CanvasRenderingContext2D;

    public get stage(): DisplayObject|undefined {
        let o: Container|DisplayObject = this;
        while (o.parent) {
            o = o.parent;
        }
        if ((o as any).isStage) {
            return o;
        }
    }

    public get cacheID(): number {
        return this.bitmapCache && this.bitmapCache.cacheID || 0;
    }

    public set cacheID(a: number) {
        this.bitmapCache && (this.bitmapCache.cacheID = a)
    }

    public get scale(): number {
        return this.scaleX;
    }
    public set scale(s: number) {
        this.scaleX = this.scaleY = s;
    }

    public isVisible(): boolean {
        return this.visible && this.alpha > 0 && this.scaleX != 0 && this.scaleY != 0;
    }

    public draw(ctx: CanvasRenderingContext2D, ignoreCache: boolean = false): boolean {
        return this.drawCache(ctx, ignoreCache);

    }

    public drawCache(ctx: CanvasRenderingContext2D, ignoreCache: boolean = false): boolean {
        const cache = this.bitmapCache;
        if (cache && !ignoreCache) {
            return cache.draw(ctx);
        }
        return false;
    }

    public updateContext(ctx: CanvasRenderingContext2D) {
        const mask = this.mask, mtx = this._props.matrix;

        if (mask && mask.graphics && !mask.graphics.isEmpty()) {
            mask.getMatrix(mtx);
            ctx.transform(mtx.a,  mtx.b, mtx.c, mtx.d, mtx.tx, mtx.ty);

            mask.graphics.drawAsPath(ctx);
            ctx.clip();

            mtx.invert();
            ctx.transform(mtx.a,  mtx.b, mtx.c, mtx.d, mtx.tx, mtx.ty);
        }

        this.getMatrix(mtx);
        let tx = mtx.tx, ty = mtx.ty;
        if (DisplayObject._snapToPixelEnabled && this.snapToPixel) {
            tx = tx + (tx < 0 ? -0.5 : 0.5) | 0;
            ty = ty + (ty < 0 ? -0.5 : 0.5) | 0;
        }
        ctx.transform(mtx.a,  mtx.b, mtx.c, mtx.d, tx, ty);
        ctx.globalAlpha *= this.alpha;
        if (this.compositeOperation) {
            ctx.globalCompositeOperation = this.compositeOperation;
        }
        if (this.shadow) {
            this._applyShadow(ctx, this.shadow);
        }
    }

    public cache(x: number, y: number, width: number, height: number, scale: number=1, options?: object) {
        if (!this.bitmapCache){
            this.bitmapCache = new BitmapCache();
        } else {
            this.bitmapCache._autoGenerated = false;
        }
        this.bitmapCache.define(this, x, y, width, height, scale, options);
    }

    public updateCache(compositeOperation?: CompositeOperation) {
        if (!this.bitmapCache) {
            throw "cache() must be called before updateCache()";
        }
        this.bitmapCache.update(compositeOperation);
    }

    public uncache() {
        if (this.bitmapCache) {
            this.bitmapCache.release();
            this.bitmapCache = undefined;
        }
    }

    public getCacheDataURL(type?: any, encoderOptions?: any): string|null {
        return this.bitmapCache ? this.bitmapCache.getCacheDataURL(type, encoderOptions) : null;
    }

    public localToGlobal(x: number, y: number, pt: Point = new Point()): Point {
        return this.getConcatenatedMatrix(this._props.matrix).transformPoint(x, y, pt);
    }

    public globalToLocal(x: number, y: number, pt: Point = new Point()): Point {
        return this.getConcatenatedMatrix(this._props.matrix).invert().transformPoint(x, y, pt);
    }

    public localToLocal(x: number, y: number, target: DisplayObject, pt: Point = new Point()): Point {
        pt = this.localToGlobal(x, y, pt);
        return target.globalToLocal(pt.x, pt.y, pt);
    }

    public setTransform(params: {x?: number, y?: number, scaleX?: number, scaleY?: number, rotation?: number, skewX?: number, skewY?: number, regX?: number, regY?: number}) : DisplayObject;
    public setTransform(x?: number, y?: number, scaleX?: number, scaleY?: number, rotation?: number, skewX?: number, skewY?: number, regX?: number, regY?: number): DisplayObject;
    public setTransform(xOrParams?: number|object, y?: number, scaleX?: number, scaleY?: number, rotation?: number, skewX?: number, skewY?: number, regX?: number, regY?: number): DisplayObject {
        if (xOrParams && typeof xOrParams !== 'number') {
            this.set(xOrParams);
        } else {
            this.x = xOrParams || 0;
            this.y = y || 0;
            this.scaleX = scaleX || 1;
            this.scaleY = scaleY || 1;
            this.rotation = rotation || 0;
            this.skewX = skewX || 0;
            this.skewY = skewY || 0;
            this.regX = regX || 0;
            this.regY = regY || 0;
        }
        return this;
    }

    public getMatrix(matrix: Matrix2D = new Matrix2D()): Matrix2D {
        const o = this;
        return o.transformMatrix ? matrix.copy(o.transformMatrix) :
            (matrix.identity() && matrix.appendTransform(o.x, o.y, o.scaleX, o.scaleY, o.rotation, o.skewX, o.skewY, o.regX, o.regY));
    }

    public getConcatenatedMatrix(matrix: Matrix2D = new Matrix2D()): Matrix2D {
        const mtx = this.getMatrix(matrix);
        let o: any = this.parent;
        while (o) {
            mtx.prependMatrix(o.getMatrix(o._props.matrix));
            o = o.parent;
        }
        return mtx;
    }

    public getConcatenatedDisplayProps(props: DisplayProps = new DisplayProps()) {
        props = props.identity();
        const mtx = this.getMatrix(props.matrix);
        let o: any = this;
        do {
            props.prepend(o.visible, o.alpha, o.shadow, o.compositeOperation);
            // we do this to avoid problems with the matrix being used for both operations when o._props.matrix is passed in as the props param.
            // this could be simplified (ie. just done as part of the prepend above) if we switched to using a pool.
            if (o != this) {
                mtx.prependMatrix(o.getMatrix(o._props.matrix));
            }
            o = o.parent
        } while (o);
        return props;
    }

    public set(props: {[k: string]: any}): DisplayObject {
        for (const n in props) {
            (this as {[k: string]: any})[n] = props[n];
        }
        return this;
    }

    public get bounds(): Rectangle|undefined {
        if (this._bounds) {
            return this._rectangle.copy(this._bounds);
        }
        const cache = this.bitmapCache;
        if (cache && this.cacheCanvas) {
            return cache.bounds;
        }
        return;
    }

    public getTransformedBounds(matrix?: Matrix2D|null, ignoreTransform: boolean = false): Rectangle|undefined {
        return this.transformBounds(this.bounds, matrix, ignoreTransform);
    }

    public transformBounds(bounds?: Rectangle, matrix?: Matrix2D|null, ignoreTransform: boolean = false): Rectangle|undefined {
        if (!bounds) {
            return;
        }
        let x = bounds.x, y = bounds.y, width = bounds.width, height = bounds.height, mtx = this._props.matrix;
        mtx = ignoreTransform ? mtx.identity() : this.getMatrix(mtx);

        if (x || y) { // TODO: simplify this with props
            mtx.appendTransform(0,0,1,1,0,0,0,-x,-y);
        }
        if (matrix) {
            mtx.prependMatrix(matrix);
        }

        const x_a = width*mtx.a, x_b = width*mtx.b;
        const y_c = height*mtx.c, y_d = height*mtx.d;
        const tx = mtx.tx, ty = mtx.ty;

        let minX = tx, maxX = tx, minY = ty, maxY = ty;

        (x_a > 0) ? maxX += x_a : minX += x_a;
        (y_c > 0) ? maxX += y_c : minX += y_c;

        (x_b > 0) ? maxY += x_b : minX += x_b;
        (y_d > 0) ? maxY += y_d : minX += y_d;
        
        return bounds.setValues(minX, minY, maxX-minX, maxY-minY);
    }

    public set bounds(rect: Rectangle|undefined) {
        this._bounds = rect;
    }

    public setBounds(x: number, y: number, width: number, height: number) {
        this._bounds = this._bounds || new Rectangle();
        this._bounds.setValues(x, y, width, height);
    }

    public toString(): string {
        return `[DisplayObject (name=${this.name})]`;
    }

    public abstract clone(recursive?: boolean): DisplayObject;

    protected cloneProps(o: DisplayObject): DisplayObject {
        o.alpha = this.alpha;
        o.mouseEnabled = this.mouseEnabled;
        o.tickEnabled = this.tickEnabled;
        o.name = this.name;
        o.regX = this.regX;
        o.regY = this.regY;
        o.rotation = this.rotation;
        o.scaleX = this.scaleX;
        o.scaleY = this.scaleY;
        o.shadow = this.shadow;
        o.skewX = this.skewX;
        o.skewY = this.skewY;
        o.visible = this.visible;
        o.x  = this.x;
        o.y = this.y;
        o.compositeOperation = this.compositeOperation;
        o.snapToPixel = this.snapToPixel;
        o.filters = this.filters&&this.filters.slice(0);
        o.mask = this.mask;
        o.hitArea = this.hitArea;
        o.cursor = this.cursor;
        o._bounds = this._bounds;
        o._webGLRenderStyle = this._webGLRenderStyle;
        return o;
    }

    protected _applyShadow(ctx: CanvasRenderingContext2D, shadow: Shadow) {
        shadow = shadow || Shadow.identity;
        ctx.shadowColor = shadow.color;
        ctx.shadowOffsetX = shadow.offsetX;
        ctx.shadowOffsetY = shadow.offsetY;
        ctx.shadowBlur = shadow.blur;
    }

    public _tick(event: any) {
        // because tick can be really performance sensitive, check for listeners before calling dispatchEvent.
        const ls = this.listeners;
        if (ls && ls.tick) {
            // reset & reuse the event object to avoid construction / GC costs:
            event.target = null;
            event.propagationStopped = event.immediatePropagationStopped = false;
            this.dispatchEvent(event);
        }
    }

    public hitTest(x: number, y: number): boolean {
        const ctx = DisplayObject._hitTestContext;
        ctx.setTransform(1, 0, 0, 1, -x, -y);
        // hit tests occur in a 2D context, so don't attempt to draw a GL only Texture into a 2D context
        this.draw(ctx, !(this.bitmapCache && !(this.bitmapCache._cacheCanvas instanceof WebGLTexture) ));

        const hit = this.testHit(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, 2, 2);
        return hit;
    }

    protected testHit(ctx: CanvasRenderingContext2D): boolean {
        let hit = false;
        try {
            hit = ctx.getImageData(0, 0, 1, 1).data[3] > 1;
        } catch (e) {
            if (!DisplayObject.suppressCrossDomainErrors) {
                throw "An error has occurred. This is most likely due to security restrictions on reading canvas pixel data with local or cross-domain images.";
            }
        }
        return hit;
    }

    public _updateState() {};

    public _hasMouseEventListener(): boolean {
        for (const event of DisplayObject._MOUSE_EVENTS) {
            if (this.hasEventListener(event)) {
                return true;
            }
        }
        return !!this.cursor;
    }
}

const canvas = createCanvas ? createCanvas() : document.createElement("canvas"); // prevent errors on load in browsers without canvas.
if (canvas.getContext) {
    DisplayObject._hitTestCanvas = canvas;
    DisplayObject._hitTestContext = canvas.getContext("2d");
    canvas.width = canvas.height = 1;
}