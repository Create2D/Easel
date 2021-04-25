import Rectangle from "../geom/Rectangle";

import Container from "./Container";
import DisplayObject from "./DisplayObject";
import SpriteSheet from "./SpriteSheet";
import Sprite from "./Sprite";
import Stage from "./Stage";

export default class BitmapText extends Container {
    /**
     * The text to display.
     **/
    private text: string = "";

    /**
     * A SpriteSheet instance that defines the glyphs for this bitmap text. Each glyph/character
     * should have a single frame animation defined in the sprite sheet named the same as
     * corresponding character. For example, the following animation definition:
     *
     * 		"A": {frames: [0]}
     *
     * would indicate that the frame at index 0 of the spritesheet should be drawn for the "A" character. The short form
     * is also acceptable:
     *
     * 		"A": 0
     *
     * Note that if a character in the text is not found in the sprite sheet, it will also
     * try to use the alternate case (upper or lower).
     **/
    private spriteSheet?: SpriteSheet;

    /**
     * The height of each line of text. If 0, then it will use a line height calculated
     * by checking for the height of the "1", "T", or "L" character (in that order). If
     * those characters are not defined, it will use the height of the first frame of the
     * sprite sheet.
     **/
    public lineHeight: number = 0;

    /**
     * This spacing (in pixels) will be added after each character in the output.
     **/
    public letterSpacing: number = 0;

    /**
     * If a space character is not defined in the sprite sheet, then empty pixels equal to
     * spaceWidth will be inserted instead. If 0, then it will use a value calculated
     * by checking for the width of the "1", "l", "E", or "A" character (in that order). If
     * those characters are not defined, it will use the width of the first frame of the
     * sprite sheet.
     **/
    public spaceWidth: number = 0;

    private _oldProps: {text:number,spriteSheet:number,lineHeight:number,letterSpacing:number,spaceWidth:number} = {text:0,spriteSheet:0,lineHeight:0,letterSpacing:0,spaceWidth:0};

    /**
     * Used to track the object which this class attached listeners to, helps optimize listener attachment.
     **/
    private _oldStage: Stage|null = null;

    /**
     * The event listener proxy triggered drawing draw for special circumstances.
     **/
    private _drawAction: Function|null = null;

    /**
     * Displays text using bitmap glyphs defined in a sprite sheet. Multi-line text is supported using new line characters,
     * but automatic wrapping is not supported. See the {@link BitmapText/spriteSheet}
     * property for more information on defining glyphs.
     *
     * <strong>Important:</strong> While BitmapText extends Container, it is not designed to be used as one.
     * As such, methods like addChild and removeChild are disabled.
     **/
    constructor(text: string = "", spriteSheet?: SpriteSheet) {
        super();

        this.text = text;
        this.spriteSheet = spriteSheet;


    }

// static properties:
    /**
     * BitmapText uses Sprite instances to draw text. To reduce the creation and destruction of instances (and thus garbage collection), it maintains
     * an internal object pool of sprite instances to reuse. Increasing this value can cause more sprites to be
     * retained, slightly increasing memory use, but reducing instantiation.
     **/
    public static maxPoolSize: number = 100;

    /**
     * Sprite object pool.
     **/
    private static _spritePool: DisplayObject[] = [];

    public draw(ctx: CanvasRenderingContext2D, ignoreCache?: boolean): boolean {
        const success = super.draw(ctx, ignoreCache);
        if (success) {
            return success;
        }
        this._updateState();
        return super.draw(ctx, ignoreCache);
    }

    public get bounds(): Rectangle|undefined {
        this._updateText();
        return super.bounds;
    }

    /**
     * Returns true or false indicating whether the display object would be visible if drawn to a canvas.
     * This does not account for whether it would be visible within the boundaries of the stage.
     * NOTE: This method is mainly for internal use, though it may be useful for advanced uses.
     **/
    public isVisible(): boolean {
        const hasContent = this.cacheCanvas || (this.spriteSheet && this.spriteSheet.complete && this.text);
        return !!(this.visible && this.alpha > 0 && this.scaleX !== 0 && this.scaleY !== 0 && hasContent);
    }

    public clone(recursive?: boolean) {
        return this.cloneProps(new BitmapText(this.text, this.spriteSheet));
    }

    public addChild(child: DisplayObject): DisplayObject { return child; }
    public addChildAt(child: DisplayObject, index: number): DisplayObject { return child; }
    public removeChild(child: DisplayObject): boolean { return false; }
    public removeChildAt(index: number): boolean { return false; }
    public removeAllChildren() {}

    _updateState = () => {
        this._updateText();
    }

    protected cloneProps(o: BitmapText) {
        super.cloneProps(o);
        o.lineHeight = this.lineHeight;
        o.letterSpacing = this.letterSpacing;
        o.spaceWidth = this.spaceWidth;
        return o;
    }

    private _getFrameIndex(character: string, spriteSheet: SpriteSheet): number {
        let c, o = spriteSheet.getAnimation(character);
        if (!o) {
            (character != (c = character.toUpperCase())) || (character != (c = character.toLowerCase())) || (c=null);
            if (c) { o = spriteSheet.getAnimation(c); }
        }
        return o && o.frames[0];
    }

    private _getFrame(character: string, spriteSheet: SpriteSheet) {
        const index = this._getFrameIndex(character, spriteSheet);
        return index == null ? index : spriteSheet.getFrame(index);
    }

    private _getLineHeight(ss: SpriteSheet): number {
        const frame = this._getFrame("1",ss) || this._getFrame("T",ss) || this._getFrame("L",ss) || ss.getFrame(0);
        return frame ? frame.rect.height : 1;
    }

    private _getSpaceWidth(ss: SpriteSheet): number {
        const frame = this._getFrame("1",ss) || this._getFrame("l",ss) || this._getFrame("e",ss) || this._getFrame("a",ss) || ss.getFrame(0);
        return frame ? frame.rect.width : 1;
    }

    private _updateText() {
        let x=0, y=0, o=this._oldProps, change=false, spaceW=this.spaceWidth, lineH=this.lineHeight, ss=this.spriteSheet;
        const pool = BitmapText._spritePool, kids = this.children;
        let childIndex=0, numKids=kids.length;
        let sprite: Sprite;

        const proto_o = o as any;
        const proto_this = this as any;

        for (const n in o) {
            if (proto_o[n] != proto_this[n]) {
                proto_o[n] = proto_this[n];
                change = true;
            }
        }
        if (!change) {
            return;
        }

        const hasSpace = ss && !!this._getFrame(" ", ss);
        if (ss && !hasSpace && !spaceW) {
            spaceW = this._getSpaceWidth(ss);
        }
        if (ss && !lineH) {
            lineH = this._getLineHeight(ss);
        }

        for(let i=0, l=this.text.length; i<l; i++) {
            const character = this.text.charAt(i);
            if (character == " " && !hasSpace) {
                x += spaceW;
                continue;
            } else if (character=="\n" || character=="\r") {
                if (character=="\r" && this.text.charAt(i+1) == "\n") { i++; } // crlf
                x = 0;
                y += lineH;
                continue;
            }

            const index = ss && this._getFrameIndex(character, ss);
            if (index == null) { continue; }

            if (childIndex < numKids) {
                sprite = kids[childIndex] as Sprite;
            } else {
                sprite = (pool.length && pool.pop() as Sprite) || new Sprite();
                kids.push(sprite);
                sprite.parent = this;
                numKids++;
            }
            sprite.spriteSheet = ss;
            sprite.gotoAndStop(index);
            sprite.x = x;
            sprite.y = y;
            childIndex++;

            const bounds = sprite.getBounds();
            x += (bounds ? bounds.width : 0) + this.letterSpacing;
        }

        while (numKids > childIndex) {
            // faster than removeChild.
            const sprite = kids.pop();
            if (sprite) {
                pool.push(sprite);
                sprite.parent = undefined;
            }
            numKids--;
        }
        if (pool.length > BitmapText.maxPoolSize) {
            pool.length = BitmapText.maxPoolSize;
        }
    }
}