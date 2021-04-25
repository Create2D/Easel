import Rectangle from "../geom/Rectangle";
import createCanvas from "../utils/Canvas";

import DisplayObject from "./DisplayObject";

type TextHAlign = "start" | "end" | "left" | "right" | "center";
type TextVAlign = "top" | "hanging" | "middle" | "alphabetic" | "ideographic" | "bottom";

export default class Text extends DisplayObject {

    public static _workingContext: CanvasRenderingContext2D;
    // public properties:
    /**
     * The text to display.
     **/
    public text?: string;

    /**
     * The font style to use. Any valid value for the CSS font attribute is acceptable (ex. "bold 36px Arial").
     **/
    public font?: string;

    /**
     * The color to draw the text in. Any valid value for the CSS color attribute is acceptable (ex. "#F00"). Default is "#000".
     * It will also accept valid canvas fillStyle values.
     **/
    public color?: string;

    /**
     * The horizontal text alignment.
     **/
    public textAlign: TextHAlign = "left";

    /**
     * The vertical alignment point on the font.
     **/
    public textBaseline: TextVAlign = "top";

    /**
     * The maximum width to draw the text. If maxWidth is specified (not null), the text will be condensed or
     * shrunk to make it fit in this width.
     **/
    public maxWidth?: number;

    /**
     * If greater than 0, the text will be drawn as a stroke (outline) of the specified width.
     **/
    public outline: number = 0;

    /**
     * Indicates the line height (vertical distance between baselines) for multi-line text. If null or 0,
     * the value of getMeasuredLineHeight is used.
     **/
    public lineHeight: number = 0;

    /**
     * Indicates the maximum width for a line of text before it is wrapped to multiple lines. If null,
     * the text will not be wrapped.
     **/
    public lineWidth?: number;

    constructor(text?: string, font?: string, color?: string) {
        super();

        this.text = text;
        this.font = font;
        this.color = color;
    }

    /**
     * Lookup table for the ratio to offset bounds x calculations based on the textAlign property.
     **/
    private static H_OFFSETS = {start: 0, left: 0, center: -0.5, end: -1, right: -1};

    /**
     * Lookup table for the ratio to offset bounds y calculations based on the textBaseline property.
     **/
    private static V_OFFSETS = {top: 0, hanging: -0.01, middle: -0.4, alphabetic: -0.8, ideographic: -0.85, bottom: -1};


// public methods:
    /**
     * Returns true or false indicating whether the display object would be visible if drawn to a canvas.
     * This does not account for whether it would be visible within the boundaries of the stage.
     * NOTE: This method is mainly for internal use, though it may be useful for advanced uses.
     **/
    public isVisible(): boolean {
        const hasContent = this.cacheCanvas || (this.text != null && this.text !== "");
        return !!(this.visible && this.alpha > 0 && this.scaleX != 0 && this.scaleY != 0 && hasContent);
    }

    /**
     * Draws the Text into the specified context ignoring its visible, alpha, shadow, and transform.
     * Returns true if the draw was handled (useful for overriding functionality).
     * NOTE: This method is mainly for internal use, though it may be useful for advanced uses.
     **/
    public draw(ctx: CanvasRenderingContext2D, ignoreCache?: boolean) {
        if (super.draw(ctx, ignoreCache)) {
            return true;
        }

        const col = this.color || "#000";
        if (this.outline) {
            ctx.strokeStyle = col;
            ctx.lineWidth = this.outline;
        } else {
            ctx.fillStyle = col;
        }

        this._drawText(this._prepContext(ctx));
        return true;
    }

    /**
     * Returns the measured, untransformed width of the text without wrapping. Use getBounds for a more robust value.
     **/
    public getMeasuredWidth(): number {
        return this._getMeasuredWidth(this.text);
    }

    /**
     * Returns an approximate line height of the text, ignoring the lineHeight property. This is based on the measured
     * width of a "M" character multiplied by 1.2, which provides an approximate line height for most fonts.
     **/
    public getMeasuredLineHeight(): number {
        return this._getMeasuredWidth("M")*1.2;
    }

    /**
     * Returns the approximate height of multi-line text by multiplying the number of lines against either the
     * <code>lineHeight</code> (if specified) or {{#crossLink "Text/getMeasuredLineHeight"}}{{/crossLink}}. Note that
     * this operation requires the text flowing logic to run, which has an associated CPU cost.
     **/
    public getMeasuredHeight(): number {
        return this._drawText(null,{}).height;
    }

    public get bounds(): Rectangle|undefined {
        const rect = super.bounds;
        if (rect) {
            return rect;
        }
        if (!this.text || this.text === "") {
            return;
        }
        const o = this._drawText(null, {});
        const w = (this.maxWidth && this.maxWidth < o.width) ? this.maxWidth : o.width;
        const x = w * Text.H_OFFSETS[this.textAlign||"left"];
        const lineHeight = this.lineHeight||this.getMeasuredLineHeight();
        const y = lineHeight * Text.V_OFFSETS[this.textBaseline||"top"];
        return this._rectangle.setValues(x, y, w, o.height);
    }

    /**
     * Returns an object with width, height, and lines properties. The width and height are the visual width and height
     * of the drawn text. The lines property contains an array of strings, one for
     * each line of text that will be drawn, accounting for line breaks and wrapping. These strings have trailing
     * whitespace removed.
     **/
    public getMetrics() {
        const o: any = {lines:[]};
        o.lineHeight = this.lineHeight || this.getMeasuredLineHeight();
        o.vOffset = o.lineHeight * Text.V_OFFSETS[this.textBaseline||"top"];
        return this._drawText(null, o, o.lines);
    }

    /**
     * Returns a clone of the Text instance.
     **/
    public clone() {
        return this.cloneProps(new Text(this.text, this.font, this.color));
    }

    public toString(): string {
        return `[Text (text=${ (this.text && this.text.length > 20 ? this.text.substr(0, 17)+"..." : this.text)})]`;
    }

    protected cloneProps(o: Text) {
        super.cloneProps(o);
        o.textAlign = this.textAlign;
        o.textBaseline = this.textBaseline;
        o.maxWidth = this.maxWidth;
        o.outline = this.outline;
        o.lineHeight = this.lineHeight;
        o.lineWidth = this.lineWidth;
        return o;
    }

    private _prepContext(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
        ctx.font = this.font||"10px sans-serif";
        ctx.textAlign = this.textAlign||"left";
        ctx.textBaseline = this.textBaseline||"top";
        ctx.lineJoin = "miter";
        ctx.miterLimit = 2.5;
        return ctx;
    }

    /**
     * Draws multiline text.
     **/
    public _drawText(ctx: CanvasRenderingContext2D|null, o?: any, lines?: any) {
        const paint = !!ctx;
        if (!paint) {
            ctx = Text._workingContext;
            ctx.save();
            this._prepContext(ctx);
        }
        if (!ctx) {
            return;
        }

        const lineHeight = this.lineHeight||this.getMeasuredLineHeight();
        const hardLines = String(this.text).split(/(?:\r\n|\r|\n)/);

        let maxW = 0, count = 0;
        for (let i=0, l=hardLines.length; i<l; i++) {
            let str = hardLines[i];
            let w: any = null;

            if (this.lineWidth != null && (w = ctx.measureText(str).width) > this.lineWidth) {
                // text wrapping:
                const words = str.split(/(\s)/);
                str = words[0];
                w = ctx.measureText(str).width;

                for (let j=1, jl=words.length; j<jl; j+=2) {
                    // Line needs to wrap:
                    const wordW = ctx.measureText(words[j] + words[j+1]).width;
                    if (w + wordW > this.lineWidth) {
                        if (paint) {
                            this._drawTextLine(ctx, str, count*lineHeight);
                        }
                        if (lines) {
                            lines.push(str);
                        }
                        if (w > maxW) { maxW = w; }
                        str = words[j+1];
                        w = ctx.measureText(str).width;
                        count++;
                    } else {
                        str += words[j] + words[j+1];
                        w += wordW;
                    }
                }
            }

            if (paint) { this._drawTextLine(ctx, str, count*lineHeight); }
            if (lines) { lines.push(str); }
            if (o && w == null) { w = ctx.measureText(str).width; }
            if (w > maxW) {
                maxW = w;
            }
            count++;
        }

        if (o) {
            o.width = maxW;
            o.height = count*lineHeight;
        }
        if (!paint) { ctx.restore(); }
        return o;
    }

    private _drawTextLine(ctx: CanvasRenderingContext2D, text: string, y: number) {
        // Chrome 17 will fail to draw the text if the last param is included but null, so we feed it a large value instead:
        if (this.outline) {
            ctx.strokeText(text, 0, y, this.maxWidth||0xFFFF);
        } else {
            ctx.fillText(text, 0, y, this.maxWidth||0xFFFF);
        }
    }


    private _getMeasuredWidth(text?: string): number {
        if (!text) {
            return 0;
        }
        const ctx = Text._workingContext;
        ctx.save();
        const w = this._prepContext(ctx).measureText(text).width;
        ctx.restore();
        return w;
    }
}

const canvas = createCanvas ? createCanvas() : document.createElement("canvas");
if (canvas.getContext) {
    Text._workingContext = canvas.getContext("2d"); canvas.width = canvas.height = 1;
}
