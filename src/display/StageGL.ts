import BitmapCache from "../filters/BitmapCache";
import Filter from "../filters/Filter";
import Matrix2D from "../geom/Matrix2D";

import Bitmap from "./Bitmap";
import Container from "./Container";
import DisplayObject from "./DisplayObject";
import Stage from "./Stage";
import Sprite from "./Sprite";
import SpriteSheet from "./SpriteSheet";

interface StageGLOptions {
    preserveBuffer?: boolean;
    antialias?: boolean;
    transparent?: boolean;
    directDraw?: boolean;
    premultiply?: boolean; // @deprecated
    autoPurge?: number;
    clearColor?: string|number;
    batchSize?: string|number;
}

interface _WebGLTexture extends WebGLTexture {
    _frameBuffer: any;
    _batchID: number;
    _storeID?: number;
    _drawID: number;
    _imageData?: any[];
    _activeIndex: any;
    
}

export default class StageGL extends Stage {
    public vocalDebug: boolean = false;
    public isCacheControlled: boolean = false;

// private properties:
    protected _preserveBuffer: boolean = false;
    protected _antialias: boolean = false;
    protected _transparent: boolean = false;
    protected _autoPurge: number = 1200;

    private _directDraw: boolean = false;
    public _viewportWidth: number = 0;
    public _viewportHeight: number = 0;
    private _projectionMatrix: Float32Array|null = null;
    public _webGLContext: any;
    private _frameBuffer = null;
    private _clearColor = {r: 0.50, g: 0.50, b: 0.50, a: 0.00};

    private _maxBatchVertexCount: number = 0;

    private _activeShader?: WebGLProgram;
    private _mainShader?: WebGLProgram;

    batchReason?: string;

    /**
     * All the different vertex attribute sets that can be used with the render buffer. Currently only internal,
     * if/when alternate main shaders are possible, they'll register themselves here.
     **/
    private _attributeConfig: {[k: string]: any} = {};

    /**
     * Which of the configs in {{#crossLink "StageGL/_attributeConfig:property"}}{{/crossLink}} is currently active.
     **/
    private _activeConfig?: any;

    /**
     * One of the major render buffers used in composite blending drawing. Do not expect this to always be the same object.
     * "What you're drawing to", object occasionally swaps with concat.
     **/
    private _bufferTextureOutput?: WebGLTexture;

    /**
     * One of the major render buffers used in composite blending drawing. Do not expect this to always be the same object.
     * "What you've draw before now", object occasionally swaps with output.
     **/
    private _bufferTextureConcat?: WebGLTexture;

    /**
     * One of the major render buffers used in composite blending drawing.
     * "Temporary mixing surface"
     **/
    private _bufferTextureTemp?: WebGLTexture;

    /**
     * The current render buffer being targeted, usually targets internal buffers, but may be set to cache's buffer during a cache render.
     **/
    private _batchTextureOutput?: WebGLTexture|StageGL = this;

    /**
     * The current render buffer being targeted, usually targets internal buffers, but may be set to cache's buffer during a cache render.
     **/
    private _batchTextureConcat?: WebGLTexture;

    /**
     * The current render buffer being targeted, usually targets internal buffers, but may be set to cache's buffer during a cache render.
     **/
    private _batchTextureTemp?: WebGLTexture;

    /**
     * Internal library of the shaders that have been compiled and created along with their parameters. Should contain
     * compiled `gl.ShaderProgram` and settings for `gl.blendFunc` and `gl.blendEquation`. Populated as requested.
     **/
    private _builtShaders: {[k: string]: any} = {};

    /**
     * An index based lookup of every WebGL Texture currently in use.
     **/
    _textureDictionary: any[] = [];

    /**
     * A string based lookup hash of which index a texture is stored at in the dictionary. The lookup string is
     * often the src url.
     **/
    private _textureIDs: {[k: string]: number} = {};

    /**
     * An array of all the textures currently loaded into the GPU. The index in the array matches the GPU index.
     **/
    private _batchTextures: any[] = [];

    /**
     * An array of all the simple filler textures used to prevent issues with missing textures in a batch.
     **/
    private _baseTextures: any[] = [];

    /**
     * Texture slots for a draw
     **/
    private _gpuTextureCount: number = 8;

    /**
     * Texture slots on the hardware
     **/
    private _gpuTextureMax: number = 8;

    /**
     * Texture slots in a batch for User textures
     **/
    _batchTextureCount: number = 0;

    /**
     * The location at which the last texture was inserted into a GPU slot
     */
    private _lastTextureInsert: number = -1;

    /**
     * The current string name of the render mode being employed per Context2D spec.
     * Must start invalid to trigger default shader into being built during init.
     **/
    private _renderMode: string = "";

    /**
     * Flag indicating that the content being batched in `appendToBatch` must be drawn now and not follow batch logic.
     * Used for effects that are compounding in nature and cannot be applied in a single pass.
     * Should be enabled with extreme care due to massive performance implications.
     **/
    private _immediateRender: boolean = false;

    /**
     * Vertices drawn into the batch so far.
     **/
    private _batchVertexCount: number = 0;

    /**
     * The current batch being drawn, A batch consists of a call to `drawElements` on the GPU. Many of these calls
     * can occur per draw.
     **/
    _batchID: number = 0;

    /**
     * The current draw being performed, may contain multiple batches. Comparing to {{#crossLink "StageGL/_batchID:property"}}{{/crossLink}}
     * can reveal batching efficiency.
     **/
    _drawID: number = 0;

    /**
     * Tracks how many renders have occurred this draw, used for performance monitoring and empty draw avoidance.
     **/
    private _renderPerDraw: number = 0;

    /**
     * Used to prevent textures in certain GPU slots from being replaced by an insert.
     **/
    private _slotBlacklist = [];

    /**
     * Used to ensure every canvas used as a texture source has a unique ID.
     **/
    private _lastTrackedCanvas: number = -1;

    /**
     * Used to counter-position the object being cached so it aligns with the cache surface. Additionally ensures
     * that all rendering starts with a top level container.
     **/
    private _cacheContainer: Container = new Container();

    constructor(canvas: HTMLCanvasElement|string, options?: StageGLOptions) {
        super(canvas);

        let transparent, antialias, preserveBuffer, autoPurge, directDraw, batchSize;

        if (options) {
            transparent = options.transparent ;
            antialias = options.antialias;
            preserveBuffer = options.preserveBuffer;
            autoPurge = options.autoPurge;
            directDraw = options.directDraw;
            batchSize = options.batchSize;
        }

        this._preserveBuffer = preserveBuffer||false;
        this._antialias = antialias||false;
        this._transparent = transparent||false;
        autoPurge && (this.autoPurge = autoPurge);
        this._directDraw = directDraw === undefined ? true : !!directDraw;


        // and begin
        this._initializeWebGL();

        this._maxBatchVertexCount = Math.max(
            Math.min(
                Number(batchSize) || StageGL.DEFAULT_MAX_BATCH_SIZE,
                StageGL.DEFAULT_MAX_BATCH_SIZE
            ),
            StageGL.DEFAULT_MIN_BATCH_SIZE
        ) * StageGL.INDICES_PER_CARD;

    }


    /**
     * Calculate the UV co-ordinate based info for sprite frames. Instead of pixel count it uses a 0-1 space. Also includes
     * the ability to get info back for a specific frame, or only calculate that one frame.
     **/
    public static buildUVRects(spritesheet?: SpriteSheet, target: number = -1, onlyTarget: boolean = false): {t: number, l: number, b: number, r: number}|null {
        if (!spritesheet || !spritesheet._frames) { return null; }
        if (target === undefined) { target = -1; }
        if (onlyTarget === undefined) { onlyTarget = false; }

        const start = (target !== -1 && onlyTarget)?(target):(0);
        const end = (target !== -1 && onlyTarget)?(target+1):(spritesheet._frames.length);
        for (let i=start; i<end; i++) {
            const f = spritesheet._frames[i];
            if (f.uvRect || f.image.width <= 0 || f.image.height <= 0) { continue; }

            const r = f.rect;
            f.uvRect = {
                t: 1 - (r.y / f.image.height),
                l: r.x / f.image.width,
                b: 1 - ((r.y + r.height) / f.image.height),
                r: (r.x + r.width) / f.image.width
            };
        }

        return spritesheet._frames[(target !== -1) ? target : 0].uvRect || {t:0, l:0, b:1, r:1};
    }

    public static isWebGLActive(ctx?: CanvasRenderingContext2D): boolean {
        return ctx !== undefined && ctx instanceof WebGLRenderingContext && typeof WebGLRenderingContext !== 'undefined';
    }

    public static colorToObj(color: string|number): {r: number, g: number, b: number, a: number} {
        let r: number = 0, g: number = 0, b: number = 0, a: number = 0;

        if (typeof color === "string") {
            if (color.indexOf("#") === 0) {
                if (color.length === 4) {
                    color = "#" + color.charAt(1)+color.charAt(1) + color.charAt(2)+color.charAt(2) + color.charAt(3)+color.charAt(3)
                }
                r = Number("0x"+color.slice(1, 3))/255;
                g = Number("0x"+color.slice(3, 5))/255;
                b = Number("0x"+color.slice(5, 7))/255;
                a = color.length > 7 ? Number("0x"+color.slice(7, 9))/255 : 1;
            } else if (color.indexOf("rgba(") === 0) {
                let output = color.slice(5, -1).split(",");
                r = Number(output[0])/255;
                g = Number(output[1])/255;
                b = Number(output[2])/255;
                a = Number(output[3]);
            }
        } else {	// >>> is an unsigned shift which is what we want as 0x80000000 and up are negative values
            r = ((color & 0xFF000000) >>> 24)/255;
            g = ((color & 0x00FF0000) >>> 16)/255;
            b = ((color & 0x0000FF00) >>> 8)/255;
            a = (color & 0x000000FF)/255;
        }

        return {
            r: Math.min(Math.max(0, r), 1),
            g: Math.min(Math.max(0, g), 1),
            b: Math.min(Math.max(0, b), 1),
            a: Math.min(Math.max(0, a), 1)
        }
    }

    private static readonly VERTEX_PROPERTY_COUNT = 6;
    public static readonly INDICES_PER_CARD = 6;
    public static readonly DEFAULT_MAX_BATCH_SIZE = 10920;
    public static readonly DEFAULT_MIN_BATCH_SIZE = 170;
    public static readonly WEBGL_MAX_INDEX_NUM = Math.pow(2, 16);
    private static readonly UV_RECT = {t:1, l:0, b:0, r:1};


    public static readonly COVER_VERT = new Float32Array([
        -1,		 1,		//TL
        1,		 1,		//TR
        -1,		-1,		//BL
        1,		 1,		//TR
        1,		-1,		//BR
        -1,		-1		//BL
    ]);

    public static readonly COVER_UV = new Float32Array([
        0,		 1,		//TL
        1,		 1,		//TR
        0,		 0,		//BL
        1,		 1,		//TR
        1,		 0,		//BR
        0,		 0		//BL
    ]);
    /* Breaking in older browsers, but those browsers wont run StageGL so no recovery or warning needed */

    private static readonly REGULAR_VARYING_HEADER = (
        "#ifdef GL_FRAGMENT_PRECISION_HIGH \n"+
        "precision highp float; \n"+
        "#else \n"+
        "precision mediump float; \n"+
        "#endif \n"+

        "varying vec2 vTextureCoord;" +
        "varying lowp float indexPicker;" +
        "varying lowp float alphaValue;"
    );

    private static readonly REGULAR_VERTEX_HEADER = (
        StageGL.REGULAR_VARYING_HEADER +
        "attribute vec2 vertexPosition;" +
        "attribute vec2 uvPosition;" +
        "attribute lowp float textureIndex;" +
        "attribute lowp float objectAlpha;" +
        "uniform mat4 pMatrix;"
    );

    private static readonly REGULAR_FRAGMENT_HEADER = (
        StageGL.REGULAR_VARYING_HEADER +
        "uniform sampler2D uSampler[{{count}}];"
    );

    private static readonly REGULAR_VERTEX_BODY  = (
        "void main(void) {" +
        "gl_Position = pMatrix * vec4(vertexPosition.x, vertexPosition.y, 0.0, 1.0);" +
        "alphaValue = objectAlpha;" +
        "indexPicker = textureIndex;" +
        "vTextureCoord = uvPosition;" +
        "}"
    );

    private static readonly REGULAR_FRAGMENT_BODY = (
        "void main(void) {" +
        "vec4 color = vec4(1.0, 0.0, 0.0, 1.0);" +

        "if (indexPicker <= 0.5) {" +
        "color = texture2D(uSampler[0], vTextureCoord);" +
        "{{alternates}}" +
        "}" +

        "gl_FragColor = vec4(color.rgb * alphaValue, color.a * alphaValue);" +
        "}"
    );

    private static readonly COVER_VARYING_HEADER = (
        "#ifdef GL_FRAGMENT_PRECISION_HIGH \n"+
        "precision highp float; \n"+
        "#else \n"+
        "precision mediump float; \n"+
        "#endif \n"+

        "varying vec2 vTextureCoord;"
    );

    private static readonly COVER_VERTEX_HEADER = (
        StageGL.COVER_VARYING_HEADER +
        "attribute vec2 vertexPosition;" +
        "attribute vec2 uvPosition;"
    );

    private static readonly COVER_FRAGMENT_HEADER = (
        StageGL.COVER_VARYING_HEADER +
        "uniform sampler2D uSampler;"
    );

    private static readonly COVER_VERTEX_BODY  = (
        "void main(void) {" +
        "gl_Position = vec4(vertexPosition.x, vertexPosition.y, 0.0, 1.0);" +
        "vTextureCoord = uvPosition;" +
        "}"
    );

    private static readonly COVER_FRAGMENT_BODY = (
        "void main(void) {" +
        "gl_FragColor = texture2D(uSampler, vTextureCoord);" +
        "}"
    );

    private static readonly BLEND_FRAGMENT_SIMPLE = (
        "uniform sampler2D uMixSampler;"+
        "void main(void) {" +
        "vec4 src = texture2D(uMixSampler, vTextureCoord);" +
        "vec4 dst = texture2D(uSampler, vTextureCoord);"
        // note this is an open bracket on main!
    );

    private static readonly BLEND_FRAGMENT_COMPLEX = (
        StageGL.BLEND_FRAGMENT_SIMPLE +
        "vec3 srcClr = min(src.rgb/src.a, 1.0);" +
        "vec3 dstClr = min(dst.rgb/dst.a, 1.0);" +

        "float totalAlpha = min(1.0 - (1.0-dst.a) * (1.0-src.a), 1.0);" +
        "float srcFactor = min(max(src.a - dst.a, 0.0) / totalAlpha, 1.0);" +
        "float dstFactor = min(max(dst.a - src.a, 0.0) / totalAlpha, 1.0);" +
        "float mixFactor = max(max(1.0 - srcFactor, 0.0) - dstFactor, 0.0);" +

        "gl_FragColor = vec4(" +
        "(" +
        "srcFactor * srcClr +" +
        "dstFactor * dstClr +" +
        "mixFactor * vec3("
        // this should be closed with the cap!
    );

    private static readonly BLEND_FRAGMENT_COMPLEX_CAP = (
        ")" +
        ") * totalAlpha, totalAlpha" +
        ");" +
        "}"
    );

    private static readonly BLEND_FRAGMENT_OVERLAY_UTIL = (
        "float overlay(float a, float b) {" +
        "if(a < 0.5) { return 2.0 * a * b; }" +
        "return 1.0 - 2.0 * (1.0-a) * (1.0-b);" +
        "}"
    );

    private static readonly BLEND_FRAGMENT_HSL_UTIL = (
        "float getLum(vec3 c) { return 0.299*c.r + 0.589*c.g + 0.109*c.b; }" +
        "float getSat(vec3 c) { return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }" +
        "vec3 clipHSL(vec3 c) {" +
        "float lum = getLum(c);" +
        "float n = min(min(c.r, c.g), c.b);" +
        "float x = max(max(c.r, c.g), c.b);" +
        "if(n < 0.0){ c = lum + (((c - lum) * lum) / (lum - n)); }" +
        "if(x > 1.0){ c = lum + (((c - lum) * (1.0 - lum)) / (x - lum)); }" +
        "return clamp(c, 0.0, 1.0);" +
        "}" +
        "vec3 setLum(vec3 c, float lum) {" +
        "return clipHSL(c + (lum - getLum(c)));" +
        "}" +
        "vec3 setSat(vec3 c, float val) {" +
        "vec3 result = vec3(0.0);" +
        "float minVal = min(min(c.r, c.g), c.b);" +
        "float maxVal = max(max(c.r, c.g), c.b);" +
        "vec3 minMask = vec3(c.r == minVal, c.g == minVal, c.b == minVal);" +
        "vec3 maxMask = vec3(c.r == maxVal, c.g == maxVal, c.b == maxVal);" +
        "vec3 midMask = 1.0 - min(minMask+maxMask, 1.0);" +
        "float midVal = (c*midMask).r + (c*midMask).g + (c*midMask).b;" +
        "if(maxVal > minVal) {" +
        "result = midMask * min( ((midVal - minVal) * val) / (maxVal - minVal), 1.0);" +
        "result += maxMask * val;" +
        "}" +
        "return result;" +
        "}"
    );

    public static readonly BLEND_SOURCES: {[k: string]: any} = {
        "source-over": { // empty object verifies it as a blend mode, but default values handle actual settings
            //eqRGB: "FUNC_ADD",						eqA: "FUNC_ADD"
            //srcRGB: "ONE",							srcA: "ONE"
            //dstRGB: "ONE_MINUS_SRC_ALPHA",			dstA: "ONE_MINUS_SRC_ALPHA"
        },
        "source-in": {
            shader: (StageGL.BLEND_FRAGMENT_SIMPLE +
                "gl_FragColor = vec4(src.rgb * dst.a, src.a * dst.a);" +
                "}")
        },
        "source-in_cheap": {
            srcRGB: "DST_ALPHA",					srcA: "ZERO",
            dstRGB: "ZERO",							dstA: "SRC_ALPHA"
        },
        "source-out": {
            shader: (StageGL.BLEND_FRAGMENT_SIMPLE +
                "gl_FragColor = vec4(src.rgb * (1.0 - dst.a), src.a - dst.a);" +
                "}")
        },
        "source-out_cheap": {
            eqA: "FUNC_SUBTRACT",
            srcRGB: "ONE_MINUS_DST_ALPHA",			srcA: "ONE",
            dstRGB: "ZERO",							dstA: "SRC_ALPHA"
        },
        "source-atop": {
            srcRGB: "DST_ALPHA",					srcA: "ZERO",
            dstRGB: "ONE_MINUS_SRC_ALPHA",			dstA: "ONE"
        },
        "destination-over": {
            srcRGB: "ONE_MINUS_DST_ALPHA",			srcA: "ONE_MINUS_DST_ALPHA",
            dstRGB: "ONE",							dstA: "ONE"
        },
        "destination-in": {
            shader: (StageGL.BLEND_FRAGMENT_SIMPLE +
                "gl_FragColor = vec4(dst.rgb * src.a, src.a * dst.a);" +
                "}")
        },
        "destination-in_cheap": {
            srcRGB: "ZERO",							srcA: "DST_ALPHA",
            dstRGB: "SRC_ALPHA",					dstA: "ZERO"
        },
        "destination-out": {
            eqA: "FUNC_REVERSE_SUBTRACT",
            srcRGB: "ZERO",							srcA: "DST_ALPHA",
            dstRGB: "ONE_MINUS_SRC_ALPHA",			dstA: "ONE"
        },
        "destination-atop": {
            shader: (StageGL.BLEND_FRAGMENT_SIMPLE +
                "gl_FragColor = vec4(dst.rgb * src.a + src.rgb * (1.0 - dst.a), src.a);" +
                "}")
        },
        "destination-atop_cheap": {
            srcRGB: "ONE_MINUS_DST_ALPHA",			srcA: "ONE",
            dstRGB: "SRC_ALPHA",					dstA: "ZERO"
        },
        "copy": {
            shader: (StageGL.BLEND_FRAGMENT_SIMPLE +
                "gl_FragColor = vec4(src.rgb, src.a);" +
                "}")
        },
        "copy_cheap": {
            dstRGB: "ZERO",							dstA: "ZERO"
        },
        "xor": {
            shader: (StageGL.BLEND_FRAGMENT_SIMPLE +
                "float omSRC = (1.0 - src.a);" +
                "float omDST = (1.0 - dst.a);" +
                "gl_FragColor = vec4(src.rgb * omDST + dst.rgb * omSRC, src.a * omDST + dst.a * omSRC);"
                + "}")
        },

        "multiply": { // this has to be complex to handle retention of both dst and src in non mixed scenarios
            shader: (StageGL.BLEND_FRAGMENT_COMPLEX +
                "srcClr * dstClr"
                + StageGL.BLEND_FRAGMENT_COMPLEX_CAP)
        },
        "multiply_cheap": { // NEW, handles retention of src data incorrectly when no dst data present
            srcRGB: "ONE_MINUS_DST_ALPHA",			srcA: "ONE",
            dstRGB: "SRC_COLOR",					dstA: "ONE"
        },
        "screen": {
            srcRGB: "ONE",							srcA: "ONE",
            dstRGB: "ONE_MINUS_SRC_COLOR",			dstA: "ONE_MINUS_SRC_ALPHA"
        },
        "lighter": {
            dstRGB: "ONE",							dstA:"ONE"
        },
        "lighten": { //WebGL 2.0 can optimize this
            shader: (StageGL.BLEND_FRAGMENT_COMPLEX +
                "max(srcClr, dstClr)"
                + StageGL.BLEND_FRAGMENT_COMPLEX_CAP)
        },
        "darken": { //WebGL 2.0 can optimize this
            shader: (StageGL.BLEND_FRAGMENT_COMPLEX +
                "min(srcClr, dstClr)"
                + StageGL.BLEND_FRAGMENT_COMPLEX_CAP)
        },

        "overlay": {
            shader: (StageGL.BLEND_FRAGMENT_OVERLAY_UTIL + StageGL.BLEND_FRAGMENT_COMPLEX +
                "overlay(dstClr.r,srcClr.r), overlay(dstClr.g,srcClr.g), overlay(dstClr.b,srcClr.b)"
                + StageGL.BLEND_FRAGMENT_COMPLEX_CAP)
        },
        "hard-light": {
            shader: (StageGL.BLEND_FRAGMENT_OVERLAY_UTIL + StageGL.BLEND_FRAGMENT_COMPLEX +
                "overlay(srcClr.r,dstClr.r), overlay(srcClr.g,dstClr.g), overlay(srcClr.b,dstClr.b)"
                + StageGL.BLEND_FRAGMENT_COMPLEX_CAP)
        },
        "soft-light": {
            shader: (
                "float softcurve(float a) {" +
                "if(a > 0.25) { return sqrt(a); }" +
                "return ((16.0 * a - 12.0) * a + 4.0) * a;" +
                "}" +
                "float softmix(float a, float b) {" +
                "if(b <= 0.5) { return a - (1.0 - 2.0*b) * a * (1.0 - a); }" +
                "return a + (2.0 * b - 1.0) * (softcurve(a) - a);" +
                "}" + StageGL.BLEND_FRAGMENT_COMPLEX +
                "softmix(dstClr.r,srcClr.r), softmix(dstClr.g,srcClr.g), softmix(dstClr.b,srcClr.b)"
                + StageGL.BLEND_FRAGMENT_COMPLEX_CAP)
        },
        "color-dodge": {
            shader: (StageGL.BLEND_FRAGMENT_COMPLEX +
                "clamp(dstClr / (1.0 - srcClr), 0.0, 1.0)"
                + StageGL.BLEND_FRAGMENT_COMPLEX_CAP)
        },
        "color-burn": {
            shader: (StageGL.BLEND_FRAGMENT_COMPLEX +
                "1.0 - clamp((1.0 - smoothstep(0.0035, 0.9955, dstClr)) / smoothstep(0.0035, 0.9955, srcClr), 0.0, 1.0)"
                + StageGL.BLEND_FRAGMENT_COMPLEX_CAP)
        },
        "difference": { // do this to match visible results in browsers
            shader: (StageGL.BLEND_FRAGMENT_COMPLEX +
                "abs(src.rgb - dstClr)"
                + StageGL.BLEND_FRAGMENT_COMPLEX_CAP)
        },
        "exclusion": { // do this to match visible results in browsers
            shader: (StageGL.BLEND_FRAGMENT_COMPLEX +
                "dstClr + src.rgb - 2.0 * src.rgb * dstClr"
                + StageGL.BLEND_FRAGMENT_COMPLEX_CAP)
        },

        "hue": {
            shader: (StageGL.BLEND_FRAGMENT_HSL_UTIL + StageGL.BLEND_FRAGMENT_COMPLEX +
                "setLum(setSat(srcClr, getSat(dstClr)), getLum(dstClr))"
                + StageGL.BLEND_FRAGMENT_COMPLEX_CAP)
        },
        "saturation": {
            shader: (StageGL.BLEND_FRAGMENT_HSL_UTIL + StageGL.BLEND_FRAGMENT_COMPLEX +
                "setLum(setSat(dstClr, getSat(srcClr)), getLum(dstClr))"
                + StageGL.BLEND_FRAGMENT_COMPLEX_CAP)
        },
        "color": {
            shader: (StageGL.BLEND_FRAGMENT_HSL_UTIL + StageGL.BLEND_FRAGMENT_COMPLEX +
                "setLum(srcClr, getLum(dstClr))"
                + StageGL.BLEND_FRAGMENT_COMPLEX_CAP)
        },
        "luminosity": {
            shader: (StageGL.BLEND_FRAGMENT_HSL_UTIL + StageGL.BLEND_FRAGMENT_COMPLEX +
                "setLum(dstClr, getLum(srcClr))"
                + StageGL.BLEND_FRAGMENT_COMPLEX_CAP)
        }
    }

    public get isWebGL(): boolean {
        return !!this._webGLContext;
    }

    public set autoPurge(value: number) {
        value = isNaN(value) ? 1200 : value;
        if (value !== -1) {
            value = value < 10 ? 10 : value;
        }
        this._autoPurge = value;
    }

    public get autoPurge(): number {
        return this._autoPurge;
    }

    protected _initializeWebGL() {
        if (this.canvas) {
            if (!this._webGLContext || this._webGLContext.canvas !== this.canvas) {
                // A context hasn't been defined yet,
                // OR the defined context belongs to a different canvas, so reinitialize.

                // defaults and options
                const options = {
                    depth: false, // nothing has depth
                    stencil: false, // while there's uses for this, we're not using any yet
                    premultipliedAlpha: this._transparent, // this is complicated, trust it

                    alpha: this._transparent,
                    antialias: this._antialias,
                    preserveDrawingBuffer: this._preserveBuffer
                };

                const gl = this._webGLContext = this._fetchWebGLContext(this.canvas, options);
                if (!gl) { return null; }

                gl.disable(gl.DEPTH_TEST);
                gl.depthMask(false);
                gl.enable(gl.BLEND);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.clearColor(0.0, 0.0, 0.0, 0);
                gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
                gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

                this._createBuffers();
                this._initMaterials();
                this._updateRenderMode("source-over");

                this.updateViewport(this.canvas.width, this.canvas.height);
                if (!this._directDraw) {
                    this._bufferTextureOutput = this.getRenderBufferTexture(this._viewportWidth, this._viewportHeight);
                }

                (this.canvas as any)._invalid = true;
            }
        } else {
            this._webGLContext = null;
        }
        return this._webGLContext;
    }

    public update(props: any) {
        if (!this.canvas) { return; }
        if (this.tickOnUpdate) { this.tick(props); }
        this.dispatchEvent("drawstart");

        if (this._webGLContext) {
            this.draw(this._webGLContext, false);
        } else {
            // Use 2D.
            if (this.autoClear) { this.clear(); }
            const ctx = this.canvas.getContext("2d");
            if (ctx) {
                ctx.save();
                this.updateContext(ctx);
                this.draw(ctx, false);
                ctx.restore();
            }
        }
        this.dispatchEvent("drawend");
    }

    public clear() {
        if (!this.canvas) { return; }

        const gl = this._webGLContext;
        if (!StageGL.isWebGLActive(gl)) { // Use 2D.
            super.clear();
            return;
        }

        if (gl) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            this._clearFrameBuffer(this._transparent ? this._clearColor.a : 1);
        }
    }

    public draw(context: RenderingContext, ignoreCache?: boolean): boolean {
        const gl = this._webGLContext;
        // 2D context fallback
        if (!(context === gl && StageGL.isWebGLActive(gl))) {
            if (context instanceof CanvasRenderingContext2D) {
                return super.draw(context, ignoreCache);
            }
        }

        const storeBatchOutput = this._batchTextureOutput;
        const storeBatchConcat = this._batchTextureConcat;
        const storeBatchTemp = this._batchTextureTemp;

        // Use WebGL
        this._renderPerDraw = 0;
        this._batchVertexCount = 0;
        this._drawID++;

        if (this._directDraw) {
            this._batchTextureOutput = this;
            if (this.autoClear) { this.clear(); }
        } else {
            this._batchTextureOutput = this._bufferTextureOutput;
            this._batchTextureConcat = this._bufferTextureConcat;
            this._batchTextureTemp = this._bufferTextureTemp;
        }

        this._updateRenderMode("source-over");
        this._drawContent(this, ignoreCache);

        if (!this._directDraw) {
            if (this.autoClear) { this.clear(); }
            this.batchReason = "finalOutput";
            if(this._renderPerDraw) {
                this._drawCover(null, this._batchTextureOutput);
            }
        }

        // batches may generate or swap around textures. To be sure we capture them, store them back into buffer
        this._bufferTextureOutput = this._batchTextureOutput;
        this._bufferTextureConcat = this._batchTextureConcat;
        this._bufferTextureTemp = this._batchTextureTemp;

        this._batchTextureOutput = storeBatchOutput;
        this._batchTextureConcat = storeBatchConcat;
        this._batchTextureTemp = storeBatchTemp;

        if (this._autoPurge !== -1 && !(this._drawID%((this._autoPurge/2)|0))) {
            this.purgeTextures(this._autoPurge);
        }

        return true;
    }

    public cacheDraw(target: DisplayObject, manager: BitmapCache) {
        // 2D context fallback
        if (!StageGL.isWebGLActive(this._webGLContext)) {
            return false;
        }

        for (let i = 0; i < this._gpuTextureCount; i++) {
            if(this._batchTextures[i]._frameBuffer) {
                this._batchTextures[i] = this._baseTextures[i];
            }
        }

        const storeBatchOutput = this._batchTextureOutput;
        const storeBatchConcat = this._batchTextureConcat;
        const storeBatchTemp = this._batchTextureTemp;

        let filterCount = manager._filterCount, filtersLeft = filterCount;
        const backupWidth = this._viewportWidth, backupHeight = this._viewportHeight;
        this._updateDrawingSurface(manager._drawWidth, manager._drawHeight);

        this._batchTextureOutput = (manager._filterCount%2) ? manager._bufferTextureConcat : manager._bufferTextureOutput;
        this._batchTextureConcat = (manager._filterCount%2) ? manager._bufferTextureOutput : manager._bufferTextureConcat;
        this._batchTextureTemp = manager._bufferTextureTemp;

        const container = this._cacheContainer;
        container.children = [target];
        container.transformMatrix = this._alignTargetToCache(target, manager);

        this._updateRenderMode("source-over");
        this._drawContent(container, true);

        // re-align buffers with fake filter passes to solve certain error cases
        if (this.isCacheControlled) {
            // post filter pass to place content into output buffer
            //TODO: add in directDraw support for cache controlled StageGLs
            filterCount++;
            filtersLeft++;
        } else if (manager._cacheCanvas !== ((manager._filterCount%2) ? this._batchTextureConcat : this._batchTextureOutput)) {
            // pre filter pass to align output, may of become misaligned due to composite operations
            filtersLeft++;
        }

        while (filtersLeft) { //warning: pay attention to where filtersLeft is modified, this is a micro-optimization
            const filter = manager._getGLFilter(filterCount - (filtersLeft--));
            const swap = this._batchTextureConcat;
            this._batchTextureConcat = this._batchTextureOutput;
            this._batchTextureOutput = (this.isCacheControlled && filtersLeft === 0) ? this : swap;
            this.batchReason = "filterPass";
            this._drawCover(this._batchTextureOutput && (this._batchTextureOutput as any)._frameBuffer, this._batchTextureConcat, filter);
        }

        manager._bufferTextureOutput = this._batchTextureOutput;
        manager._bufferTextureConcat = this._batchTextureConcat;
        manager._bufferTextureTemp = this._batchTextureTemp;

        this._batchTextureOutput = storeBatchOutput;
        this._batchTextureConcat = storeBatchConcat;
        this._batchTextureTemp = storeBatchTemp;

        this._updateDrawingSurface(backupWidth, backupHeight);
        return true;
    }

    public releaseTexture(item: DisplayObject|WebGLTexture|any, safe: boolean = false) {
        let i, l;
        if (!item) { return; }

        // this is a container object
        if (item.children) {
            for (i = 0, l = item.children.length; i < l; i++) {
                this.releaseTexture(item.children[i], safe);
            }
        }

        // this has a cache canvas
        if (item.cacheCanvas) {
            item.uncache();
        }

        let foundImage = undefined;
        if (item._storeID !== undefined) {
            // this is a texture itself
            if (item === this._textureDictionary[item._storeID]) {
                this._killTextureObject(item);
                item._storeID = undefined;
                return;
            }

            // this is an image or canvas
            foundImage = item;
        } else if (item._webGLRenderStyle === 2) {
            // this is a Bitmap class
            foundImage = item.image;
            if (foundImage.getImage) { foundImage = foundImage.getImage(); }
        } else if (item._webGLRenderStyle === 1) {
            // this is a SpriteSheet, we can't tell which image we used from the list easily so remove them all!
            for (i = 0, l = item.spriteSheet._images.length; i < l; i++) {
                this.releaseTexture(item.spriteSheet._images[i], safe);
            }
            return;
        }

        // did we find anything
        if (foundImage === undefined) {
            if (this.vocalDebug) {
                console.log("No associated texture found on release");
            }
            return;
        }

        // remove it
        const texture = this._textureDictionary[foundImage._storeID];
        if (safe) {
            const data = texture._imageData;
            const index = data.indexOf(foundImage);
            if (index >= 0) { data.splice(index, 1); }
            foundImage._storeID = undefined;
            if (data.length === 0) { this._killTextureObject(texture); }
        } else {
            this._killTextureObject(texture);
        }
    }

    public purgeTextures(count: number = 100) {
        if (!(count >= 0)){ count = 100; }

        const dict = this._textureDictionary;
        const l = dict.length;
        for (let i = 0; i<l; i++) {
            let data;
            const texture = dict[i];
            if (!texture || !(data = texture._imageData)) { continue; }

            for (let j = 0; j<data.length; j++) {
                const item = data[j];
                if (item._drawID + count <= this._drawID) {
                    item._storeID = undefined;
                    data.splice(j, 1);
                    j--;
                }
            }

            if (!data.length) { this._killTextureObject(texture); }
        }
    }

    public updateViewport(width: number, height: number) {
        width = Math.abs(width|0) || 1;
        height = Math.abs(height|0) || 1;

        this._updateDrawingSurface(width, height);

        if (this._bufferTextureOutput !== this && this._bufferTextureOutput !== null) {
            this.resizeTexture(this._bufferTextureOutput, this._viewportWidth, this._viewportHeight);
        }
        if (this._bufferTextureConcat !== null) {
            this.resizeTexture(this._bufferTextureConcat, this._viewportWidth, this._viewportHeight);
        }
        if (this._bufferTextureTemp !== null) {
            this.resizeTexture(this._bufferTextureTemp, this._viewportWidth, this._viewportHeight);
        }
    }

    public getFilterShader(filter: any /*Filter|StageGL*/): WebGLProgram|undefined {
        if (!filter) { filter = this; }

        const gl = this._webGLContext;
        let targetShader = this._activeShader;

        if (filter._builtShader) {
            targetShader = filter._builtShader;
            if (filter.shaderParamSetup) {
                gl.useProgram(targetShader);
                filter.shaderParamSetup(gl, this, targetShader);
            }
        } else {
            try {
                targetShader = this._fetchShaderProgram(
                    true, filter.VTX_SHADER_BODY, filter.FRAG_SHADER_BODY,
                    filter.shaderParamSetup && filter.shaderParamSetup.bind(filter)
                );
                filter._builtShader = targetShader;
                (targetShader as any)._name = filter.toString();
            } catch (e) {
                console && console.log("SHADER SWITCH FAILURE", e);
            }
        }
        return targetShader;
    }

    public getBaseTexture(w: number = 1, h: number = 1) {
        const width = Math.ceil(w > 0 ? w : 1);
        const height = Math.ceil(h > 0 ? h : 1);

        const gl = this._webGLContext;
        const texture = gl.createTexture();
        this.resizeTexture(texture, width, height);
        this.setTextureParams(gl, false);

        return texture;
    }

    public resizeTexture(texture: any, width: number, height: number) {
        if (!texture || texture.width === width && texture.height === height){ return; }

        const gl = this._webGLContext;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            gl.TEXTURE_2D,				// target
            0,							// level of detail
            gl.RGBA,					// internal format
            width, height, 0,			// width, height, border (only for array/null sourced textures)
            gl.RGBA,					// format (match internal format)
            gl.UNSIGNED_BYTE,			// type of texture(pixel color depth)
            null						// image data, we can do null because we're doing array data
        );

        // set its width and height for spoofing as an image and tracking
        texture.width = width;
        texture.height = height;
    }

    public getRenderBufferTexture(w: number, h: number): WebGLTexture|undefined {
        const gl = this._webGLContext;

        const renderTexture = this.getBaseTexture(w, h);
        if (!renderTexture) { return; }

        const frameBuffer = gl.createFramebuffer();
        if (!frameBuffer) { return; }

        // set its width and height for spoofing as an image and tracking
        renderTexture.width = w;
        renderTexture.height = h;

        // attach frame buffer to texture and provide cross links to look up each other
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderTexture, 0);
        frameBuffer._renderTexture = renderTexture;
        renderTexture._frameBuffer = frameBuffer;

        // these keep track of themselves simply to reduce complexity of some lookup code
        renderTexture._storeID = this._textureDictionary.length;
        this._textureDictionary[renderTexture._storeID] = renderTexture;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return renderTexture;
    }

    public setTextureParams(gl: WebGLRenderingContext, isPOT: boolean = false) {
        if (isPOT && this._antialias) {
            //non POT linear works in some devices, but performance is NOT good, investigate
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        } else {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    public setClearColor(color: string|number = 0x00000000) {
        this._clearColor = StageGL.colorToObj(color);
    }

    public toDataURL(backgroundColor: string = 'rgba(0,0,0,0)', mimeType: string = "image/png", encoderOptions: number = 0.92): string|undefined {
        let dataURL;
        const gl = this._webGLContext;
        this.batchReason = "dataURL";
        const clearBackup = this._clearColor;

        if (!this.canvas) { return; }
        if (!StageGL.isWebGLActive(gl)) {
            return this.toDataURL(backgroundColor, mimeType, encoderOptions);
        }

        // if the buffer is preserved and we don't want a background we can just output what we have, otherwise we'll have to render it
        if(!this._preserveBuffer || backgroundColor !== undefined) {
            // render it onto the right background
            if(backgroundColor !== undefined) {
                this._clearColor = StageGL.colorToObj(backgroundColor);
            }
            this.clear();
            // if we're not using directDraw then we can just trust the last buffer content
            if(!this._directDraw) {
                this._drawCover(null, this._bufferTextureOutput);
            } else {
                console.log("No stored/useable gl render info, result may be incorrect if content was changed since render");
                this.draw(gl);
            }
        }

        // create the dataurl
        dataURL = this.canvas.toDataURL(mimeType||"image/png", encoderOptions);

        // reset the picture in the canvas
        if(!this._preserveBuffer || backgroundColor !== undefined) {
            if(backgroundColor !== undefined) {
                this._clearColor = clearBackup;
            }
            this.clear();
            if(!this._directDraw) {
                this._drawCover(null, this._bufferTextureOutput);
            } else {
                this.draw(gl);
            }
        }

        return dataURL;
    }

    public toString(): string {
        return `[StageGL (name=${this.name})]`;
    }

    private _updateDrawingSurface(w: number, h: number) {
        this._viewportWidth = w;
        this._viewportHeight = h;

        this._webGLContext.viewport(0, 0, this._viewportWidth, this._viewportHeight);

        // WebGL works with a -1,1 space on its screen. It also follows Y-Up
        // we need to flip the y, scale and then translate the co-ordinates to match this
        // additionally we offset into they Y so the polygons are inside the camera's "clipping" plane
        this._projectionMatrix = new Float32Array([
            2 / w,		0,			0,			0,
            0,			-2 / h,		0,			0,
            0,			0,			1,			0,
            -1,			1,			0,			1
        ]);
    }

    private _getSafeTexture(w: number = 1, h: number = 1) {
        let texture = this.getBaseTexture(w, h);

        if (!texture) {
            const msg = "Problem creating texture, possible cause: using too much VRAM, please try releasing texture memory";
            console.error ? console.error(msg) : console.log(msg);

            texture = this._baseTextures[0];
        }

        return texture;
    }

    private _clearFrameBuffer(alpha: number) {
        const gl = this._webGLContext;
        const cc = this._clearColor;

        if (alpha > 0) { alpha = 1; }
        if (alpha < 0) { alpha = 0; }

        // Use WebGL settings; adjust for pre multiplied alpha appropriate to scenario
        gl.clearColor(cc.r * alpha, cc.g * alpha, cc.b * alpha, alpha);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.clearColor(0, 0, 0, 0);
    }

    private _fetchWebGLContext(canvas: any, options: any): WebGLRenderingContext {
        let gl;

        try {
            gl = canvas.getContext("webgl", options) || canvas.getContext("experimental-webgl", options);
        } catch (e) {
            // don't do anything in catch, null check will handle it
        }

        if (!gl) {
            const msg = "Could not initialize WebGL";
            console.error?console.error(msg):console.log(msg);
        } else {
            gl.viewportWidth = canvas.width;
            gl.viewportHeight = canvas.height;
        }

        return gl;
    }

    private _fetchShaderProgram(coverShader: boolean, customVTX?: string, customFRAG?: string, shaderParamSetup?: Function): WebGLProgram {
        const gl = this._webGLContext;

        gl.useProgram(null);		// safety to avoid collisions

        // build the correct shader string out of the right headers and bodies
        let targetFrag, targetVtx;
        if (coverShader) {
            targetVtx = StageGL.COVER_VERTEX_HEADER + (customVTX || StageGL.COVER_VERTEX_BODY);
            targetFrag = StageGL.COVER_FRAGMENT_HEADER + (customFRAG || StageGL.COVER_FRAGMENT_BODY);
        } else {
            targetVtx = StageGL.REGULAR_VERTEX_HEADER + (customVTX || StageGL.REGULAR_VERTEX_BODY);
            targetFrag = StageGL.REGULAR_FRAGMENT_HEADER + (customFRAG || StageGL.REGULAR_FRAGMENT_BODY);
        }

        // create the separate vars
        const vertexShader = this._createShader(gl, gl.VERTEX_SHADER, targetVtx);
        const fragmentShader = this._createShader(gl, gl.FRAGMENT_SHADER, targetFrag);

        // link them together
        const shaderProgram = gl.createProgram();
        gl.attachShader(shaderProgram, vertexShader);
        gl.attachShader(shaderProgram, fragmentShader);
        gl.linkProgram(shaderProgram);

        // check compile status
        if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
            gl.useProgram(this._activeShader);
            throw gl.getProgramInfoLog(shaderProgram);
        }

        // set up the parameters on the shader
        gl.useProgram(shaderProgram);

        // get the places in memory the shader is stored so we can feed information into them
        // then save it off on the shader because it's so tied to the shader itself
        shaderProgram.positionAttribute = gl.getAttribLocation(shaderProgram, "vertexPosition");
        gl.enableVertexAttribArray(shaderProgram.positionAttribute);

        shaderProgram.uvPositionAttribute = gl.getAttribLocation(shaderProgram, "uvPosition");
        gl.enableVertexAttribArray(shaderProgram.uvPositionAttribute);

        if (coverShader) {
            shaderProgram.samplerUniform = gl.getUniformLocation(shaderProgram, "uSampler");
            gl.uniform1i(shaderProgram.samplerUniform, 0);

            // if there's some custom attributes be sure to hook them up
            if (shaderParamSetup) {
                shaderParamSetup(gl, this, shaderProgram);
            }
        } else {
            shaderProgram.textureIndexAttribute = gl.getAttribLocation(shaderProgram, "textureIndex");
            gl.enableVertexAttribArray(shaderProgram.textureIndexAttribute);

            shaderProgram.alphaAttribute = gl.getAttribLocation(shaderProgram, "objectAlpha");
            gl.enableVertexAttribArray(shaderProgram.alphaAttribute);

            const samplers = [];
            for (let i = 0; i < this._gpuTextureCount; i++) {
                samplers[i] = i;
            }
            shaderProgram.samplerData = samplers;

            shaderProgram.samplerUniform = gl.getUniformLocation(shaderProgram, "uSampler");
            gl.uniform1iv(shaderProgram.samplerUniform, shaderProgram.samplerData);

            shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "pMatrix");
        }

        shaderProgram._type = coverShader ? "cover" : "batch";

        gl.useProgram(this._activeShader);
        return shaderProgram;
    }

    private _createShader(gl: WebGLRenderingContext, type: number, str: string): WebGLShader|undefined {
        const textureCount = this._batchTextureCount;

        // inject the static number
        str = str.replace(/\{\{count}}/g, `${textureCount}`);

        if (type === gl.FRAGMENT_SHADER) {
            // resolve issue with no dynamic samplers by creating correct samplers in if else chain
            // TODO: WebGL 2.0 does not need this support
            let insert = "";
            for (let i = 1; i<textureCount; i++) {
                insert += "} else if (indexPicker <= "+ i +".5) { color = texture2D(uSampler["+ i +"], vTextureCoord);";
            }
            str = str.replace(/\{\{alternates}}/g, insert);
        }

        // actually compile the shader
        const shader = gl.createShader(type);
        if (!shader) return;

        gl.shaderSource(shader, str);
        gl.compileShader(shader);

        // check compile status
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw gl.getShaderInfoLog(shader);
        }

        return shader;
    }

    private _createBuffers() {
        const gl = this._webGLContext;
        let groupCount = this._maxBatchVertexCount;
        let groupSize, i, l, atrBuffer;

        // TODO benchmark and test using unified main buffer

        // regular
        let config: {[k: string]: any} = this._attributeConfig["default"] = {};

        groupSize = 2;
        const vertices = new Float32Array(groupCount * groupSize);
        for (i=0, l=vertices.length; i<l; i+=groupSize) { vertices[i] = vertices[i+1] = 0.0; }
        atrBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, atrBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
        config["position"] = { array: vertices,
            buffer: atrBuffer, type: gl.FLOAT, spacing: groupSize, stride: 0, offset: 0, offB: 0, size: groupSize
        };

        groupSize = 2;
        const uvs = new Float32Array(groupCount * groupSize);
        for (i=0, l=uvs.length; i<l; i+=groupSize) { uvs[i] = uvs[i+1] = 0.0; }
        atrBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, atrBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.DYNAMIC_DRAW);
        config["uv"] = { array: uvs,
            buffer: atrBuffer, type: gl.FLOAT, spacing: groupSize, stride: 0, offset: 0, offB: 0, size: groupSize
        };

        groupSize = 1;
        const indices = new Float32Array(groupCount * groupSize);
        for (i=0, l=indices.length; i<l; i++) { indices[i] = 0.0; }
        atrBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, atrBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);
        config["texture"] = { array: indices,
            buffer: atrBuffer, type: gl.FLOAT, spacing: groupSize, stride: 0, offset: 0, offB: 0, size: groupSize
        };

        groupSize = 1;
        const alphas = new Float32Array(groupCount * groupSize);
        for (i=0, l=alphas.length; i<l; i++) { alphas[i] = 1.0; }
        atrBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, atrBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, alphas, gl.DYNAMIC_DRAW);
        config["alpha"] = { array: alphas,
            buffer: atrBuffer, type: gl.FLOAT, spacing: groupSize, stride: 0, offset: 0, offB: 0, size: groupSize
        };

        // micro
        config = this._attributeConfig["micro"] = {};
        groupCount = 5; // we probably do not need this much space, but it's safer and barely more expensive
        groupSize = 2 + 2 + 1 + 1;
        const stride = groupSize * 4; // they're all floats, so 4 bytes each

        const microArray = new Float32Array(groupCount * groupSize);
        for (i=0, l=microArray.length; i<l; i+=groupSize) {
            microArray[i]   = microArray[i+1] = 0.0; // vertex
            microArray[i+1] = microArray[i+2] = 0.0; // uv
            microArray[i+3] = 0.0;                   // texture
            microArray[i+4] = 1.0;                   // alpha
        }
        atrBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, atrBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, microArray, gl.DYNAMIC_DRAW);

        config["position"] = {
            array: microArray, buffer: atrBuffer, type: gl.FLOAT, spacing: groupSize, stride: stride,
            offset: 0, offB: 0, size: 2
        };
        config["uv"] = {
            array: microArray, buffer: atrBuffer, type: gl.FLOAT, spacing: groupSize, stride: stride,
            offset: 2, offB: 2*4, size: 2
        };
        config["texture"] = {
            array: microArray, buffer: atrBuffer, type: gl.FLOAT, spacing: groupSize, stride: stride,
            offset: 4, offB: 4*4, size: 1
        };
        config["alpha"] = {
            array: microArray, buffer: atrBuffer, type: gl.FLOAT, spacing: groupSize, stride: stride,
            offset: 5, offB: 5*4, size: 1
        };

        // defaults
        this._activeConfig = this._attributeConfig["default"];
    }

    private _initMaterials() {
        const gl = this._webGLContext;

        // reset counters
        this._lastTextureInsert = -1;

        // clear containers
        this._textureDictionary = [];
        this._textureIDs = {};
        this._baseTextures = [];
        this._batchTextures = [];

        this._gpuTextureCount = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS); // this is what we can draw with
        this._gpuTextureMax = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS); // this could be higher

        this._batchTextureCount = this._gpuTextureCount;
        let success = false;
        while (!success) {
            try {
                this._activeShader = this._fetchShaderProgram(false);
                success = true;
            } catch(e) {
                if (this._batchTextureCount <= 1) { throw "Cannot compile shader " + e; }
                this._batchTextureCount = (this._batchTextureCount / 2)|0;

                if (this.vocalDebug) {
                    console.log("Reducing possible texture count due to errors: " + this._batchTextureCount);
                }
            }
        }

        this._mainShader = this._activeShader;
        this._mainShader ? (this._mainShader as any)._name = "main" : "";

        // fill in blanks as it helps the renderer be stable while textures are loading and reduces need for safety code
        const texture = this.getBaseTexture();
        if (!texture) {
            throw "Problems creating basic textures, known causes include using too much VRAM by not releasing WebGL texture instances";
        } else {
            texture._storeID = -1;
        }
        for (var i=0; i<this._batchTextureCount; i++) {
            this._baseTextures[i] = this._batchTextures[i] = texture;
        }
    }

    private _loadTextureImage(gl: WebGLRenderingContext, image: any /*Image|Canvas*/): WebGLTexture|undefined {
        let srcPath, texture, msg;
        if ((image instanceof Image || image instanceof HTMLImageElement) && image.src) {
            srcPath = image.src;
        } else if (image instanceof HTMLCanvasElement) {
            (image as any)._isCanvas = true; //canvases are already loaded and assumed unique so note that
            srcPath = "canvas_" + (++this._lastTrackedCanvas);
        } else {
            msg = "Invalid image provided as source. Please ensure source is a correct DOM element.";
            console.error ? console.error(msg, image) : console.log(msg, image);
            return;
        }

        // create the texture lookup and texture
        let storeID = this._textureIDs[srcPath];
        if (storeID === undefined) {
            this._textureIDs[srcPath] = storeID = this._textureDictionary.length;
            (image as any)._storeID = storeID;
            (image as any)._invalid = true;
            texture = this._getSafeTexture();
            this._textureDictionary[storeID] = texture;
        } else {
            (image as any)._storeID = storeID;
            texture = this._textureDictionary[storeID];
        }

        // allow the texture to track its references for cleanup, if it's not an error ref
        if (texture._storeID !== -1) {
            texture._storeID = storeID;
            if (texture._imageData) {
                texture._imageData.push(image);
            } else {
                texture._imageData = [image];
            }
        }

        // insert texture into batch
        this._insertTextureInBatch(gl, texture);

        return texture;
    }

    private _updateTextureImageData(gl: WebGLRenderingContext, image: any /*Image|Canvas*/) {
        // the image isn't loaded and isn't ready to be updated, because we don't set the invalid flag we should try again later
        if (!(image.complete || image._isCanvas || image.naturalWidth)) {
            return;
        }

        // the bitwise & is intentional, cheap exponent 2 check
        const isNPOT = (image.width & image.width-1) || (image.height & image.height-1);
        const texture = this._textureDictionary[image._storeID];

        gl.activeTexture(gl.TEXTURE0 + texture._activeIndex);
        gl.bindTexture(gl.TEXTURE_2D, texture);

        texture.isPOT = !isNPOT;
        this.setTextureParams(gl, texture.isPOT);

        try {
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        } catch(e) {
            const errString = "\nAn error has occurred. This is most likely due to security restrictions on WebGL images with local or cross-domain origins";
            if (console.error) {
                //TODO: LM: I recommend putting this into a log function internally, since you do it so often, and each is implemented differently.
                console.error(errString);
                console.error(e);
            } else if (console) {
                console.log(errString);
                console.log(e);
            }
        }
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

        if (image._invalid !== undefined) { image._invalid = false; } // only adjust what is tracking this data

        texture.width = image.width;
        texture.height = image.height;

        if (this.vocalDebug) {
            if (isNPOT && this._antialias) {
                console.warn("NPOT(Non Power of Two) Texture with context.antialias true: "+ image.src);
            }
            if (image.width > gl.MAX_TEXTURE_SIZE || image.height > gl.MAX_TEXTURE_SIZE){
                console && console.error("Oversized Texture: "+ image.width+"x"+image.height +" vs "+ gl.MAX_TEXTURE_SIZE +"max");
            }
        }
    }

    private _insertTextureInBatch(gl: WebGLRenderingContext, texture: _WebGLTexture) {
        let image;
        if (this._batchTextures[texture._activeIndex] !== texture) {	// if it wasn't used last batch
            // we've got to find it a a spot.
            let found = -1;
            const start = (this._lastTextureInsert+1) % this._batchTextureCount;
            let look = start;
            do {
                if (this._batchTextures[look]._batchID !== this._batchID && !this._slotBlacklist[look]) {
                    found = look;
                    break;
                }
                look = (look+1) % this._batchTextureCount;
            } while (look !== start);

            // we couldn't find anywhere for it go, meaning we're maxed out
            if (found === -1) {
                this.batchReason = "textureOverflow";
                this._renderBatch();		// <------------------------------------------------------------------------
                found = start; //TODO: how do we optimize this to be smarter?
            }

            // lets put it into that spot
            this._batchTextures[found] = texture;
            texture._activeIndex = found;
            image = texture._imageData && texture._imageData[0]; // first come first served, potentially problematic
            if (image && ((image._invalid === undefined && image._isCanvas) || image._invalid)) {
                this._updateTextureImageData(gl, image);
            } else {
                // probably redundant, confirm functionality then remove from codebase
                //gl.activeTexture(gl.TEXTURE0 + found);
                //gl.bindTexture(gl.TEXTURE_2D, texture);
                //this.setTextureParams(gl);
            }
            this._lastTextureInsert = found;

        } else if (texture._drawID !== this._drawID) {	// being active from previous draws doesn't mean up to date
            image = texture._imageData && texture._imageData[0];
            if (image && ((image._invalid === undefined && image._isCanvas) || image._invalid)) {
                this._updateTextureImageData(gl, image);
            }
        }

        texture._drawID = this._drawID;
        texture._batchID = this._batchID;
    }

    private _killTextureObject(texture: _WebGLTexture) {
        if (!texture) { return; }
        const gl = this._webGLContext;

        // remove linkage
        if (texture._storeID !== undefined && texture._storeID >= 0) {
            this._textureDictionary[texture._storeID] = undefined;
            for (var n in this._textureIDs) {
                if (this._textureIDs[n] === texture._storeID) { delete this._textureIDs[n]; }
            }
            var data = texture._imageData;
            if (data) {
                for (var i=data.length-1; i>=0; i--) { data[i]._storeID = undefined; }
            }
            texture._imageData = texture._storeID = undefined;
        }

        // make sure to drop it out of an active slot
        if (texture._activeIndex !== undefined && this._batchTextures[texture._activeIndex] === texture) {
            this._batchTextures[texture._activeIndex] = this._baseTextures[texture._activeIndex];
        }

        // remove buffers if present
        try {
            if (texture._frameBuffer) { gl.deleteFramebuffer(texture._frameBuffer); }
            texture._frameBuffer = undefined;
        } catch(e) {
            /* suppress delete errors because it's already gone or didn't need deleting probably */
            if (this.vocalDebug) { console.log(e); }
        }

        // remove entry
        try {
            gl.deleteTexture(texture);
        } catch(e) {
            /* suppress delete errors because it's already gone or didn't need deleting probably */
            if (this.vocalDebug) { console.log(e); }
        }
    }

    /**
     * Small utility function to keep internal API consistent and set the uniforms for a dual texture cover render
     **/
    private _setCoverMixShaderParams(gl: WebGLRenderingContext, stage: never, shaderProgram: never) {
        gl.uniform1i(
            gl.getUniformLocation(shaderProgram, "uMixSampler"),
            1
        );
    }

    private _updateRenderMode(newMode: string) {
        if ( newMode === null || newMode === undefined){ newMode = "source-over"; }

        let blendSrc = StageGL.BLEND_SOURCES[newMode];
        if (blendSrc === undefined) {
            if (this.vocalDebug){ console.log("Unknown compositeOperation ["+ newMode +"], reverting to default"); }
            blendSrc = StageGL.BLEND_SOURCES[newMode = "source-over"];
        }

        if (this._renderMode === newMode) { return; }

        const gl = this._webGLContext;
        let shaderData = this._builtShaders[newMode];
        if (shaderData === undefined) {
            try {
                shaderData = this._builtShaders[newMode] = {
                    eqRGB: gl[blendSrc.eqRGB || "FUNC_ADD"],
                    srcRGB: gl[blendSrc.srcRGB || "ONE"],
                    dstRGB: gl[blendSrc.dstRGB || "ONE_MINUS_SRC_ALPHA"],
                    eqA: gl[blendSrc.eqA || "FUNC_ADD"],
                    srcA: gl[blendSrc.srcA || "ONE"],
                    dstA: gl[blendSrc.dstA || "ONE_MINUS_SRC_ALPHA"],
                    immediate: blendSrc.shader !== undefined,
                    shader: (blendSrc.shader || this._builtShaders["source-over"] === undefined) ?
                        this._fetchShaderProgram(
                            true, undefined, blendSrc.shader,
                            this._setCoverMixShaderParams
                        ) : this._builtShaders["source-over"].shader // re-use source-over when we don't need a new shader
                };
                if (blendSrc.shader) { shaderData.shader._name = newMode; }
            } catch (e) {
                this._builtShaders[newMode] = undefined;
                console && console.log("SHADER SWITCH FAILURE", e);
                return;
            }
        }

        if (shaderData.immediate) {
            if (this._directDraw) {
                if (this.vocalDebug) { console.log("Illegal compositeOperation ["+ newMode +"] due to StageGL.directDraw = true, reverting to default"); }
                return;
            }
            this._activeConfig = this._attributeConfig["micro"];
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._batchTextureOutput ? (this._batchTextureOutput as any)._frameBuffer : null);

        this.batchReason = "shaderSwap";
        this._renderBatch();		// <--------------------------------------------------------------------------------

        this._renderMode = newMode;
        this._immediateRender = shaderData.immediate;
        gl.blendEquationSeparate(shaderData.eqRGB, shaderData.eqA);
        gl.blendFuncSeparate(shaderData.srcRGB, shaderData.dstRGB, shaderData.srcA, shaderData.dstA);
    }

    private _drawContent(content: Stage|Container, ignoreCache?: boolean) {
        const gl = this._webGLContext;

        this._activeShader = this._mainShader;

        const frameBuffer = this._batchTextureOutput ? (this._batchTextureOutput as any)._frameBuffer : null;
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
        if(frameBuffer !== null) {
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        this._appendToBatch(content, Matrix2D.identity(), this.alpha, ignoreCache);

        this.batchReason = "contentEnd";
        this._renderBatch();
    }

    private _drawCover(out?: WebGLFramebuffer|null, dst?: WebGLTexture|null, srcFilter?: WebGLTexture) {
        const gl = this._webGLContext;

        gl.bindFramebuffer(gl.FRAMEBUFFER, out);
        if (out !== null){ gl.clear(gl.COLOR_BUFFER_BIT); }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, dst);
        this.setTextureParams(gl);

        if (srcFilter instanceof Filter) {
            this._activeShader = this.getFilterShader(srcFilter);
        } else {
            if (srcFilter instanceof WebGLTexture) {
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, srcFilter);
                this.setTextureParams(gl);
            } else if (srcFilter !== undefined && this.vocalDebug) {
                console.log("Unknown data handed to function: ", srcFilter);
            }
            this._activeShader = this._builtShaders[this._renderMode].shader;
        }

        this._renderCover();
    }

    private _alignTargetToCache(target: DisplayObject, manager: BitmapCache): Matrix2D {
        if (manager._counterMatrix === null) {
            manager._counterMatrix = target.getMatrix();
        } else {
            target.getMatrix(manager._counterMatrix);
        }

        let mtx = manager._counterMatrix || Matrix2D.identity();
        mtx.scale(1/manager.scale, 1/manager.scale);
        mtx = mtx.invert();
        mtx.translate(-manager.offX/manager.scale*target.scaleX, -manager.offY/manager.scale*target.scaleY);

        return mtx;
    }

    private _appendToBatch(container: Container, concatMtx: Matrix2D, concatAlpha: number, ignoreCache: boolean = false) {
        const gl = this._webGLContext;

        // sub components of figuring out the position an object holds
        let subL = 0, subT = 0, subR = 0, subB = 0;

        // sort out shared properties
        const cMtx = container._glMtx;
        cMtx.copy(concatMtx);
        if (container.transformMatrix) {
            cMtx.appendMatrix(container.transformMatrix);
        } else {
            cMtx.appendTransform(
                container.x, container.y,
                container.scaleX, container.scaleY,
                container.rotation, container.skewX, container.skewY,
                container.regX, container.regY
            );
        }

        const previousRenderMode = this._renderMode;
        if (container.compositeOperation) {
            this._updateRenderMode(container.compositeOperation);
        }

        // actually apply its data to the buffers
        const l = container.children.length;
        for (let i = 0; i < l; i++) {
            const item = container.children[i];
            let useCache = (!ignoreCache && item.cacheCanvas) || false;

            if (!(item.visible && concatAlpha > 0.0035)) { continue; }
            const itemAlpha = item.alpha;

            if (useCache === false) {
                if (item._updateState){
                    item._updateState();
                }

                if(!this._directDraw && (!ignoreCache && item.cacheCanvas === null && item.filters && item.filters.length)) {
                    let bounds;
                    if (item.bitmapCache === null) {
                        bounds = item.bounds;
                        item.bitmapCache = new BitmapCache();
                        item.bitmapCache._autoGenerated = true;
                    }
                    if (item.bitmapCache && item.bitmapCache._autoGenerated) {
                        this.batchReason = "cachelessFilterInterupt";
                        this._renderBatch();					// <----------------------------------------------------

                        item.alpha = 1;
                        const shaderBackup = this._activeShader;
                        bounds = bounds || item.bounds;
                        item.bitmapCache.define(item, bounds!.x, bounds!.y, bounds!.width, bounds!.height, 1, {useGL:this});
                        useCache = item.bitmapCache._cacheCanvas;

                        item.alpha = itemAlpha;
                        this._activeShader = shaderBackup;
                        const frameBuffer =  this._batchTextureOutput ? (this._batchTextureOutput as any)._frameBuffer : null;
                        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
                    }
                }
            }

            if (useCache === false && (item as Container).children) {
                this._appendToBatch((item as Container), cMtx, itemAlpha * concatAlpha);
                continue;
            }

            const containerRenderMode = this._renderMode;
            if (item.compositeOperation) {
                this._updateRenderMode(item.compositeOperation);
            }

            // check for overflowing batch, if yes then force a render
            if (this._batchVertexCount + StageGL.INDICES_PER_CARD > this._maxBatchVertexCount) {
                this.batchReason = "vertexOverflow";
                this._renderBatch();					// <------------------------------------------------------------
            }

            // keep track of concatenated position
            const iMtx = item._glMtx;
            iMtx.copy(cMtx);
            if (item.transformMatrix) {
                iMtx.appendMatrix(item.transformMatrix);
            } else {
                iMtx.appendTransform(
                    item.x, item.y,
                    item.scaleX, item.scaleY,
                    item.rotation, item.skewX, item.skewY,
                    item.regX, item.regY
                );
            }

            let uvRect, texIndex, image, frame, texture, src;

            // get the image data, or abort if not present
            // BITMAP / Cached Canvas
            if (item._webGLRenderStyle === 2 || useCache !== false) {
                const bitmap = item as Bitmap;
                image = useCache === false ? bitmap.image : useCache;

                // SPRITE
            } else if (item._webGLRenderStyle === 1) {
                const sprite = item as Sprite;
                frame = sprite.spriteSheet!.getFrame(sprite.currentFrame);
                if (frame === null) { continue; }
                image = frame.image;

                // MISC (DOM objects render themselves later)
            } else {
                continue;
            }
            if (!image) { continue; }

            // calculate texture
            if (image._storeID === undefined) {
                // this texture is new to us so load it and add it to the batch
                texture = this._loadTextureImage(gl, image);
            } else {
                // fetch the texture (render textures know how to look themselves up to simplify this logic)
                texture = this._textureDictionary[image._storeID];

                if (!texture){ //TODO: this should really not occur but has due to bugs, hopefully this can be removed eventually
                    if (this.vocalDebug){ console.log("Image source should not be lookup a non existent texture, please report a bug."); }
                    continue;
                }

                // put it in the batch if needed
                if (texture._batchID !== this._batchID) {
                    this._insertTextureInBatch(gl, texture);
                }
            }
            texIndex = texture._activeIndex;
            image._drawID = this._drawID;

            // BITMAP / Cached Canvas
            if (item._webGLRenderStyle === 2 || useCache !== false) {
                const bitmap = item as Bitmap;
                if (useCache === false && bitmap.sourceRect) {
                    // calculate uvs
                    if (!bitmap._uvRect) { bitmap._uvRect = {}; }
                    src = bitmap.sourceRect;
                    uvRect = bitmap._uvRect;
                    uvRect.t = 1 - ((src.y)/image.height);
                    uvRect.l = (src.x)/image.width;
                    uvRect.b = 1 - ((src.y + src.height)/image.height);
                    uvRect.r = (src.x + src.width)/image.width;

                    // calculate vertices
                    subL = 0;							subT = 0;
                    subR = src.width+subL;				subB = src.height+subT;
                } else {
                    // calculate uvs
                    uvRect = StageGL.UV_RECT;
                    // calculate vertices
                    if (useCache === false) {
                        subL = 0;						subT = 0;
                        subR = image.width+subL;		subB = image.height+subT;
                    } else {
                        src = item.bitmapCache;
                        subL = src!.x+(src!._filterOffX/src!.scale);	subT = src!.y+(src!._filterOffY/src!.scale);
                        subR = (src!._drawWidth/src!.scale)+subL;		subB = (src!._drawHeight/src!.scale)+subT;
                    }
                }

                // SPRITE
            } else if (item._webGLRenderStyle === 1) {
                const sprite = item as Sprite;
                const rect = frame.rect;

                // calculate uvs
                uvRect = frame.uvRect;
                if (!uvRect) {
                    uvRect = StageGL.buildUVRects(sprite.spriteSheet, sprite.currentFrame, false);
                }

                // calculate vertices
                subL = -frame.regX;								subT = -frame.regY;
                subR = rect.width-frame.regX;					subB = rect.height-frame.regY;
            }

            let spacing = 0;
            const cfg =  this._activeConfig;
            const vpos = cfg.position.array;
            const uvs = cfg.uv.array;
            const texI = cfg.texture.array;
            const alphas = cfg.alpha.array;

            // apply vertices
            spacing = cfg!.position!.spacing;
            let vtxOff = this._batchVertexCount * spacing + cfg.position.offset;
            vpos[vtxOff] = subL*iMtx.a + subT*iMtx.c + iMtx.tx;    vpos[vtxOff+1] = subL*iMtx.b + subT*iMtx.d + iMtx.ty;
            vtxOff += spacing;
            vpos[vtxOff] = subL*iMtx.a + subB*iMtx.c + iMtx.tx;    vpos[vtxOff+1] = subL*iMtx.b + subB*iMtx.d + iMtx.ty;
            vtxOff += spacing;
            vpos[vtxOff] = subR*iMtx.a + subT*iMtx.c + iMtx.tx;    vpos[vtxOff+1] = subR*iMtx.b + subT*iMtx.d + iMtx.ty;
            vtxOff += spacing;
            vpos[vtxOff] = subL*iMtx.a + subB*iMtx.c + iMtx.tx;    vpos[vtxOff+1] = subL*iMtx.b + subB*iMtx.d + iMtx.ty;
            vtxOff += spacing;
            vpos[vtxOff] = subR*iMtx.a + subT*iMtx.c + iMtx.tx;    vpos[vtxOff+1] = subR*iMtx.b + subT*iMtx.d + iMtx.ty;
            vtxOff += spacing;
            vpos[vtxOff] = subR*iMtx.a + subB*iMtx.c + iMtx.tx;    vpos[vtxOff+1] = subR*iMtx.b + subB*iMtx.d + iMtx.ty;

            // apply uvs
            spacing = cfg.uv.spacing;
            var uvOff = this._batchVertexCount * spacing + cfg.uv.offset;
            uvs[uvOff] = uvRect.l;        uvs[uvOff+1] = uvRect.t;
            uvOff += spacing;
            uvs[uvOff] = uvRect.l;        uvs[uvOff+1] = uvRect.b;
            uvOff += spacing;
            uvs[uvOff] = uvRect.r;        uvs[uvOff+1] = uvRect.t;
            uvOff += spacing;
            uvs[uvOff] = uvRect.l;        uvs[uvOff+1] = uvRect.b;
            uvOff += spacing;
            uvs[uvOff] = uvRect.r;        uvs[uvOff+1] = uvRect.t;
            uvOff += spacing;
            uvs[uvOff] = uvRect.r;        uvs[uvOff+1] = uvRect.b;

            // apply texture
            spacing = cfg.texture.spacing;
            var texOff = this._batchVertexCount * spacing + cfg.texture.offset;
            texI[texOff] = texIndex;
            texOff += spacing;
            texI[texOff] = texIndex;
            texOff += spacing;
            texI[texOff] = texIndex;
            texOff += spacing;
            texI[texOff] = texIndex;
            texOff += spacing;
            texI[texOff] = texIndex;
            texOff += spacing;
            texI[texOff] = texIndex;

            // apply alpha
            spacing = cfg.alpha.spacing;
            var aOff = this._batchVertexCount * spacing + cfg.alpha.offset;
            alphas[aOff] = itemAlpha * concatAlpha;
            aOff += spacing;
            alphas[aOff] = itemAlpha * concatAlpha;
            aOff += spacing;
            alphas[aOff] = itemAlpha * concatAlpha;
            aOff += spacing;
            alphas[aOff] = itemAlpha * concatAlpha;
            aOff += spacing;
            alphas[aOff] = itemAlpha * concatAlpha;
            aOff += spacing;
            alphas[aOff] = itemAlpha * concatAlpha;

            this._batchVertexCount += StageGL.INDICES_PER_CARD;

            if (this._immediateRender) {
                this._activeConfig = this._attributeConfig["default"];
                this._immediateBatchRender();
            }

            if (this._renderMode !== containerRenderMode) {
                this._updateRenderMode(containerRenderMode);
            }
        }

        if (this._renderMode !== previousRenderMode) {
            this._updateRenderMode(previousRenderMode);
        }
    }

    /**
     * The shader or effect needs to be drawn immediately, sub function of `_appendToBatch`
     **/
    private _immediateBatchRender() {
        var gl = this._webGLContext;

        if (this._batchTextureConcat === null){
            this._batchTextureConcat = this.getRenderBufferTexture(this._viewportWidth, this._viewportHeight);
        } else {
            this.resizeTexture(this._batchTextureConcat, this._viewportWidth, this._viewportHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, (this._batchTextureConcat as any)._frameBuffer);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        if (this._batchTextureTemp === null){
            this._batchTextureTemp = this.getRenderBufferTexture(this._viewportWidth, this._viewportHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, (this._batchTextureTemp as any)._frameBuffer);
        } else {
            this.resizeTexture(this._batchTextureTemp, this._viewportWidth, this._viewportHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, (this._batchTextureTemp as any)._frameBuffer);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        const swap = this._batchTextureOutput;
        this._batchTextureOutput = this._batchTextureConcat;
        this._batchTextureConcat = swap;

        this._activeShader = this._mainShader;
        this.batchReason = "immediatePrep";
        this._renderBatch();//<-----------------------------------------------------------------------------------------

        this.batchReason = "immediateResults";
        this._drawCover((this._batchTextureOutput as any)._frameBuffer, this._batchTextureConcat, this._batchTextureTemp);

        gl.bindFramebuffer(gl.FRAMEBUFFER, (this._batchTextureOutput as any)._frameBuffer);
    }

    /**
     * Draws all the currently defined cards in the buffer to the render surface.
     **/
    _renderBatch() {
        if (this._batchVertexCount <= 0) { return; }	// prevents error logs on stages filled with un-renederable content.
        const gl = this._webGLContext;
        this._renderPerDraw++;

        if (this.vocalDebug) {
            console.log("Batch["+ this._drawID +":"+ this._batchID +"] : "+ this.batchReason);
        }
        const shaderProgram = this._activeShader as any;
        const config = this._activeConfig;
        let pc;

        gl.useProgram(shaderProgram);

        pc = config.position;
        gl.bindBuffer(gl.ARRAY_BUFFER, pc.buffer);
        gl.vertexAttribPointer(shaderProgram.positionAttribute, pc.size, pc.type, false, pc.stride, pc.offB);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, pc.array);

        pc = config.texture;
        gl.bindBuffer(gl.ARRAY_BUFFER, pc.buffer);
        gl.vertexAttribPointer(shaderProgram.textureIndexAttribute, pc.size, pc.type, false, pc.stride, pc.offB);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, pc.array);

        pc = config.uv;
        gl.bindBuffer(gl.ARRAY_BUFFER, pc.buffer);
        gl.vertexAttribPointer(shaderProgram.uvPositionAttribute, pc.size, pc.type, false, pc.stride, pc.offB);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, pc.array);

        pc = config.alpha;
        gl.bindBuffer(gl.ARRAY_BUFFER, pc.buffer);
        gl.vertexAttribPointer(shaderProgram.alphaAttribute, pc.size, pc.type, false, pc.stride, pc.offB);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, pc.array);

        gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, gl.FALSE, this._projectionMatrix);

        for (var i = 0; i < this._batchTextureCount; i++) {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, this._batchTextures[i]);
        }

        gl.drawArrays(gl.TRIANGLES, 0, this._batchVertexCount);

        this._batchVertexCount = 0;
        this._batchID++;
    }

    /**
     * Draws a card that covers the entire render surface. Mainly used for filters and composite operations.
     **/
    public _renderCover() {
        const gl = this._webGLContext;
        this._renderPerDraw++;

        if (this.vocalDebug) {
            console.log("Cover["+ this._drawID +":"+ this._batchID +"] : "+ this.batchReason);
        }
        const shaderProgram = this._activeShader as any;
        const config = this._attributeConfig.default;
        let pc;

        gl.useProgram(shaderProgram);

        pc = config.position;
        gl.bindBuffer(gl.ARRAY_BUFFER, pc.buffer);
        gl.vertexAttribPointer(shaderProgram.positionAttribute, pc.size, pc.type, false, pc.stride, pc.offB);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, StageGL.COVER_VERT);

        pc = config.uv;
        gl.bindBuffer(gl.ARRAY_BUFFER, pc.buffer);
        gl.vertexAttribPointer(shaderProgram.uvPositionAttribute, pc.size, pc.type, false, pc.stride, pc.offB);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, StageGL.COVER_UV);

        gl.uniform1i(shaderProgram.samplerUniform, 0);

        gl.drawArrays(gl.TRIANGLES, 0, StageGL.INDICES_PER_CARD);
        this._batchID++; // while this isn't a batch, this fixes issues with expected textures in expected places
    }
}
