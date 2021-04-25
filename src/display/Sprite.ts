import {Event} from "@create2d/core"

import Rectangle from "../geom/Rectangle";

import DisplayObject, {StageGLStyle} from "./DisplayObject";
import SpriteSheet from "./SpriteSheet";

export default class Sprite extends DisplayObject {
    /**
     * The frame index that will be drawn when draw is called. Note that with some {{#crossLink "SpriteSheet"}}{{/crossLink}}
     * definitions, this will advance non-sequentially. This will always be an integer value.
     **/
    public currentFrame: number = 0;

    /**
     * Returns the name of the currently playing animation.
     ***/
    public currentAnimation: string|null = null;

    /**
     * Prevents the animation from advancing each tick automatically. For example, you could create a sprite
     * sheet of icons, set paused to true, and display the appropriate icon by setting <code>currentFrame</code>.
     **/
    public paused: boolean = false;

    /**
     * The SpriteSheet instance to play back. This includes the source image, frame dimensions, and frame
     * data. See {{#crossLink "SpriteSheet"}}{{/crossLink}} for more information.
     **/
    public spriteSheet?: SpriteSheet;

    /**
     * Specifies the current frame index within the currently playing animation. When playing normally, this will increase
     * from 0 to n-1, where n is the number of frames in the current animation.
     *
     * This could be a non-integer value if
     * using time-based playback (see {{#crossLink "Sprite/framerate"}}{{/crossLink}}, or if the animation's speed is
     * not an integer.
     **/
    public currentAnimationFrame: number = 0;

    /**
     * By default Sprite instances advance one frame per tick. Specifying a framerate for the Sprite (or its related
     * SpriteSheet) will cause it to advance based on elapsed time between ticks as appropriate to maintain the target
     * framerate.
     *
     * For example, if a Sprite with a framerate of 10 is placed on a Stage being updated at 40fps, then the Sprite will
     * advance roughly one frame every 4 ticks. This will not be exact, because the time between each tick will
     * vary slightly between frames.
     *
     * This feature is dependent on the tick event object (or an object with an appropriate "delta" property) being
     * passed into {{#crossLink "Stage/update"}}{{/crossLink}}.
     **/
    public framerate: number = 0;


    /**
     * Current animation object.
     **/
    private _animation: any = null;

    /**
     * Current frame index.
     **/
    private _currentFrame: number = 0;

    /**
     * Skips the next auto advance. Used by gotoAndPlay to avoid immediately jumping to the next frame
     **/
    private _skipAdvance: boolean = false;

    constructor(spriteSheet?: SpriteSheet, frameOrAnimation?: string|number) {
        super();

        this.spriteSheet = spriteSheet;
        this._webGLRenderStyle = StageGLStyle.SPRITE;

        if (frameOrAnimation != null) {
            this.gotoAndPlay(frameOrAnimation);
        }
    }

    /**
     * Returns true or false indicating whether the display object would be visible if drawn to a canvas.
     * This does not account for whether it would be visible within the boundaries of the stage.
     * NOTE: This method is mainly for internal use, though it may be useful for advanced uses.
     **/
    public isVisible(): boolean {
        const hasContent = this.cacheCanvas || this.spriteSheet && this.spriteSheet.complete;
        return !!(this.visible && this.alpha > 0 && this.scaleX != 0 && this.scaleY != 0 && hasContent);
    }

    /**
     * Draws the display object into the specified context ignoring its visible, alpha, shadow, and transform.
     * Returns true if the draw was handled (useful for overriding functionality).
     * NOTE: This method is mainly for internal use, though it may be useful for advanced uses.
     **/
    public draw(ctx: CanvasRenderingContext2D, ignoreCache?: boolean) {
        if (super.draw(ctx, ignoreCache)) {
            return true;
        }
        this._normalizeFrame();
        const o = this.spriteSheet ? this.spriteSheet.getFrame(this._currentFrame? this._currentFrame : 0) : null;
        if (!o) {
            return false;
        }
        const rect = o.rect;
        if (rect.width && rect.height) { ctx.drawImage(o.image, rect.x, rect.y, rect.width, rect.height, -o.regX, -o.regY, rect.width, rect.height); }
        return true;
    }

    /**
     * Play (unpause) the current animation. The Sprite will be paused if either {{#crossLink "Sprite/stop"}}{{/crossLink}}
     * or {{#crossLink "Sprite/gotoAndStop"}}{{/crossLink}} is called. Single frame animations will remain
     * unchanged.
     **/
    public play() {
        this.paused = false;
    }

    /**
     * Stop playing a running animation. The Sprite will be playing if {{#crossLink "Sprite/gotoAndPlay"}}{{/crossLink}}
     * is called. Note that calling {{#crossLink "Sprite/gotoAndPlay"}}{{/crossLink}} or {{#crossLink "Sprite/play"}}{{/crossLink}}
     * will resume playback.
     **/
    public stop() {
        this.paused = true;
    }

    /**
     * Sets paused to false and plays the specified animation name, named frame, or frame number.
     **/
    public gotoAndPlay(frameOrAnimation: string|number) {
        this.paused = false;
        this._skipAdvance = true;
        this._goto(frameOrAnimation);
    }

    /**
     * Sets paused to true and seeks to the specified animation name, named frame, or frame number.
     **/
    public gotoAndStop(frameOrAnimation: string|number) {
        this.paused = true;
        this._goto(frameOrAnimation);
    }

    /**
     * Advances the playhead. This occurs automatically each tick by default.
     **/
    public advance(time?: number) {
        const fps = this.framerate || this.spriteSheet && this.spriteSheet.framerate;
        const t = (fps && time) ? time/(1000/fps) : 1;
        this._normalizeFrame(t);
    }

    /**
     * Returns a {{#crossLink "Rectangle"}}{{/crossLink}} instance defining the bounds of the current frame relative to the origin.
     *
     * Also see the SpriteSheet {{#crossLink "SpriteSheet/getFrameBounds"}}{{/crossLink}} method.
     **/
    public getBounds(): Rectangle|undefined {
        // TODO: should this normalizeFrame?
        return super.bounds || this.spriteSheet && this.spriteSheet.getFrameBounds(this.currentFrame, this._rectangle);
    }

        /**
         * Returns a clone of the Sprite instance. Note that the same SpriteSheet is shared between cloned instances.
         **/
        public clone() {
            return this.cloneProps(new Sprite(this.spriteSheet));
        }

        /**
         * Returns a string representation of this object.
         **/
        public toString(): string {
            return `[Sprite (name=${this.name})]`;
        }

        protected cloneProps(o: Sprite) {
            super.cloneProps(o);
            o.currentFrame = this.currentFrame;
            o.currentAnimation = this.currentAnimation;
            o.paused = this.paused;
            o.currentAnimationFrame = this.currentAnimationFrame;
            o.framerate = this.framerate;

            o._animation = this._animation;
            o._currentFrame = this._currentFrame;
            o._skipAdvance = this._skipAdvance;
            return o;
        }

        /**
         * Advances the <code>currentFrame</code> if paused is not true. This is called automatically when the {{#crossLink "Stage"}}{{/crossLink}} ticks.
         **/
        public _tick(evtObj: any) {
            if (!this.paused) {
                if (!this._skipAdvance) { this.advance(evtObj&&evtObj.delta); }
                this._skipAdvance = false;
            }
            super._tick(evtObj);
        }

        /**
         * Normalizes the current frame, advancing animations and dispatching callbacks as appropriate.
         **/
        private _normalizeFrame(frameDelta: number = 0) {
            const animation = this._animation;
            const paused = this.paused;
            let frame = this._currentFrame;
            let l;

            if (animation) {
                const speed = animation.speed || 1;
                let animFrame = this.currentAnimationFrame;
                l = animation.frames.length;
                if (animFrame + frameDelta * speed >= l) {
                    const next = animation.next;
                    if (this._dispatchAnimationEnd(animation, frame, paused, next, l - 1)) {
                        // something changed in the event stack, so we shouldn't make any more changes here.
                        return;
                    } else if (next) {
                        // sequence. Automatically calls _normalizeFrame again with the remaining frames.
                        return this._goto(next, frameDelta - (l - animFrame) / speed);
                    } else {
                        // end.
                        this.paused = true;
                        animFrame = animation.frames.length - 1;
                    }
                } else {
                    animFrame += frameDelta * speed;
                }
                this.currentAnimationFrame = animFrame;
                this._currentFrame = animation.frames[animFrame | 0]
            } else {
                frame = (this._currentFrame += frameDelta);
                l = this.spriteSheet ? this.spriteSheet.getNumFrames() : 0;
                if (frame >= l && l > 0) {
                    if (!this._dispatchAnimationEnd(animation, frame, paused, l - 1)) {
                        // looped.
                        if ((this._currentFrame -= l) >= l) {
                            this._normalizeFrame();
                            return;
                        }
                    }
                }
            }
            frame = this._currentFrame || 0;
            if (this.currentFrame != frame) {
                this.currentFrame = frame;
                this.dispatchEvent("change");
            }
        }

        /**
         * Dispatches the "animationend" event. Returns true if a handler changed the animation.
         **/
        private _dispatchAnimationEnd(animation?: any, frame?: number, paused?: boolean, next?: any, end?: number) {
            const name = animation ? animation.name : null;
            if (this.hasEventListener("animationend")) {
                const evt = new Event("animationend");
                const protoEvt = evt as any;
                protoEvt.name = name;
                protoEvt.next = next;
                this.dispatchEvent(evt);
            }
            // did the animation get changed in the event stack?:
            let changed = (this._animation != animation || this._currentFrame != frame);
            // if the animation hasn't changed, but the sprite was paused, then we want to stick to the last frame:
            if (!changed && !paused && this.paused) {
                this.currentAnimationFrame = end ? end : 0;
                changed = true;
            }
            return changed;
        }

        /**
         * Moves the playhead to the specified frame number or animation.
         **/
        private _goto(frameOrAnimation: string|number, frame: number = 0) {
            this.currentAnimationFrame = 0;
            if (typeof frameOrAnimation === 'string') {
                const data = this.spriteSheet && this.spriteSheet.getAnimation(frameOrAnimation);
                if (data) {
                    this._animation = data;
                    this.currentAnimation = frameOrAnimation;
                    this._normalizeFrame(frame);
                }
            } else {
                this.currentAnimation = this._animation = null;
                this._currentFrame = frameOrAnimation;
                this._normalizeFrame();
            }
        }
}