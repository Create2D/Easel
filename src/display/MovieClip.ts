import {Timeline, Tween} from "@create2d/tween";

import Rectangle from "../geom/Rectangle";
import Matrix2D from "../geom/Matrix2D";

import Container from "./Container";
import DisplayObject from "./DisplayObject";

export default class MovieClip extends Container {
    /**
     * The MovieClip will advance independently of its parent, even if its parent is paused.
     * This is the default mode.
     **/
    public static readonly INDEPENDENT: string = "independent";
    /**
     * The MovieClip will only display a single frame (as determined by the startPosition property).
     **/
    public static readonly SINGLE_FRAME: string = "single";
    /**
     * The MovieClip will be advanced only when its parent advances and will be synched to the position of
     * the parent MovieClip.
     **/
    public static readonly SYNCHED: string = "synched";
    /**
     * Has the MovieClipPlugin been installed to TweenJS yet?
     **/
    public static inited: boolean = false;

    mode: RequestMode | IDBTransactionMode | ShadowRootMode | "navigate" | "same-origin" | "no-cors" | "cors" | SVGAnimatedEnumeration | TextTrackMode | number | AppendMode;
    startPosition: number;
    loop: number;
    currentFrame: number;
    timeline: Timeline;
    paused: any;
    actionsEnabled: boolean;
    autoReset: boolean;
    frameBounds: any;

    /**
     * By default MovieClip instances advance one frame per tick. Specifying a framerate for the MovieClip
     * will cause it to advance based on elapsed time between ticks as appropriate to maintain the target
     * framerate.
     *
     * For example, if a MovieClip with a framerate of 10 is placed on a Stage being updated at 40fps, then the MovieClip will
     * advance roughly one frame every 4 ticks. This will not be exact, because the time between each tick will
     * vary slightly between frames.
     *
     * This feature is dependent on the tick event object (or an object with an appropriate "delta" property) being
     * passed into {@link Stage#update}.
     **/
    framerate?: number;
    private _synchOffset: number;
    private _rawPosition: number;
    private _t: number;
    /**
     * List of display objects that are actively being managed by the MovieClip.
     **/
    private _managed: any[] = [];
    private _bound_resolveState: OmitThisParameter<() => void>;

    constructor (props: any) {
        super();
        !MovieClip.inited && MovieClip.init();

        /**
         * Controls how this MovieClip advances its time. Must be one of 0 (INDEPENDENT), 1 (SINGLE_FRAME), or 2 (SYNCHED).
         * See each constant for a description of the behaviour.
         * @type {Number}
         * @default 0
         */
        this.mode = props.mode != null ? props.mode : MovieClip.INDEPENDENT;

        /**
         * Specifies what the first frame to play in this movieclip, or the only frame to display if mode is SINGLE_FRAME.
         * @type {Number}
         * @default 0
         */
        this.startPosition = props.startPosition != null ? props.startPosition : 0;

        /**
         * Specifies how many times this MovieClip should loop. A value of -1 indicates it should loop indefinitely. A value of
         * 1 would cause it to loop once (ie. play a total of twice).
         * @property loop
         * @type {Number}
         * @default -1
         */
        if (typeof props.loop === "number") {
            this.loop = props.loop;
        } else if (props.loop === false) {
            this.loop = 0;
        } else {
            this.loop = -1;
        }

        /**
         * The current frame of the movieclip.
         * @type Number
         * @default 0
         * @readonly
         */
        this.currentFrame = 0;

        /**
         * The TweenJS Timeline that is associated with this MovieClip. This is created automatically when the MovieClip
         * instance is initialized. Animations are created by adding <a href="http://tweenjs.com">TweenJS</a> Tween
         * instances to the timeline.
         *
         * Elements can be added and removed from the timeline by toggling an "_off" property
         * using the `tweenInstance.to()` method. Note that using `Tween.set` is not recommended to
         * create MovieClip animations. The following example will toggle the target off on frame 0, and then back on for
         * frame 1. You can use the "visible" property to achieve the same effect.
         *
         * @example
         * let tween = Tween.get(target).to({x:0}).to({x:100}, 30);
         * let mc = new MovieClip();
         * mc.timeline.addTween(tween);
         *
         * @example
         * Tween.get(target).to({_off:false})
         *   .wait(1).to({_off:true})
         *   .wait(1).to({_off:false});
         *
         * @type {Timeline}
         */
        this.timeline = new Timeline({ useTicks: true, paused: true });

        /**
         * If true, the MovieClip's position will not advance when ticked.
         * @type {Boolean}
         * @default false
         */
        this.paused = props.paused != null ? props.paused : false;

        /**
         * If true, actions in this MovieClip's tweens will be run when the playhead advances.
         * @type {Boolean}
         * @default true
         */
        this.actionsEnabled = true;

        /**
         * If true, the MovieClip will automatically be reset to its first frame whenever the timeline adds
         * it back onto the display list. This only applies to MovieClip instances with mode=INDEPENDENT.
         * <br><br>
         * For example, if you had a character animation with a "body" child MovieClip instance
         * with different costumes on each frame, you could set `body.autoReset = false`, so that
         * you can manually change the frame it is on, without worrying that it will be reset
         * automatically.
         * @type {Boolean}
         * @default true
         */
        this.autoReset = true;

        /**
         * An array of bounds for each frame in the MovieClip. This is mainly intended for tool output.
         * @type {Array}
         */
        this.frameBounds = this.frameBounds || props.frameBounds; // frameBounds are set on the prototype in Animate.


        /**
         * @type {Number}
         * @default 0
         * @private
         */
        this._synchOffset = 0;

        /**
         * @type {Number}
         * @default -1
         * @private
         */
        this._rawPosition = -1; // TODO: evaluate using a ._reset Boolean prop instead of -1.

        /**
         * The time remaining from the previous tick, only applicable when .framerate is set.
         * @type {Number}
         * @private
         */
        this._t = 0;

        /**
         * @type {Function}
         * @private
         */
        this._bound_resolveState = this._resolveState.bind(this);
    }

    static init () {
        if (MovieClip.inited) { return; }
        // plugins introduce some overhead to Tween, so we only install this if an MC is instantiated.
        MovieClipPlugin.install();
        MovieClip.inited = true;
    }

    /**
     * Returns an array of objects with label and position (aka frame) properties, sorted by position.
     **/
    public get labels(): any[] {
        return this.timeline.labels;
    }

    /**
     * Returns the name of the label on or immediately before the current frame.
     **/
    public get currentLabel(): string|null {
        return this.timeline.currentLabel;
    }

    /**
     * Returns the duration of this MovieClip in seconds or ticks.
     **/
    public get duration(): number {
        return this.timeline.duration;
    }

    /**
     * Returns the duration of this MovieClip in seconds or ticks. Identical to {@link easeljs.MovieClip#duration}
     * and provided for Adobe Flash/Animate API compatibility.
     **/
    public get totalFrames(): number {
        return this.duration;
    }

    public isVisible () {
        // children are placed in draw, so we can't determine if we have content.
        return !!(this.visible && this.alpha > 0 && this.scaleX != 0 && this.scaleY != 0);
    }

    public draw (ctx: CanvasRenderingContext2D, ignoreCache?: boolean) {
        // draw to cache first:
        if (this.drawCache(ctx, ignoreCache)) {
            return true;
        }
        this._updateState();
        super.draw(ctx, ignoreCache);
        return true;
    }

    /**
     * Sets paused to false.
     **/
    public play () {
        this.paused = false;
    }

    /**
     * Sets paused to true.
     **/
    public stop () {
        this.paused = true;
    }

    /**
     * Advances this movie clip to the specified position or label and plays the timeline.
     **/
    public gotoAndPlay (positionOrLabel: string|number) {
        this.play();
        this._goto(positionOrLabel);
    }

    /**
     * Advances this movie clip to the specified position or label and stops the timeline.
     **/
    public gotoAndStop (positionOrLabel: string|number) {
        this.stop();
        this._goto(positionOrLabel);
    }

    /**
     * Advances the playhead. This occurs automatically each tick by default.
     **/
    public advance (time?: number) {
        if (this.mode !== MovieClip.INDEPENDENT) { return; } // update happens in draw for synched clips
        // if this MC doesn't have a framerate, hunt ancestors for one:
        let o: {[k: string]: any} = this;
        let fps = o.framerate;
        while ((o = o.parent) && fps === undefined) {
            if (o.mode === MovieClip.INDEPENDENT) {
                fps = o._framerate;
            }
        }
        this.framerate = fps;
        // calculate how many frames to advance:
        let t = (fps !== undefined && fps !== -1 && time !== undefined) ? time / (1000 / fps) + this._t : 1;
        let frames = t | 0;
        this._t = t - frames; // leftover time, save to add to next advance.

        while (!this.paused && frames--) {
            this._updateTimeline(this._rawPosition + 1, false);
        }
    }

    /**
     * MovieClip instances cannot be cloned.
     **/
    public clone (): never {
        // TODO: add support for this? Need to clone the Timeline & retarget tweens - pretty complex.
        throw "MovieClip cannot be cloned.";
    }

    public _updateState () {
        if (this._rawPosition === -1 || this.mode !== MovieClip.INDEPENDENT) {
            this._updateTimeline(-1);
        }
    }

    public _tick (evtObj: any) {
        this.advance(evtObj && evtObj.delta);
        super._tick(evtObj);
    }

    protected _goto (positionOrLabel: string|number) {
        let pos = this.timeline.resolve(positionOrLabel);
        if (pos == null) { return; }
        this._t = 0;
        this._updateTimeline(pos, true);
    }

    protected _reset () {
        this._rawPosition = -1;
        this._t = this.currentFrame = 0;
        this.paused = false;
    }

    protected _updateTimeline (rawPosition: number, jump: boolean = false) {
        let synced = this.mode !== MovieClip.INDEPENDENT, tl = this.timeline;
        if (synced) { rawPosition = this.startPosition + (this.mode === MovieClip.SINGLE_FRAME ? 0 : this._synchOffset); }
        if (rawPosition < 1) { rawPosition = 0; }
        if (this._rawPosition === rawPosition && !synced) { return; }
        this._rawPosition = rawPosition;

        // update timeline position, ignoring actions if this is a graphic.
        tl.loop = this.loop; // TODO: should we maintain this on MovieClip, or just have it on timeline?
        tl.setPosition(rawPosition, synced || !this.actionsEnabled, jump, this._bound_resolveState);
    }

    /**
     * Renders position 0 without running actions or updating _rawPosition.
     * Primarily used by Animate CC to build out the first frame in the constructor of MC symbols.
     **/
    protected _renderFirstFrame () {
        const tl = this.timeline, pos = tl.rawPosition;
        tl.setPosition(0, true, true, this._bound_resolveState);
        tl.rawPosition = pos;
    }

    /**
     * Runs via a callback after timeline property updates and before actions.
     **/
    protected _resolveState () {
        let tl = this.timeline;
        this.currentFrame = tl.position;

        for (let n in this._managed) {
            (this._managed as {[k: string]: any})[n] = 1;
        }

        let tweens = tl.tweens;
        for (let tween of tweens) {
            let target = tween.target;
            if (target === this || tween.passive) { continue; } // TODO: this assumes the actions tween from Animate has `this` as the target. Likely a better approach.
            let offset = tween._stepPosition;

            if (target instanceof DisplayObject) {
                // motion tween.
                this._addManagedChild(target, offset);
            } else {
                // state tween.
                this._setState(target.state, offset);
            }
        }

        let kids = this.children;
        for (let i=kids.length-1; i>=0; i--) {
            let id = kids[i].id;
            if (this._managed[id] === 1) {
                this.removeChildAt(i);
                delete(this._managed[id]);
            }
        }
    }

    protected _setState (state: any[], offset: number) {
        if (!state) { return; }
        for (let i = state.length - 1; i >= 0; i--) {
            let o = state[i];
            let target = o.t;
            let props = o.p;
            for (let n in props) {
                target[n] = props[n];
            }
            this._addManagedChild(target, offset);
        }
    }

    /**
     * Adds a child to the timeline, and sets it up as a managed child.
     **/
    private _addManagedChild (child: DisplayObject, offset: number) {
        if ((child as any)._off) { return; }
        this.addChildAt(child, 0);

        if (child instanceof MovieClip) {
            child._synchOffset = offset;
            // TODO: this does not precisely match Adobe Flash/Animate, which loses track of the clip if it is renamed or removed from the timeline, which causes it to reset.
            // TODO: should also reset when MovieClip loops, though that will be a bit tricky to detect.
            if (child.mode === MovieClip.INDEPENDENT && child.autoReset && !this._managed[child.id]) {
                child._reset();
            }
        }
        this._managed[child.id] = 2;
    }

    _getBounds (matrix: Matrix2D, ignoreTransform?: boolean): Rectangle|undefined {
        let bounds = this.bounds;
        if (!bounds && this.frameBounds) {
            bounds = this._rectangle.copy(this.frameBounds[this.currentFrame]);
        }
        if (bounds) {
            return this.transformBounds(bounds, matrix, ignoreTransform);
        }
        return super.getTransformedBounds(matrix, ignoreTransform);
    }

}



/**
 * This plugin works with Tween to prevent the startPosition property from tweening.
 * @todo update to new plugin model
 * @static
 * @inner
 */
class MovieClipPlugin {

    constructor () {
        throw "MovieClipPlugin cannot be instantiated.";
    }

    /**
     * @private
     */
    static install () {
        Tween.installPlugin(MovieClipPlugin);
    }

    /**
     * @param {Tween} tween
     * @param {String} prop
     * @param {String|Number|Boolean} value
     * @private
     */
    static init (tween: Tween, prop: string, value: string|number|boolean) {
        return value;
    }

    /**
     * @param {Tween} tween
     * @param {String} prop
     * @param {String | Number | Boolean} value
     * @param {Array} startValues
     * @param {Array} endValues
     * @param {Number} ratio
     * @param {Object} wait
     * @param {Object} end
     * @return {*}
     */
    static tween (tween: Tween, prop: string, value: string|number|boolean, startValues: {[k: string]: any}, endValues: {[k: string]: any}, ratio: number, wait: any, end: any) {
        if (!(tween.target instanceof MovieClip)) { return value; }
        return (ratio === 1 ? endValues[prop] : startValues[prop]);
    }
}