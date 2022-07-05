import SpriteSheet from "../display/SpriteSheet";

import createCanvas from "./Canvas";

export default class SpriteSheetUtils {

    public static _workingCanvas = createCanvas();
    public static _workingContext: CanvasRenderingContext2D;

    /**
     * The SpriteSheetUtils class is a collection of static methods for working with {{#crossLink "SpriteSheet"}}{{/crossLink}}s.
     * A sprite sheet is a series of images (usually animation frames) combined into a single image on a regular grid. For
     * example, an animation consisting of 8 100x100 images could be combined into a 400x200 sprite sheet (4 frames across
     * by 2 high). The SpriteSheetUtils class uses a static interface and should not be instantiated.
     **/
    private constructor() {
        throw "SpriteSheetUtils cannot be instantiated";
    }

    public static extractFrame(spriteSheet: SpriteSheet, frameOrAnimation: string|number): HTMLImageElement|null {
        if (typeof frameOrAnimation == 'string') {
            frameOrAnimation = spriteSheet.getAnimation(frameOrAnimation).frames[0] as number;
        }

        const data = spriteSheet.getFrame(frameOrAnimation);
        if (!data) {
            return null;
        }
        const r = data.rect;
        const canvas = SpriteSheetUtils._workingCanvas;
        canvas.width = r.width;
        canvas.height = r.height;
        SpriteSheetUtils._workingContext.drawImage(data.image, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
        const img = document.createElement("img");
        img.src = canvas.toDataURL("image/png");
        return img;
    }

    private static _flip(spriteSheet: SpriteSheet, count: number, h: number, v: number): void {
        const imgs: any = spriteSheet._images;
        const canvas = SpriteSheetUtils._workingCanvas;
        const ctx = SpriteSheetUtils._workingContext;
        const il = imgs.length / count;
        for (let i = 0; i < il; i++) {
            const src = imgs[i];
            src.__tmp = i; // a bit hacky, but faster than doing indexOf below.
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width + 1, canvas.height + 1);
            canvas.width = src.width;
            canvas.height = src.height;
            ctx.setTransform(h ? -1 : 1, 0, 0, v ? -1 : 1, h ? src.width : 0, v ? src.height : 0);
            ctx.drawImage(src, 0, 0);
            const img = document.createElement("img");
            img.src = canvas.toDataURL("image/png");
            // work around a strange bug in Safari:
            img.width = (src.width || src.naturalWidth);
            img.height = (src.height || src.naturalHeight);
            imgs.push(img);
        }

        let frames = spriteSheet._frames || [];
        const fl = frames.length / count;
        for (let i = 0; i < fl; i++) {
            const src: any = frames[i];
            const rect = src.rect.clone();
            const img = imgs[src.image.__tmp + il * count];

            const frame = {image: img, rect: rect, regX: src.regX, regY: src.regY};
            if (h) {
                rect.x = (img.width || img.naturalWidth) - rect.x - rect.width; // update rect
                frame.regX = rect.width - src.regX; // update registration point
            }
            if (v) {
                rect.y = (img.height || img.naturalHeight) - rect.y - rect.height;  // update rect
                frame.regY = rect.height - src.regY; // update registration point
            }
            frames.push(frame);
        }

        const sfx = "_" + (h ? "h" : "") + (v ? "v" : "");
        const names = spriteSheet._animations;
        const data = spriteSheet._data;
        const al = names.length / count;
        for (let i = 0; i < al; i++) {
            const name = names[i];
            const src = data[name];
            const __frames: number[] = [];
            const anim = {name: name + sfx, speed: src.speed, next: src.next, frames: __frames};
            if (src.next) {
                anim.next += sfx;
            }
            frames = src.frames;
            for (let j = 0, l = frames.length; j < l; j++) {
                anim.frames.push(frames[j] + fl * count);
            }
            data[anim.name] = anim;
            names.push(anim.name);
        }
    }
}