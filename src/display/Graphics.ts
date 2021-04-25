import Matrix2D from "../geom/Matrix2D";
import Point from "../geom/Point";
import createCanvas from "../utils/Canvas";

type Repeat = "repeat" | "repeat-x" | "repeat-y" | "no-repeat" | "";

declare const enum CanvasLineCapEnum {
    Butt = "butt",
    Round = "round",
    Square = "square"
}
declare const enum CanvasLineJoinEnum {
    Bevel = "bevel",
    Miter = "miter",
    Round = "round"
}

export default class Graphics {
    public static _ctx: CanvasRenderingContext2D;

    public command: G.Command|null = null;

    protected _stroke: G.Stroke|null = null;
    protected _strokeStyle: G.StrokeStyle|null = null;
    protected _oldStrokeStyle: G.StrokeStyle|null = null;
    protected _strokeDash: G.StrokeDash|null = null;
    protected _oldStrokeDash: G.StrokeDash|null = null;
    protected _strokeIgnoreScale?: boolean;
    protected _fill: G.Fill|null = null;
    protected _instructions: G.Command[] = [];
    protected _commitIndex: number = 0;
    protected _activeInstructions: G.Command[] = [];
    protected _dirty?: boolean = false;
    protected _storeIndex: number = 0;

    constructor() {
        this.clear();
    }

    public static getRGB(r: number, g: number, b: number, alpha?: number): string {
        if (r != null && b == null) {
            alpha = g;
            b = r & 0xFF;
            g = r >> 8 & 0xFF;
            r = r >> 16 & 0xFF;
        }
        return `rgb${alpha && `a`}(${r},${g},${b}${alpha && `,${alpha}`})`;
    }

    public static getHSL(hue: number, saturation: number, lightness: number, alpha?: number) {
        if (alpha) {
            return "hsla(" + (hue % 360) + "," + saturation + "%," + lightness + "%," + alpha + ")";
        } else {
            return "hsl(" + (hue % 360) + "," + saturation + "%," + lightness + "%)";
        }
    }

    public static readonly BASE_64: { [k: string]: number } = {
        "A": 0, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5, "G": 6, "H": 7, "I": 8, "J": 9, "K": 10, "L": 11, "M": 12, "N": 13, "O": 14, "P": 15, "Q": 16, "R": 17, "S": 18, "T": 19, "U": 20, "V": 21, "W": 22, "X": 23, "Y": 24, "Z": 25,
        "a": 26, "b": 27, "c": 28, "d": 29, "e": 30, "f": 31, "g": 32, "h": 33, "i": 34, "j": 35, "k": 36, "l": 37, "m": 38, "n": 39, "o": 40, "p": 41, "q": 42, "r": 43, "s": 44, "t": 45, "u": 46, "v": 47, "w": 48, "x": 49, "y": 50, "z": 51,
        "0": 52, "1": 53, "2": 54, "3": 55, "4": 56, "5": 57, "6": 58, "7": 59, "8": 60, "9": 61, "+": 62, "/": 63
    };

    public static readonly STROKE_CAPS_MAP = ["butt", "round", "square"];
    public static readonly STROKE_JOINTS_MAP = ["miter", "round", "bevel"];

    protected _getInstructions(): G.Command[] {
        this._updateInstructions();
        return this._instructions;
    }

    public get instructions(): G.Command[] {
        return this._getInstructions();
    }

    public isEmpty(): boolean {
        return !(this._instructions.length || this._activeInstructions.length);
    }

    public draw(ctx: CanvasRenderingContext2D, data?: any) {
        this._updateInstructions();
        let instr = this._instructions;
        for (let i = this._storeIndex, l = instr.length; i < l; i++) {
            instr[i].exec(ctx, data);
        }
    }

    public drawAsPath(ctx: CanvasRenderingContext2D) {
        this._updateInstructions();
        let instr, instrs = this._instructions;
        for (let i = this._storeIndex, l = instrs.length; i < l; i++) {
            // the first command is always a beginPath command.
            if ((instr = instrs[i]).path) {
                instr.exec(ctx);
            }
        }
    }


// public methods that map directly to context 2D calls:
    public moveTo(x: number, y: number): Graphics {
        return this.append(new G.MoveTo(x, y), true);
    }

    public lineTo(x: number, y: number): Graphics {
        return this.append(new G.LineTo(x, y));
    }

    public arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): Graphics {
        return this.append(new G.ArcTo(x1, y1, x2, y2, radius));
    }

    public arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise: boolean): Graphics {
        return this.append(new G.Arc(x, y, radius, startAngle, endAngle, anticlockwise));
    }

    public quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): Graphics {
        return this.append(new G.QuadraticCurveTo(cpx, cpy, x, y));
    }

    public bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): Graphics {
        return this.append(new G.BezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y));
    }

    public rect(x: number, y: number, w: number, h: number): Graphics {
        return this.append(new G.Rect(x, y, w, h));
    }

    public closePath(): Graphics {
        return this._activeInstructions.length ? this.append(new G.ClosePath()) : this;
    }


// public methods that roughly map to Adobe Flash/Animate graphics APIs:
    public clear(): Graphics {
        this._instructions.length = this._activeInstructions.length = this._commitIndex = 0;
        this._strokeStyle = this._oldStrokeStyle = this._stroke = this._fill = this._strokeDash = this._oldStrokeDash = null;
        this._dirty = this._strokeIgnoreScale = false;
        return this;
    }

    public beginFill(color?: string): Graphics {
        return this._setFill(color ? new G.Fill(color) : null);
    }

    public beginLinearGradientFill(colors: string[], ratios: number[], x0: number, y0: number, x1: number, y1: number): Graphics {
        return this._setFill(new G.Fill().linearGradient(colors, ratios, x0, y0, x1, y1) as G.Fill);
    }

    public beginRadialGradientFill(colors: string[], ratios: number[], x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Graphics {
        return this._setFill(new G.Fill().radialGradient(colors, ratios, x0, y0, r0, x1, y1, r1) as G.Fill);
    }

    public beginBitmapFill(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement, repetition?: Repeat, matrix?: Matrix2D): Graphics {
        return this._setFill(new G.Fill(null, matrix).bitmap(image, repetition) as G.Fill);
    }

    public endFill(): Graphics {
        return this.beginFill();
    }

    public setStrokeStyle(thickness: number, caps: CanvasLineCap|number = 0, joints: CanvasLineJoin|number = 0, miterLimit: number = 0, ignoreScale: boolean = true): Graphics {
        this._updateInstructions(true);
        this._strokeStyle = this.command = new G.StrokeStyle(thickness, caps, joints, miterLimit, ignoreScale);

        // ignoreScale lives on Stroke, not StrokeStyle, so we do a little trickery:
        if (this._stroke) {
            this._stroke.ignoreScale = ignoreScale;
        }
        this._strokeIgnoreScale = ignoreScale;
        return this;
    }

    public setStrokeDash(segments: number[], offset: number = 0): Graphics {
        this._updateInstructions(true);
        this._strokeDash = this.command = new G.StrokeDash(segments, offset);
        return this;
    }

    public beginStroke(color?: string): Graphics {
        return this._setStroke(color ? new G.Stroke(color) : null);
    }

    public beginLinearGradientStroke(colors: string[], ratios: number[], x0: number, y0: number, x1: number, y1: number): Graphics {
        return this._setStroke(new G.Stroke().linearGradient(colors, ratios, x0, y0, x1, y1) as G.Stroke);
    }

    public beginRadialGradientStroke(colors: string[], ratios: number[], x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Graphics {
        return this._setStroke(new G.Stroke().radialGradient(colors, ratios, x0, y0, r0, x1, y1, r1) as G.Stroke);
    }

    public beginBitmapStroke(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement, repetition: Repeat = "repeat"): Graphics {
        // NOTE: matrix is not supported for stroke because transforms on strokes also affect the drawn stroke width.
        return this._setStroke(new G.Stroke().bitmap(image, repetition) as G.Stroke);
    }

    public endStroke(): Graphics {
        return this.beginStroke();
    }

    public curveTo = this.quadraticCurveTo;

    public drawRect = this.rect;

    public drawRoundRect(x: number, y: number, w: number, h: number, radius: number): Graphics {
        return this.drawRoundRectComplex(x, y, w, h, radius, radius, radius, radius);
    }

    public drawRoundRectComplex(x: number, y: number, w: number, h: number, radiusTL: number, radiusTR: number, radiusBR: number, radiusBL: number): Graphics {
        return this.append(new G.RoundRect(x, y, w, h, radiusTL, radiusTR, radiusBR, radiusBL));
    }

    public drawCircle(x: number, y: number, radius: number): Graphics {
        return this.append(new G.Circle(x, y, radius));
    }

    public drawEllipse(x: number, y: number, w: number, h: number): Graphics {
        return this.append(new G.Ellipse(x, y, w, h));
    }

    public drawPolyStar(x: number, y: number, radius: number, sides: number, pointSize: number, angle: number): Graphics {
        return this.append(new G.PolyStar(x, y, radius, sides, pointSize, angle));
    }

    public drawPolygon(points: Point[], close: boolean = true): Graphics {
        return this.append(new G.Polygon(points, close));
    }

    public append(command: G.Command, clean?: boolean): Graphics {
        this._activeInstructions.push(command);
        this.command = command;
        if (!clean) {
            this._dirty = true;
        }
        return this;
    }

    public decodePath(str: string): Graphics {
        const instructions = [this.moveTo, this.lineTo, this.quadraticCurveTo, this.bezierCurveTo, this.closePath];
        const paramCount = [2, 2, 4, 6, 0];
        let i = 0, l = str.length;
        const params: any = [];
        let x = 0, y = 0;
        const base64 = Graphics.BASE_64;

        while (i < l) {
            const c = str.charAt(i);
            const n = base64[c];
            const fi = n >> 3; // highest order bits 1-3 code for operation.
            const f = instructions[fi];
            // check that we have a valid instruction & that the unused bits are empty:
            if (!f || (n & 3)) {
                throw("bad path data (@" + i + "): " + c);
            }
            const pl = paramCount[fi];
            if (!fi) {
                x = y = 0;
            } // move operations reset the position.
            params.length = 0;
            i++;
            const charCount = (n >> 2 & 1) + 2;  // 4th header bit indicates number size for this operation.
            for (let p = 0; p < pl; p++) {
                let num = base64[str.charAt(i)];
                const sign = (num >> 5) ? -1 : 1;
                num = ((num & 31) << 6) | (base64[str.charAt(i + 1)]);
                if (charCount == 3) {
                    num = (num << 6) | (base64[str.charAt(i + 2)]);
                }
                num = sign * num / 10;
                if (p % 2) {
                    x = (num += x);
                } else {
                    y = (num += y);
                }
                params[p] = num;
                i += charCount;
            }
            f.apply(this, params);
        }
        return this;
    }

    public store(): Graphics {
        this._updateInstructions(true);
        this._storeIndex = this._instructions.length;
        return this;
    }

    public unstore(): Graphics {
        this._storeIndex = 0;
        return this;
    }

    public clone(): Graphics {
        const o = new Graphics();
        o.command = this.command;
        o._stroke = this._stroke;
        o._strokeStyle = this._strokeStyle;
        o._strokeDash = this._strokeDash;
        o._strokeIgnoreScale = this._strokeIgnoreScale;
        o._fill = this._fill;
        o._instructions = this._instructions.slice();
        o._commitIndex = this._commitIndex;
        o._activeInstructions = this._activeInstructions.slice();
        o._dirty = this._dirty;
        o._storeIndex = this._storeIndex;
        return o;
    }

    public toString(): string {
        return "[Graphics]";
    }


// tiny API:
    public mt = this.moveTo;
    public lt = this.lineTo;
    public at = this.arcTo;
    public bt = this.bezierCurveTo;
    public qt = this.quadraticCurveTo;
    public a = this.arc;
    public r = this.rect;
    public cp = this.closePath;
    public c = this.clear;
    public f = this.beginFill;
    public lf = this.beginLinearGradientFill;
    public rf = this.beginRadialGradientFill;
    public bf = this.beginBitmapFill;
    public ef = this.endFill;
    public ss = this.setStrokeStyle;
    public sd = this.setStrokeDash;
    public s = this.beginStroke;
    public ls = this.beginLinearGradientStroke;
    public rs = this.beginRadialGradientStroke;
    public bs = this.beginBitmapStroke;
    public es = this.endStroke;
    public dr = this.drawRect;
    public rr = this.drawRoundRect;
    public rc = this.drawRoundRectComplex;
    public dc = this.drawCircle;
    public de = this.drawEllipse;
    public dp = this.drawPolyStar;
    public pg = this.drawPolygon;
    public p = this.decodePath;


// private methods:
    protected _updateInstructions(commit?: boolean) {
        const instr = this._instructions, active = this._activeInstructions, commitIndex = this._commitIndex;

        if (this._dirty && active.length) {
            instr.length = commitIndex; // remove old, uncommitted commands
            instr.push(beginCmd);

            const l = active.length, ll = instr.length;
            instr.length = ll + l;
            for (let i = 0; i < l; i++) {
                instr[i + ll] = active[i];
            }

            if (this._fill) {
                instr.push(this._fill);
            }
            if (this._stroke) {
                // doesn't need to be re-applied if it hasn't changed.
                if (this._strokeDash && this._strokeDash !== this._oldStrokeDash) {
                    instr.push(this._strokeDash);
                }
                if (this._strokeStyle && this._strokeStyle !== this._oldStrokeStyle) {
                    instr.push(this._strokeStyle);
                }
                if (commit) {
                    this._oldStrokeStyle = this._strokeStyle;
                    this._oldStrokeDash = this._strokeDash;
                }
                instr.push(this._stroke);
            }

            this._dirty = false;
        }

        if (commit) {
            active.length = 0;
            this._commitIndex = instr.length;
        }
    }

    protected _setFill(fill: G.Fill|null) {
        this._updateInstructions(true);
        this.command = this._fill = fill;
        return this;
    }

    protected _setStroke(stroke: G.Stroke|null) {
        this._updateInstructions(true);
        this.command = this._stroke = stroke;
        if (stroke) {
            stroke.ignoreScale = this._strokeIgnoreScale;
        }
        return this;
    }
}

const canvas = createCanvas ? createCanvas() : document.createElement("canvas");
if (canvas.getContext) {
    Graphics._ctx = canvas.getContext("2d");
    canvas.width = canvas.height = 1;
}

export namespace G {
    export interface Command {
        exec(ctx: CanvasRenderingContext2D, data?: any): void;
        path ?: boolean;
    }

    export class LineTo implements Command {
        constructor(private x: number, private y: number) {};
        path = true;
        public exec(ctx: CanvasRenderingContext2D) {
            ctx.lineTo(this.x,this.y);
        }
    }

    export class MoveTo implements Command {
        constructor(private x: number, private y: number) {};
        path = true;
        public exec(ctx: CanvasRenderingContext2D) {
            ctx.moveTo(this.x,this.y);
        }
    }

    export class ArcTo implements Command {
        constructor(private x1: number, private y1: number, private x2: number, private y2: number, private radius: number) {}
        path = true;
        public exec(ctx: CanvasRenderingContext2D) {ctx.arcTo(this.x1, this.y1, this.x2, this.y2, this.radius); }
    }

    export class Arc implements Command {
        constructor(private x: number, private y: number, private radius: number, private startAngle: number, private endAngle: number, private anticlockwise: boolean) {}
        path = true;
        public exec(ctx: CanvasRenderingContext2D) { ctx.arc(this.x, this.y, this.radius, this.startAngle, this.endAngle, this.anticlockwise); };
    }

    export class QuadraticCurveTo implements Command {
        constructor(private cpx: number, private cpy: number, private x: number, private y: number) {}
        path = true;
        public exec(ctx: CanvasRenderingContext2D) { ctx.quadraticCurveTo(this.cpx, this.cpy, this.x, this.y); };
    }

    export class BezierCurveTo implements Command {
        constructor(private cp1x: number, private cp1y: number, private cp2x: number, private cp2y: number, private x: number, private y: number) {}
        path = true;
        public exec(ctx: CanvasRenderingContext2D) { ctx.bezierCurveTo(this.cp1x, this.cp1y, this.cp2x, this.cp2y, this.x, this.y); };
    }

    export class Rect implements Command {
        constructor(private x: number, private y: number, private w: number, private h: number) {}
        path = true;
        public exec(ctx: CanvasRenderingContext2D) { ctx.rect(this.x, this.y, this.w, this.h); };
    }

    export class ClosePath implements Command {
        path = true;
        public exec(ctx: CanvasRenderingContext2D) { ctx.closePath(); }
    }

    export class BeginPath implements Command {
        path = true;
        public exec(ctx: CanvasRenderingContext2D) { ctx.beginPath(); }
    }

    export class Fill implements Command {
        constructor(private style: string | CanvasGradient | CanvasPattern | null = null, private matrix?: Matrix2D) {}
        path = false;
        public exec(ctx: CanvasRenderingContext2D) {
            if (!this.style) {
                return;
            }
            ctx.fillStyle = this.style;
            const mtx = this.matrix;
            if (mtx) {
                ctx.save();
                ctx.transform(mtx.a, mtx.b, mtx.c, mtx.d, mtx.tx, mtx.ty);
            }
            ctx.fill();
            if (mtx) {
                ctx.restore();
            }
        }

        public linearGradient(colors: string[], ratios: number[], x0: number, y0: number, x1: number, y1: number): Command {
            const o: any = this.style = Graphics._ctx.createLinearGradient(x0, y0, x1, y1);
            for (let i = 0, l = colors.length; i < l; i++) {
                o.addColorStop(ratios[i], colors[i]);
            }
            o.props = {colors: colors, ratios: ratios, x0: x0, y0: y0, x1: x1, y1: y1, type: "linear"};
            return this;
        }

        public radialGradient(colors: string[], ratios: number[], x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Command {
            const o: any = this.style = Graphics._ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
            for (let i = 0, l = colors.length; i < l; i++) {
                o.addColorStop(ratios[i], colors[i]);
            }
            o.props = {colors: colors, ratios: ratios, x0: x0, y0: y0, r0: r0, x1: x1, y1: y1, r1: r1, type: "radial"};
            return this;
        }

        public bitmap(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement, repetition?: Repeat, matrix?: Matrix2D): Command {
            if (matrix) this.matrix = matrix;
            const protoImage = image as any;
            if (protoImage.naturalWidth || protoImage.getContext || protoImage.readyState >= 2) {
                const o: any = this.style = Graphics._ctx.createPattern(image, repetition || "");
                o.props = {image: image, repetition: repetition, type: "bitmap"};
            }
            return this;
        }
    }

    export class Stroke implements Command {
        constructor(private style?: any, public ignoreScale?: boolean) {}
        path = false;
        public exec(ctx: CanvasRenderingContext2D) {
            if (!this.style) {
                return;
            }
            ctx.strokeStyle = this.style;
            if (this.ignoreScale) {
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
            }
            ctx.stroke();
            if (this.ignoreScale) {
                ctx.restore();
            }
        }

        public linearGradient = G.Fill.prototype.linearGradient;
        public radialGradient = G.Fill.prototype.radialGradient;
        public bitmap = G.Fill.prototype.bitmap;
    }

    export class StrokeStyle implements Command {
        constructor (private width: number, private caps: CanvasLineCap|number = 0, private joints: CanvasLineJoin|number = 0, private miterLimit: number = 10, private ignoreScale: boolean = false) {}
        path = false;

        public exec(ctx: CanvasRenderingContext2D & {ignoreScale: boolean}) {
            ctx.lineWidth = this.width;
            ctx.lineCap  = (typeof this.caps   == "number") ? [CanvasLineCapEnum.Butt,   CanvasLineCapEnum.Round,  CanvasLineCapEnum.Square][this.caps]   : this.caps;
            ctx.lineJoin = (typeof this.joints == "number") ? [CanvasLineJoinEnum.Bevel, CanvasLineJoinEnum.Miter, CanvasLineJoinEnum.Round][this.joints] : this.joints;
            ctx.miterLimit = this.miterLimit;
            ctx.ignoreScale = this.ignoreScale;
        }
    }

    export class StrokeDash implements Command {
        constructor(private segments: number[], private offset: number = 0) {}
        path = true;
        public exec(ctx: CanvasRenderingContext2D) {
            if (ctx.setLineDash) { // feature detection.
                ctx.setLineDash(this.segments || G.StrokeDash.EMPTY_SEGMENTS); // instead of [] to reduce churn.
                ctx.lineDashOffset = this.offset || 0;
            }
        }
        public static EMPTY_SEGMENTS = [];
    }

    export class RoundRect implements Command {
        constructor(private x: number, private y: number, private w: number, private h: number, private radiusTL: number, private radiusTR: number, private radiusBR: number, private radiusBL: number) {}
        path = true;

        public exec(ctx: CanvasRenderingContext2D) {
            const max = (this.w<this.h?this.w:this.h)/2;
            let mTL=0, mTR=0, mBR=0, mBL=0;
            const x = this.x, y = this.y, w = this.w, h = this.h;
            let rTL = this.radiusTL, rTR = this.radiusTR, rBR = this.radiusBR, rBL = this.radiusBL;

            if (rTL < 0) { rTL *= (mTL=-1); }
            if (rTL > max) { rTL = max; }
            if (rTR < 0) { rTR *= (mTR=-1); }
            if (rTR > max) { rTR = max; }
            if (rBR < 0) { rBR *= (mBR=-1); }
            if (rBR > max) { rBR = max; }
            if (rBL < 0) { rBL *= (mBL=-1); }
            if (rBL > max) { rBL = max; }

            ctx.moveTo(x+w-rTR, y);
            ctx.arcTo(x+w+rTR*mTR, y-rTR*mTR, x+w, y+rTR, rTR);
            ctx.lineTo(x+w, y+h-rBR);
            ctx.arcTo(x+w+rBR*mBR, y+h+rBR*mBR, x+w-rBR, y+h, rBR);
            ctx.lineTo(x+rBL, y+h);
            ctx.arcTo(x-rBL*mBL, y+h+rBL*mBL, x, y+h-rBL, rBL);
            ctx.lineTo(x, y+rTL);
            ctx.arcTo(x-rTL*mTL, y-rTL*mTL, x+rTL, y, rTL);
            ctx.closePath();
        }
    }

    export class Circle implements Command {
        constructor(private x: number, private y: number, private radius: number) {}
        path = true;
        public exec(ctx: CanvasRenderingContext2D) {
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        }
    }

    export class Ellipse implements Command {
        constructor(private x: number, private y: number, private w: number, private h: number) {}
        path = true;
        public exec(ctx: CanvasRenderingContext2D) {
            const x = this.x, y = this.y;
            const w = this.w, h = this.h;

            const k = 0.5522848;
            const ox = (w / 2) * k;
            const oy = (h / 2) * k;
            const xe = x + w;
            const ye = y + h;
            const xm = x + w / 2;
            const ym = y + h / 2;

            ctx.moveTo(x, ym);
            ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
            ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
            ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
            ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);
        }
    }

    export class PolyStar implements Command {
        constructor(private x: number, private y: number, private radius: number, private sides: number, private pointSize: number, private angle: number) {}
        path = true;

        public exec(ctx: CanvasRenderingContext2D) {
            const x = this.x, y = this.y;
            const radius = this.radius;
            let angle = (this.angle || 0) / 180 * Math.PI;
            const sides = this.sides;
            const ps = 1 - (this.pointSize || 0);
            const a = Math.PI / sides;

            ctx.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
            // Adjusted by DAN ZEN 3/27/21 to continue around to next point
            // so last connection gets consistent bevel or miter
            for (let i = 0; i < sides + 1; i++) {
                angle += a;
                if (ps != 1) {
                    ctx.lineTo(x + Math.cos(angle) * radius * ps, y + Math.sin(angle) * radius * ps);
                    if (i == sides) break; // DAN ZEN 3/27/21
                }
                angle += a;
                ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
            }
            ctx.closePath();
        }
    }

    export class Polygon implements Command {
        constructor(private points: Point[], private close: boolean = true) {}
        path = true;
        public exec(ctx: CanvasRenderingContext2D) {
            const points = this.points, close = this.close;

            let p: Point, fp: Point;
            fp = points[0];
            ctx.moveTo(fp.x, fp.y);
            for (let i = 1; i < points.length; i++) {
                p = points[i];
                ctx.lineTo(p.x, p.y);
            }

            if (close) {
                ctx.lineTo(fp.x, fp.y);
                if (points[1]) {
                    // go around to second point to get correct end bevel/miter
                    ctx.lineTo(points[1].x, points[1].y);
                }
                ctx.closePath();
            }

        }
    }
}

const beginCmd = new G.BeginPath(); // so we don't have to instantiate multiple instances.