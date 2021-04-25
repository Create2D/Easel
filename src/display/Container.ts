import Matrix2D from "../geom/Matrix2D";
import Rectangle from "../geom/Rectangle";

import DisplayObject from "./DisplayObject";

export default class Container extends DisplayObject {
    public children: DisplayObject[] = [];
    public mouseChildren: boolean = true;
    public tickChildren: boolean = true;

    constructor() {
        super();
    }

    public get numChildren(): number {
        return this.children.length;
    }

    public isVisible(): boolean {
        const hasContent = this.cacheCanvas || this.children.length;
        return !!(this.visible && this.alpha > 0 && this.scaleX != 0 && this.scaleY != 0 && hasContent);
    }

    public draw(ctx: CanvasRenderingContext2D, ignoreCache: boolean = false): boolean {
        if (super.draw(ctx, ignoreCache)) {
            return true;
        }
        // this ensures we don't have issues with display list changes that occur during a draw:
        const list = this.children.slice();
        for (const child of list) {
            if (!child.isVisible()) {
                continue;
            }
            // draw the child:
            ctx.save();
            child.updateContext(ctx);
            child.draw(ctx);
            ctx.restore();
        }
        return true;
    }

    public addChild(child: DisplayObject, ...children: DisplayObject[]): DisplayObject {
        const l = children.length;
        if (l > 1) {
            for (const arg of children) {
                this.addChild(arg);
            }
            return children[l-1];
        }
        // Note: a lot of duplication with addChildAt, but push is WAY faster than splice.
        const parent = child.parent, silent = parent === this;
        parent && parent._removeChildAt(parent.children.indexOf(child), silent);
        child.parent = this;
        this.children.push(child);
        if (!silent) {
            child.dispatchEvent("added");
        }
        return child;
    }

    public addChildAt(child: DisplayObject, index: number): DisplayObject {
        const l = arguments.length;
        const idx = arguments[l-1]; // can't use the same name as the index param or it replaces arguments[1]
        if (idx < 0 || idx > this.children.length) {
            return arguments[l-2];
        }
        if (l > 2) {
            for (let i=0; i<l-1; i++) {
                this.addChildAt(arguments[i], idx+i);
            }
            return arguments[l-2];
        }
        const parent = child.parent;
        const silent = parent === this;
        parent && parent._removeChildAt(parent.children.indexOf(child), silent);
        child.parent = this;
        this.children.splice(index, 0, child);
        if (!silent) {
            child.dispatchEvent("added");
        }
        return child;
    }

    public removeChild(child: DisplayObject): boolean {
        const l = arguments.length;
        if (l > 1) {
            let good = true;
            for (let i=0; i<l; i++) {
                good = good && this.removeChild(arguments[i]);
            }
            return good;
        }
        return this._removeChildAt(this.children.indexOf(child));
    }

    public removeChildAt(index: number): boolean {
        const l = arguments.length;
        if (l > 1) {
            const a = [];
            for (let i=0; i<l; i++) { a[i] = arguments[i]; }
            a.sort(function(a, b) { return b-a; });
            let good = true;
            for (let i=0; i<l; i++) { good = good && this._removeChildAt(a[i]); }
            return good;
        }
        return this._removeChildAt(index);
    }

    public removeAllChildren() {
        const kids = this.children;
        while (kids.length) {
            this._removeChildAt(0);
        }
    }

    public getChildAt(index: number): DisplayObject {
        return this.children[index];
    }

    public getChildByName(name: string): DisplayObject|null {
        const kids = this.children;
        for (let i=0,l=kids.length;i<l;i++) {
            if(kids[i].name === name) { return kids[i]; }
        }
        return null;
    }

    public sortChildren(sortFunction: (a: DisplayObject, b: DisplayObject) => number) {
        this.children.sort(sortFunction);
    }

    public getChildIndex(child: DisplayObject): number {
        return this.children.indexOf(child);
    }

    public swapChildrenAt(index1: number, index2: number) {
        const kids = this.children;
        const o1 = kids[index1];
        const o2 = kids[index2];
        if (!o1 || !o2) {
            return;
        }
        kids[index1] = o2;
        kids[index2] = o1;
    }

    public swapChildren(child1: DisplayObject, child2: DisplayObject) {
        const kids = this.children;
        let i, index1, index2;
        const l = kids.length;
        for (i=0 ; i<l ; i++) {
            if (kids[i] == child1) {
                index1 = i;
            }
            if (kids[i] == child2) {
                index2 = i;
            }
            if (index1 && index2) {
                [kids[index1], kids[index2]] = [kids[index2], kids[index1]];
                return;
            }
        }
        throw  `Cannot swap children, child${ !index1 ? '1' : '2'} is not a child of this container`;
    }

    public setChildIndex(child: DisplayObject, index: number) {
        const kids = this.children, l=kids.length;
        if (child.parent != this || index < 0 || index >= l) { return; }
        let i;
        for (i=0;i<l;i++) {
            if (kids[i] == child) { break; }
        }
        if (i==l || i == index) { return; }
        kids.splice(i,1);
        kids.splice(index,0,child);
    }

    public contains(child?: DisplayObject): boolean {
        while(child) {
            if (child == this) {
                return true;
            }
            child = child.parent;
        }
        return false;
    }

    public hitTest(x: number, y: number): boolean {
        // TODO: optimize to use the fast cache check where possible.
        return this.getObjectUnderPoint(x, y) != null
    }

    public getObjectsUnderPoint(x: number, y: number, mode:number = 0): DisplayObject[] {
        const arr: DisplayObject[] = [];
        const pt = this.localToGlobal(x, y);
        this._getObjectsUnderPoint(pt.x, pt.y, arr, mode>0, mode===1);
        return arr;
    }

    public getObjectUnderPoint(x: number, y: number, mode: number=-1): DisplayObject|undefined { // mode: 0-all, 1-respect mouseEnabled/mouseChildren, 2-only mouse opaque objects.
        const pt = this.localToGlobal(x, y);
        return this._getObjectsUnderPoint(pt.x, pt.y, [], mode>0, mode===1);
    }

    public get bounds(): Rectangle|undefined {
        return this.getTransformedBounds(null, true);
    }

    public getTransformedBounds(matrix?: Matrix2D|null, ignoreTransform: boolean = false): Rectangle|undefined {
        let bounds = super.bounds;
        if (bounds) {
            return this.transformBounds(bounds, matrix, ignoreTransform);
        }

        let mtx = this._props.matrix;
        mtx = ignoreTransform ? mtx.identity() : this.getMatrix(mtx);
        if (matrix) {
            mtx.prependMatrix(matrix);
        }

        const l = this.children.length;
        let rect;
        for (let i=0; i<l; i++) {
            const child = this.children[i];
            if (!child.visible || !(bounds = child.getTransformedBounds(mtx))) {
                continue;
            }
            if (rect) {
                rect.extend(bounds);
            } else {
                rect = bounds.clone();
            }
        }
        return rect;
    }

    public clone(recursive?: boolean) {
        const o = new Container();
        this.cloneProps(o);
        if (recursive) {
            this._cloneChildren(o);
        }
        return o;
    }

    public toString(): string {
        return `[Container (name=${this.name})]`;
    }

    public _tick(evtObj: any) {
        if (this.tickChildren) {
            for (const child of this.children.reverse()) {
                if (child.tickEnabled && child._tick) { child._tick(evtObj); }
            }
        }
        super._tick(evtObj);
    }

    protected _cloneChildren(o: Container) {
        if (o.children.length) {
            o.removeAllChildren();
        }
        const arr = o.children;
        for (const child of this.children) {
            const clone = child.clone( true);
            clone.parent = o;
            arr.push(clone);
        }
    }

    public _removeChildAt(index: number, silent?: boolean): boolean {
        if (index < 0 || index > this.children.length-1) {
            return false;
        }
        const child = this.children[index];
        if (child) {
            child.parent = undefined;
        }
        this.children.splice(index, 1);
        if (!silent) {
            child.dispatchEvent("removed");
        }
        return true;
    }

    public _getObjectsUnderPoint(x: number, y: number, arr: DisplayObject[]|null, mouse: boolean, activeListener?: boolean, currentDepth: number = 0): DisplayObject|undefined {
        if (!this._testMask(this, x, y)) {
            return;
        }
        let mtx;
        const ctx = DisplayObject._hitTestContext;
        activeListener = activeListener || (mouse&&this._hasMouseEventListener());

        // draw children one at a time, and check if we get a hit:
        const children = this.children, l = children.length;
        for (let i=l-1; i>=0; i--) {
            const child: DisplayObject = children[i];
            let hitArea = child.hitArea;
            if (!child.visible || (!hitArea && !child.isVisible()) || (mouse && !child.mouseEnabled)) { continue; }
            if (!hitArea && !this._testMask(child, x, y)) { continue; }

            // if a child container has a hitArea then we only need to check its hitAre2a, so we can treat it as a normal DO:
            if (!hitArea && child instanceof Container) {
                const result = child._getObjectsUnderPoint(x, y, arr, mouse, activeListener, currentDepth+1);
                if (!arr && result) {
                    return (mouse && !this.mouseChildren) ? this : result; }
            } else {
                if (mouse && !activeListener && !child._hasMouseEventListener()) { continue; }

                // TODO: can we pass displayProps forward, to avoid having to calculate this backwards every time? It's kind of a mixed bag. When we're only hunting for DOs with event listeners, it may not make sense.
                let props = child.getConcatenatedDisplayProps(child._props);
                mtx = props.matrix;

                console.log("child", props.toString(), child, child._props.toString());

                if (hitArea) {
                    mtx.appendMatrix(hitArea.getMatrix(hitArea._props.matrix));
                    props.alpha = hitArea.alpha;
                }


                ctx.globalAlpha = props.alpha;
                ctx.setTransform(mtx.a, mtx.b, mtx.c, mtx.d, mtx.tx-x, mtx.ty-y);
                (hitArea || child).draw(ctx);
                if (!this.testHit(ctx)) {
                    continue;
                }
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, 2, 2);
                if (arr) {
                    arr.push(child);
                } else {
                    return (mouse && !this.mouseChildren) ? this : child;
                }
            }
        }
        return;
    }

    protected _testMask(target: DisplayObject, x: number, y: number): boolean {
        const mask = target.mask;
        if (!mask || !mask.graphics || mask.graphics.isEmpty()) { return true; }

        let mtx = this._props.matrix, parent = target.parent;
        mtx = parent ? parent.getConcatenatedMatrix(mtx) : mtx.identity();
        mtx = mask.getMatrix(mask._props.matrix).prependMatrix(mtx);

        const ctx = DisplayObject._hitTestContext;
        ctx.setTransform(mtx.a,  mtx.b, mtx.c, mtx.d, mtx.tx-x, mtx.ty-y);

        // draw the mask as a solid fill:
        mask.graphics.drawAsPath(ctx);
        ctx.fillStyle = "#000";
        ctx.fill();

        if (!this.testHit(ctx)) { return false; }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, 2, 2);

        return true;
    }
}
