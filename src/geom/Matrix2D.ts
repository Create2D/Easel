import Point from "./Point";
import DisplayObject from "../display/DisplayObject";
import Transform from "./Transform";

const DEG_TO_RAD = Math.PI/180;
export default class Matrix2D {
    public modified = true;

    constructor(
        public a: number = 1,
        public b: number = 0,
        public c: number = 0,
        public d: number = 1,
        public tx: number = 0,
        public ty: number = 0
    ) {}

    public setValues(a: number = 1, b: number = 0, c: number = 0, d: number = 1, tx: number = 0, ty: number = 0): this {
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
        this.tx = tx;
        this.ty = ty;

        this.modified = true;

        return this;
    }

    // (this matrix) * (specified matrix)
    public append(a: number, b: number, c: number, d: number, tx: number, ty: number): this {
        const a1 = this.a;
        const b1 = this.b;
        const c1 = this.c;
        const d1 = this.d;

        this.a = a1 * a + c1 * b;
        this.b = b1 * a + d1 * b;
        this.c = a1 * c + c1 * d;
        this.d = b1 * c + d1 * d;

        this.tx += a1 * tx + c1 * ty;
        this.ty += b1 * tx + d1 * ty;

        this.modified = true;

        return this;
    }

    // (this matrix) * (specified matrix)
    public appendMatrix(matrix: Matrix2D): Matrix2D {
        return matrix.modified ? this.append(matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty) : this;
    }

    // (specified matrix) * (this matrix)
    public prepend(a: number, b: number, c: number, d: number, tx: number, ty: number): this {
        const a1 = this.a;
        const c1 = this.c;
        const tx1 = this.tx;

        this.a = a * a1 + c * this.b;
        this.b = b * a1 + d * this.b;
        this.c = a * c1 + c * this.d;
        this.d = b * c1 + d * this.d;

        this.tx = a * tx1 + c * this.ty + tx;
        this.ty = b * tx1 + d * this.ty + ty;

        this.modified = true;

        return this;
    }

    // (specified matrix) * (this matrix)
    public prependMatrix(matrix: Matrix2D): this {
        return matrix.modified ? this.prepend(matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty) : this;
    }

    public appendTransform(x: number, y: number, scaleX: number, scaleY: number, rotation: number, skewX: number, skewY: number, regX: number, regY: number): this {
        let cos = 1;
        let sin = 0;
        if (rotation % 360) {
            const r = rotation * DEG_TO_RAD;
            cos = Math.cos(r);
            sin = Math.sin(r);
        }

        if (skewX || skewY) {
            // TODO: can this be combined into a single append operation?
            skewX *= DEG_TO_RAD;
            skewY *= DEG_TO_RAD;
            this.append(Math.cos(skewY), Math.sin(skewY), -Math.sin(skewX), Math.cos(skewX), x, y);
            this.append(cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY, 0, 0);
        } else {
            this.append(cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY, x, y);
        }

        if (regX || regY) {
            // append the registration offset:
            this.tx -= regX * this.a + regY * this.c;
            this.ty -= regX * this.b + regY * this.d;

            this.modified = true;
        }

        return this;
    }

    public prependTransform(x: number, y: number, scaleX: number, scaleY: number, rotation: number, skewX: number, skewY: number, regX: number, regY: number): this {
        let cos = 1;
        let sin = 0;
        if (rotation % 360) {
            const r = rotation*DEG_TO_RAD;
            cos = Math.cos(r);
            sin = Math.sin(r);
        }

        if (regX || regY) {
            // prepend the registration offset:
            this.tx -= regX;
            this.ty -= regY;
            this.modified = true;
        }

        if (skewX || skewY) {
            // TODO: can this be combined into a single prepend operation?
            skewX *= DEG_TO_RAD;
            skewY *= DEG_TO_RAD;
            this.prepend(cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY, 0, 0);
            this.prepend(Math.cos(skewY), Math.sin(skewY), -Math.sin(skewX), Math.cos(skewX), x, y);
        } else {
            this.prepend(cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY, x, y);
        }

        return this;
    }

    public rotate(angle: number): this {
        angle = angle * DEG_TO_RAD;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const a1 = this.a;
        const b1 = this.b;
        const tx1 = this.tx;

        this.a = a1 * cos + this.c * sin;
        this.b = b1 * cos + this.d * sin;
        this.c = -a1 * sin + this.c * cos;
        this.d = -b1 * sin + this.d * cos;
        this.tx = tx1 * cos - this.ty * sin;
        this.ty = tx1 * sin + this.ty * cos;

        this.modified = true;

        return this;
    }

    public skew(skewX: number, skewY: number): this {
        skewX = skewX * DEG_TO_RAD;
        skewY = skewY * DEG_TO_RAD;
        this.append(Math.cos(skewY), Math.sin(skewY), -Math.sin(skewX), Math.cos(skewX), 0, 0);
        return this;
    }

    public scale(x: number, y: number): this {
        this.a *= x;
        this.b *= x;
        this.c *= y;
        this.d *= y;
        this.tx *= x;
        this.ty *= y;

        this.modified = true;

        return this;
    }

    public translate(x: number, y: number): this {
        this.tx += x;
        this.ty += y;

        this.modified = true;

        return this;
    }

    public identity(): this {
        this.a = this.d = 1;
        this.b = this.c = this.tx = this.ty = 0;

        this.modified = false;

        return this;
    }

    public invert(): this {
        if (this.modified) {
            const a1 = this.a;
            const b1 = this.b;
            const c1 = this.c;
            const d1 = this.d;
            const tx1 = this.tx;
            const n = a1 * d1 - b1 * c1;

            this.a =  d1 / n;
            this.b = -b1 / n;
            this.c = -c1 / n;
            this.d =  a1 / n;
            this.tx =  (c1 * this.ty - d1 * tx1) / n;
            this.ty = -(a1 * this.ty - b1 * tx1) / n;
        }

        return this;
    }

    public isIdentity(): boolean {
        return !this.modified || (this.tx === 0 && this.ty === 0 && this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1);
    }

    public equals(matrix: Matrix2D): boolean {
        return this.tx === matrix.tx && this.ty === matrix.ty && this.a === matrix.a && this.b === matrix.b && this.c === matrix.c && this.d === matrix.d;
    }

    public transformPoint(x:number, y: number, pt: Point = new Point()): Point {
        if (this.modified) {
            pt.x = x * this.a + y * this.c + this.tx;
            pt.y = x * this.b + y * this.d + this.ty;
        }
        return pt;
    }

    public decompose(target: Transform): Transform {
        // TODO: it would be nice to be able to solve for whether the matrix can be decomposed into only scale/rotation even when scale is negative
        target = target || {};
        target.x = this.tx;
        target.y = this.ty;
        target.scaleX = Math.sqrt(this.a * this.a + this.b * this.b);
        target.scaleY = Math.sqrt(this.c * this.c + this.d * this.d);

        const skewX = Math.atan2(-this.c, this.d);
        const skewY = Math.atan2(this.b, this.a);

        const delta = Math.abs(1-skewX/skewY);
        if (delta < 0.00001) { // effectively identical, can use rotation:
            target.rotation = skewY / DEG_TO_RAD;
            if (this.a < 0 && this.d >= 0) {
                target.rotation += (target.rotation <= 0) ? 180 : -180;
            }
            target.skewX = target.skewY = 0;
        } else {
            target.skewX = skewX / DEG_TO_RAD;
            target.skewY = skewY / DEG_TO_RAD;
        }
        return target;
    }

    public copy(matrix: Matrix2D): this {
        return this.setValues(matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty);
    }

    public clone(): Matrix2D {
        return new Matrix2D(this.a, this.b, this.c, this.d, this.tx, this.ty);
    }

    public toString(): string {
        return `[Matrix2D (a=${this.a} b=${this.b} c=${this.c} d=${this.d} tx=${this.tx} ty=${this.ty})]`;
    }

    public static identity(): Matrix2D {
        const mat = new Matrix2D();
        mat.modified = false;
        return mat;
    }
}