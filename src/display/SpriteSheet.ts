import {Event, EventDispatcher} from "@create2d/core";

import Rectangle from "../geom/Rectangle";

export default class SpriteSheet extends EventDispatcher {

    /**
     * Indicates whether all images are finished loading.
     **/
    public complete: boolean = true;

    /**
     * Specifies the framerate to use by default for Sprite instances using the SpriteSheet. See the Sprite class
     **/
    public framerate: number = 0;


    _animations: string[] = [];
    _frames: any[] | null = null;
    _images: any[] | null = null;
    _data: any;
    private _loadCount: number = 0;

    // only used for simple frame defs:
    private _frameHeight: number = 0;
    private _frameWidth: number = 0;
    private _numFrames: number = 0;
    private _regX: number = 0;
    private _regY: number = 0;
    private _spacing: number = 0;
    private _margin: number = 0;

    constructor(data?: any) {
        super();
        this._parseData(data);
    }

    /**
     * Returns an array of all available animation names available on this sprite sheet as strings.
     **/
    public get animation() {return this._animations.slice();}


    /**
     * Returns the total number of frames in the specified animation, or in the whole sprite
     * sheet if the animation param is omitted. Returns 0 if the spritesheet relies on calculated frame counts, and
     * the images have not been fully loaded.
     **/
    public getNumFrames(animation?: string): number {
        if (!animation) {
            return this._frames ? this._frames.length : this._numFrames || 0;
        } else {
            const data = this._data ? this._data[animation] : null;
            return data ? data.frames.length : 0;
        }
    }

    /**
     * Returns an object defining the specified animation. The returned object contains:<UL>
     * 	<li>frames: an array of the frame ids in the animation</li>
     * 	<li>speed: the playback speed for this animation</li>
     * 	<li>name: the name of the animation</li>
     * 	<li>next: the default animation to play next. If the animation loops, the name and next property will be the same.</li>
     **/
    public getAnimation(name: string) {
        return this._data[name];
    }

    /**
     * Returns an object specifying the image and source rect of the specified frame. The returned object has
     * <UL>
     * 	<li>an image property holding a reference to the image object in which the frame is found</li>
     * 	<li>a rect property containing a Rectangle instance which defines the boundaries for the frame within thatimage.</li>
     * 	<li> A regX and regY property corresponding to the regX/Y values for the frame.</li>
     * </UL>
     **/
    public getFrame(frameIndex: number) {
        let frame = this._frames ? this._frames[frameIndex] : null;
        return frame || null;
    }

    /**
     * Returns a {@link Rectangle} instance defining the bounds of the specified frame relative to the origin.
     **/
    public getFrameBounds(frameIndex: number, rectangle: Rectangle = new Rectangle()): Rectangle|undefined {
        const frame = this.getFrame(frameIndex);
        return frame ? rectangle.setValues(-frame.regX, -frame.regY, frame.rect.width, frame.rect.height) : undefined;
    }

    /**
     * Returns a string representation of this object.
     **/
    public toString(): string {
        return `[SpriteSheet]`;
    }

    /**
     * SpriteSheet cannot be cloned. A SpriteSheet can be shared by multiple Sprite instances without cloning it.
     **/
    public clone() {
        throw("SpriteSheet cannot be cloned.");
    }

    private _parseData(data: any) {
        let i,l,o,a: any[] = [];
        if (data == null) { return; }

        this.framerate = data.framerate||0;

        // parse images:
        if (data.images && (l=data.images.length) > 0) {
            a = this._images = [];
            for (i=0; i<l; i++) {
                let img = data.images[i];
                let src;
                if (typeof img == "string") {
                    src = img;
                    img = document.createElement("img");
                    img.src = src;
                }
                a.push(img);
                if (!img.getContext && !img.naturalWidth) {
                    this._loadCount++;
                    this.complete = false;
                    ((o, src) => {
                        img.onload = () => o._handleImageLoad();
                        img.onerror = () => o._handleImageError(src);
                    })(this, src);
                }
            }
        }

        // parse frames:
        if (data.frames == null) { // nothing
        } else if (Array.isArray(data.frames)) {
            this._frames = [];
            a = data.frames;
            for (i=0,l=a.length;i<l;i++) {
                let arr = a[i];
                this._frames.push({
                    image: this._images && this._images[arr[4] ? arr[4] : 0],
                    rect: new Rectangle(arr[0],arr[1],arr[2],arr[3]),
                    regX: arr[5]||0, regY:arr[6]||0 }
                );
            }
        } else {
            o = data.frames;
            this._frameWidth = o.width;
            this._frameHeight = o.height;
            this._regX = o.regX||0;
            this._regY = o.regY||0;
            this._spacing = o.spacing||0;
            this._margin = o.margin||0;
            this._numFrames = o.count;
            if (this._loadCount == 0) { this._calculateFrames(); }
        }

        // parse animations:
        this._animations = [];
        if ((o = data.animations)) {
            this._data = {};
            for (const name in o) {
                const anim = {name: name};
                const protoAnim = anim as {[k: string]: any};
                const obj = o[name];
                if (typeof obj == "number") { // single frame
                    a = protoAnim.frames = [obj];
                } else if (Array.isArray(obj)) { // simple
                    if (obj.length == 1) { protoAnim.frames = [obj[0]]; }
                    else {
                        protoAnim.speed = obj[3];
                        protoAnim.next = obj[2];
                        a = protoAnim.frames = [];
                        for (i=obj[0];i<=obj[1];i++) {
                            a.push(i);
                        }
                    }
                } else { // complex
                    protoAnim.speed = obj.speed;
                    protoAnim.next = obj.next;
                    const frames = obj.frames;
                    a = protoAnim.frames = (typeof frames == "number") ? [frames] : frames.slice(0);
                }

                if (protoAnim.next === true || protoAnim.next === undefined) {
                    // loop
                    protoAnim.next = name;
                }
                if (protoAnim.next === false || (a.length < 2 && protoAnim.next == name)) {
                    // stop
                    protoAnim.next = null;
                }
                if (!protoAnim.speed) { protoAnim.speed = 1; }
                this._animations.push(name);
                this._data[name] = anim;
            }
        }
    }

    private _handleImageLoad() {
        if (--this._loadCount == 0) {
            this._calculateFrames();
            this.complete = true;
            this.dispatchEvent("complete");
        }
    }

    private _handleImageError(src: any) {
        const errorEvent: Event = new Event("error");
        const protoEvent = errorEvent as any;
        protoEvent.src = src;
        this.dispatchEvent(errorEvent);

        // Complete is still dispatched.
        if (--this._loadCount == 0) {
            this.dispatchEvent("complete");
        }
    }

    private _calculateFrames() {
        if (this._frames || this._frameWidth == 0) { return; }

        this._frames = [];

        const maxFrames = this._numFrames || 100000; // if we go over this, something is wrong.
        let frameCount = 0;
        const frameWidth = this._frameWidth, frameHeight = this._frameHeight;
        const spacing = this._spacing, margin = this._margin;
        const imgs = this._images ? this._images : [];

        imgLoop:
        for (let i=0; i<imgs.length; i++) {
            const img = imgs[i], imgW = (img.width||img.naturalWidth), imgH = (img.height||img.naturalHeight);

            let y = margin;
            while (y <= imgH-margin-frameHeight) {
                let x = margin;
                while (x <= imgW-margin-frameWidth) {
                    if (frameCount >= maxFrames) {
                        break imgLoop;
                    }
                    frameCount++;
                    this._frames.push({
                        image: img,
                        rect: new Rectangle(x, y, frameWidth, frameHeight),
                        regX: this._regX,
                        regY: this._regY
                    });
                    x += frameWidth+spacing;
                }
                y += frameHeight+spacing;
            }
        }
        this._numFrames = frameCount;
    }
}