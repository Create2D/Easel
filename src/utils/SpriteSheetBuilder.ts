import {Event, EventDispatcher} from "@create2d/core";

import DisplayObject from "../display/DisplayObject";
import MovieClip from "../display/MovieClip";
import SpriteSheet from "../display/SpriteSheet";
import Rectangle from "../geom/Rectangle";

import createCanvas from "./Canvas";


type Frame = {
    source: DisplayObject,
    sourceRect: Rectangle,
    img?: any,
    rect?: any,
    scale: number,
    funct: any,
    data: any,
    index: number,
    height: number
};

export default class SpriteSheetBuilder extends EventDispatcher {
    /**
     * The maximum width for the images (not individual frames) in the generated SpriteSheet. It is recommended to
     * use a power of 2 for this value (ex. 1024, 2048, 4096). If the frames cannot all fit within the max
     * dimensions, then additional images will be created as needed.
     **/
    public maxWidth: number = 2048;

    /**
     * The maximum height for the images (not individual frames) in the generated SpriteSheet. It is recommended to
     * use a power of 2 for this value (ex. 1024, 2048, 4096). If the frames cannot all fit within the max
     * dimensions, then additional images will be created as needed.
     **/
    public maxHeight: number = 2048;

    /**
     * The SpriteSheet that was generated. This will be null before a build is completed successfully.
     **/
    public spriteSheet?: SpriteSheet;

    /**
     * The scale to apply when drawing all frames to the SpriteSheet. This is multiplied against any scale specified
     * in the addFrame call. This can be used, for example, to generate a SpriteSheet at run time that is tailored
     * to the a specific device resolution (ex. tablet vs mobile).
     **/
    public scale: number = 1;

    /**
     * The padding to use between frames. This is helpful to preserve antialiasing on drawn vector content.
     **/
    public padding: number = 1;

    /**
     * A number from 0.01 to 0.99 that indicates what percentage of time the builder can use. This can be
     * thought of as the number of seconds per second the builder will use. For example, with a timeSlice value of 0.3,
     * the builder will run 20 times per second, using approximately 15ms per build (30% of available time, or 0.3s per second).
     **/
    public timeSlice: number = 0.3;

    /**
     * A value between 0 and 1 that indicates the progress of a build, or -1 if a build has not been initiated.
     **/
    public progress: number = -1;

    /**
     * A {{#crossLink "SpriteSheet/framerate:property"}}{{/crossLink}} value that will be passed to new {{#crossLink "SpriteSheet"}}{{/crossLink}} instances that are
     * created. If no framerate is specified (or it is 0), then SpriteSheets will use the {{#crossLink "Ticker"}}{{/crossLink}} framerate.
     **/
    public framerate: number = 0;

    private _frames: Frame[] = [];
    private _animations: {[k: string]: any} = {};
    private _data?: any = {};
    private _nextFrameIndex: number = 0;
    private _index: number = 0;
    private _timerID?: number;
    private _scale: number = 1;

   constructor(framerate: number = 0) {
        super();


    }

    static ERR_DIMENSIONS = "frame dimensions exceed max spritesheet dimensions";
    static ERR_RUNNING = "a build is already running";

// events:
    /**
     * Dispatched when a build completes.
     * @event complete
     * @param {Object} target The object that dispatched the event.
     * @param {String} type The event type.
     * @since 0.6.0
     */

    /**
     * Dispatched when an asynchronous build has progress.
     * @event progress
     * @param {Object} target The object that dispatched the event.
     * @param {String} type The event type.
     * @param {Number} progress The current progress value (0-1).
     * @since 0.6.0
     */


// public methods:
    /**
     * Adds a frame to the {{#crossLink "SpriteSheet"}}{{/crossLink}}. Note that the frame will not be drawn until you
     * call {{#crossLink "SpriteSheetBuilder/build"}}{{/crossLink}} method. The optional setup params allow you to have
     * a function run immediately before the draw occurs. For example, this allows you to add a single source multiple
     * times, but manipulate it or its children to change it to generate different frames.
     *
     * Note that the source's transformations (x, y, scale, rotate, alpha) will be ignored, except for regX/Y. To apply
     * transforms to a source object and have them captured in the SpriteSheet, simply place it into a {{#crossLink "Container"}}{{/crossLink}}
     * and pass in the Container as the source.
     * @method addFrame
     * @param {DisplayObject} source The source {{#crossLink "DisplayObject"}}{{/crossLink}}  to draw as the frame.
     * @param {Rectangle} [sourceRect] A {{#crossLink "Rectangle"}}{{/crossLink}} defining the portion of the
     * source to draw to the frame. If not specified, it will look for a `getBounds` method, bounds property, or
     * `nominalBounds` property on the source to use. If one is not found, the frame will be skipped.
     * @param {Number} [scale=1] Optional. The scale to draw this frame at. Default is 1.
     * @param {Function} [setupFunction] A function to call immediately before drawing this frame. It will be called with two parameters: the source, and setupData.
     * @param {Object} [setupData] Arbitrary setup data to pass to setupFunction as the second parameter.
     * @return {Number} The index of the frame that was just added, or null if a sourceRect could not be determined.
     **/
    public addFrame(source: DisplayObject, sourceRect?: Rectangle, scale: number = 1, setupFunction?: Function, setupData?: any): number|null {
        if (this._data) {
            throw SpriteSheetBuilder.ERR_RUNNING;
        }
        let rect = sourceRect || source.bounds;
        if (!rect && source.bounds) {
            rect = source.bounds;
        }
        if (!rect) {
            return null;
        }

        this._frames.push({
            source: source,
            sourceRect: rect,
            scale: scale,
            funct: setupFunction,
            data: setupData,
            index: this._frames.length,
            height: rect.height * scale
        });

        return this._frames.length - 1;
    }

    /**
     * Adds an animation that will be included in the created {{#crossLink "SpriteSheet"}}{{/crossLink}}.
     * @method addAnimation
     * @param {String} name The name for the animation.
     * @param {Array} frames An array of frame indexes that comprise the animation. Ex. [3,6,5] would describe an animation
     * that played frame indexes 3, 6, and 5 in that order.
     * @param {String} [next] Specifies the name of the animation to continue to after this animation ends. You can
     * also pass false to have the animation stop when it ends. By default it will loop to the start of the same animation.
     * @param {Number} [speed] Specifies a frame advance speed for this animation. For example, a value of 0.5 would
     * cause the animation to advance every second tick. Note that earlier versions used `frequency` instead, which had
     * the opposite effect.
     **/
    public addAnimation(name: string, frames: any[], next?: string|boolean, speed: number = 1) {
        if (this._data) {
            throw SpriteSheetBuilder.ERR_RUNNING;
        }
        this._animations[name] = {frames, next, speed};
    }

    /**
     * This will take a {{#crossLink "MovieClip"}}{{/crossLink}} instance, and add its frames and labels to this
     * builder. Labels will be added as an animation running from the label index to the next label. For example, if
     * there is a label named "foo" at frame 0 and a label named "bar" at frame 10, in a MovieClip with 15 frames, it
     * will add an animation named "foo" that runs from frame index 0 to 9, and an animation named "bar" that runs from
     * frame index 10 to 14.
     *
     * Note that this will iterate through the full MovieClip with {{#crossLink "MovieClip/actionsEnabled:property"}}{{/crossLink}}
     * set to `false`, ending on the last frame.
     * @method addMovieClip
     * @param {MovieClip} source The source MovieClip instance to add to the SpriteSheet.
     * @param {Rectangle} [sourceRect] A {{#crossLink "Rectangle"}}{{/crossLink}} defining the portion of the source to
     * draw to the frame. If not specified, it will look for a {{#crossLink "DisplayObject/getBounds"}}{{/crossLink}}
     * method, `frameBounds` Array, `bounds` property, or `nominalBounds` property on the source to use. If one is not
     * found, the MovieClip will be skipped.
     * @param {Number} [scale=1] The scale to draw the movie clip at.
     * @param {Function} [setupFunction] A function to call immediately before drawing each frame. It will be called
     * with three parameters: the source, setupData, and the frame index.
     * @param {Object} [setupData] Arbitrary setup data to pass to setupFunction as the second parameter.
     * @param {Function} [labelFunction] This method will be called for each MovieClip label that is added with four
     * parameters: the label name, the source MovieClip instance, the starting frame index (in the movieclip timeline)
     * and the end index. It must return a new name for the label/animation, or `false` to exclude the label.
     **/
    public addMovieClip (source: MovieClip, sourceRect?: Rectangle, scale: number = 1, setupFunction?: Function, setupData?: any, labelFunction?: Function) {
        if (this._data) {
            throw SpriteSheetBuilder.ERR_RUNNING;
        }
        const rects = source.frameBounds;
        let rect = sourceRect || source.bounds;
        if (!rect && !rects) {
            return;
        }

        let i, l, baseFrameIndex = this._frames.length;
        let duration = source.timeline.duration;
        for (i = 0; i < duration; i++) {
            const r = (rects && rects[i]) ? rects[i] : rect;
            this.addFrame(source, r, scale, this._setupMovieClipFrame, {i: i, f: setupFunction, d: setupData});
        }
        const labels = source.timeline.labels;
        const lbls = [];
        for (let n in labels) {
            lbls.push({index: labels[n], label: n});
        }
        if (lbls.length) {
            lbls.sort(function (a, b) {
                return a.index.position - b.index.position;
            });
            for (i = 0, l = lbls.length; i < l; i++) {
                let label = lbls[i].label;
                const start = baseFrameIndex + lbls[i].index.position;
                const end = baseFrameIndex + ((i == l - 1) ? duration : lbls[i + 1].index.position);
                const frames = [];
                for (let j = start; j < end; j++) {
                    frames.push(j);
                }
                if (labelFunction) {
                    label = labelFunction(label, source, start, end);
                    if (!label) {
                        continue;
                    }
                }
                this.addAnimation(label, frames, true); // for now, this loops all animations.
            }
        }
    }

    /**
     * Builds a {@link SpriteSheet} instance based on the current frames.
     **/
    public build(): SpriteSheet|null {
        if (this._data) {
            throw SpriteSheetBuilder.ERR_RUNNING;
        }
        this._startBuild();
        while (this._drawNext());
        this._endBuild();
        return this.spriteSheet ? this.spriteSheet : null;
    }

    /**
     * Asynchronously builds a {@link SpriteSheet} instance based on the current frames. It will
     * run 20 times per second, using an amount of time defined by `timeSlice`. When it is complete it will call the
     * specified callback.
     **/
    public buildAsync(timeSlice: number) {
        if (this._data) {
            throw SpriteSheetBuilder.ERR_RUNNING;
        }
        this.timeSlice = timeSlice;
        this._startBuild();
        const _this = this;
        this._timerID = setTimeout(function () {
            _this._run();
        }, 50 - Math.max(0.01, Math.min(0.99, this.timeSlice || 0.3)) * 50);
    }

    /**
     * Stops the current asynchronous build.
     **/
    public stopAsync() {
        clearTimeout(this._timerID);
        this._data = undefined;
    }

    /**
     * SpriteSheetBuilder instances cannot be cloned.
     **/
    public clone() {
        throw("SpriteSheetBuilder cannot be cloned.");
    }

    /**
     * Returns a string representation of this object.
     **/
    public toString(): string {
        return "[SpriteSheetBuilder]";
    }


    private _startBuild() {
        const pad = this.padding || 0;
        this.progress = 0;
        this._index = 0;
        this._scale = this.scale;
        const dataFrames: any[] = [];

        this._data = {
            images: [],
            frames: dataFrames,
            framerate: this.framerate,
            animations: this._animations // TODO: should we "clone" _animations in case someone adds more animations after a build?
        };

        const frames = this._frames.slice();
        frames.sort(function (a, b) {
            return (a.height <= b.height) ? -1 : 1;
        });

        if (frames[frames.length - 1].height + pad * 2 > this.maxHeight) {
            throw SpriteSheetBuilder.ERR_DIMENSIONS;
        }
        let y = 0, x = 0;
        let img = 0;
        while (frames.length) {
            const o = this._fillRow(frames, y, img, dataFrames, pad);
            if (o.w > x) {
                x = o.w;
            }
            y += o.h;
            if (!o.h || !frames.length) {
                const canvas = createCanvas();
                canvas.width = this._getSize(x, this.maxWidth);
                canvas.height = this._getSize(y, this.maxHeight);
                this._data.images[img] = canvas;
                if (!o.h) {
                    x = y = 0;
                    img++;
                }
            }
        }
    }

    protected _setupMovieClipFrame(source: MovieClip, data: any) {
        const ae = source.actionsEnabled;
        source.actionsEnabled = false;
        source.gotoAndStop(data.i);
        source.actionsEnabled = ae;
        data.f && data.f(source, data.d, data.i);
    }

    protected _getSize(size: number, max: number): number {
        let pow = 4;
        while (Math.pow(2, ++pow) < size);
        return Math.min(max, Math.pow(2, pow));
    }

    protected _fillRow(frames: Frame[], y: number, img: HTMLImageElement|number, dataFrames: any, pad: number): {w: number, h: number} {
        const w = this.maxWidth;
        const maxH = this.maxHeight;
        y += pad;
        const h = maxH - y;
        let x = pad;
        let height = 0;
        for (let i = frames.length - 1; i >= 0; i--) {
            const frame = frames[i];
            const sc = this._scale * frame.scale;
            const rect = frame.sourceRect;
            const source = frame.source;
            const rx = Math.floor(sc * rect.x - pad);
            const ry = Math.floor(sc * rect.y - pad);
            const rh = Math.ceil(sc * rect.height + pad * 2);
            const rw = Math.ceil(sc * rect.width + pad * 2);
            if (rw > w) {
                throw SpriteSheetBuilder.ERR_DIMENSIONS;
            }
            if (rh > h || x + rw > w) {
                continue;
            }
            frame.img = img;
            frame.rect = new Rectangle(x, y, rw, rh);
            height = height || rh;
            frames.splice(i, 1);
            dataFrames[frame.index] = [x, y, rw, rh, img, Math.round(-rx + sc * source.regX - pad), Math.round(-ry + sc * source.regY - pad)];
            x += rw;
        }
        return {w: x, h: height};
    }

    protected _endBuild() {
        this.spriteSheet = new SpriteSheet(this._data);
        this._data = null;
        this.progress = 1;
        this.dispatchEvent("complete");
    }

    protected _run() {
        const ts = Math.max(0.01, Math.min(0.99, this.timeSlice || 0.3)) * 50;
        const t = (new Date()).getTime() + ts;
        let complete = false;
        while (t > (new Date()).getTime()) {
            if (!this._drawNext()) {
                complete = true;
                break;
            }
        }
        if (complete) {
            this._endBuild();
        } else {
            const _this = this;
            this._timerID = setTimeout(function () {
                _this._run();
            }, 50 - ts);
        }
        const p = this.progress = this._index / this._frames.length;
        if (this.hasEventListener("progress")) {
            const evt = new Event("progress");
            evt.progress = p;
            this.dispatchEvent(evt);
        }
    }

    protected _drawNext(): boolean {
        const frame = this._frames[this._index];
        const sc = frame.scale * this._scale;
        const rect = frame.rect;
        const sourceRect = frame.sourceRect;
        const canvas = this._data.images[frame.img];
        const ctx = canvas.getContext("2d");
        frame.funct && frame.funct(frame.source, frame.data);
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
        ctx.clip();
        ctx.translate(Math.ceil(rect.x - sourceRect.x * sc), Math.ceil(rect.y - sourceRect.y * sc));
        ctx.scale(sc, sc);
        frame.source.draw(ctx); // display object will draw itself.
        ctx.restore();
        return (++this._index) < this._frames.length;
    }
}
