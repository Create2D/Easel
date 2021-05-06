import StageGL from "../display/StageGL";
import Rectangle from "../geom/Rectangle";

import Filter from "./Filter";

export default class BlurFilter extends Filter {

    // public properties:
    /**
     * Horizontal blur radius in pixels
     **/
    private _blurX: number = 0;
    private _blurXTable: number[] = [];
    private _lastBlurX?: number;

    /**
     * Vertical blur radius in pixels
     **/
    private _blurY: number = 0;
    private _blurYTable: number[] = [];
    private _lastBlurY?: number;

    /**
     * Number of blur iterations. For example, a value of 1 will produce a rough blur. A value of 2 will produce a smoother blur, but take twice as long to run.
     **/
    private _quality: number = 1;
    private _lastQuality?: number;

    // This is a template to generate the shader for BlurFilter.FRAG_SHADER_BODY.
    private FRAG_SHADER_TEMPLATE = `
        uniform float xWeight[{{blurX}}];
        uniform float yWeight[{{blurY}}];
        uniform vec2 textureOffset;
        void main(void) {
            vec4 color = vec4(0.0);
    
            float xAdj = ({{blurX}}.0-1.0)/2.0;
            float yAdj = ({{blurY}}.0-1.0)/2.0;
            vec2 sampleOffset;
    
            for(int i=0; i<{{blurX}}; i++) {
                for(int j=0; j<{{blurY}}; j++) {
                    sampleOffset = vTextureCoord + (textureOffset * vec2(float(i)-xAdj, float(j)-yAdj));
                    color += texture2D(uSampler, sampleOffset) * (xWeight[i] * yWeight[j]);
                }
            }
    
            gl_FragColor = color.rgba;
        }
    `;

    private _compiledShader?: string;

    constructor(blurX: number = 0, blurY: number = 0, quality: number = 1) {
        super();

        this.blurX = blurX;
        this.blurY = blurY;
        this.quality = quality;
    }

    public get blurX(): number { return this._blurX; };
    public get blurY(): number { return this._blurY; };
    public get quality(): number { return this._quality; };

    public set blurX(value: number) {
        this._blurX = value > 0 ? value : 0;
    }
    public set blurY(value: number) {
        this._blurY = value > 0 ? value : 0;
    }
    public set quality(value: number) {
        this._quality = value > 0 ? value : 0;
    }

    protected _getShader() {
        const xChange = this._lastBlurX !== this._blurX;
        const yChange = this._lastBlurY !== this._blurY;
        const qChange = this._lastQuality !== this._quality;
        if(xChange || yChange || qChange) {
            if(xChange || qChange) { this._blurXTable = this._getTable(this._blurX * this._quality); }
            if(yChange || qChange) { this._blurYTable = this._getTable(this._blurY * this._quality); }
            this._updateShader();
            this._lastBlurX = this._blurX;
            this._lastBlurY = this._blurY;
            this._lastQuality = this._quality;
            return undefined; // force a rebuild
        }
        return this._compiledShader;
    }

    protected _setShader(value: string) {
        this._compiledShader = value;
    }

    /**
     * Internal lookup function to create gaussian distribution.
     **/
    public _getTable(spread: number): number[] {
        const EDGE = 4.2;
        if (spread<=1) {
            return [1];
        }

        const result = [];
        let count = Math.ceil(spread*2);
        count += (count%2)?0:1;
        const  adjust = (count/2)|0;
        for(let i = -adjust; i<=adjust; i++) {
            const x = (i/adjust)*EDGE;
            result.push(1/Math.sqrt(2*Math.PI) * Math.pow(Math.E, -(Math.pow(x,2)/4)));
        }
        const factor = result.reduce(function(a, b) { return a + b; });
        return result.map(function(currentValue, index, array) { return currentValue/factor; });
    }

    /**
     * Internal update function to create shader properties.
     **/
    private _updateShader() {
        let result = this.FRAG_SHADER_TEMPLATE;
        result = result.replace(/\{\{blurX\}\}/g, (this._blurXTable.length).toFixed(0));
        result = result.replace(/\{\{blurY\}\}/g, (this._blurYTable.length).toFixed(0));
        this.FRAG_SHADER_BODY = result;
    }

    public shaderParamSetup(gl: WebGLRenderingContext, stage: StageGL, shaderProgram: WebGLProgram): void {
        // load the normalized gaussian weight tables
        gl.uniform1fv(
            gl.getUniformLocation(shaderProgram, "xWeight"),
            this._blurXTable
        );
        gl.uniform1fv(
            gl.getUniformLocation(shaderProgram, "yWeight"),
            this._blurYTable
        );

        // what is the size of a single pixel in -1, 1 (webGL) space
        gl.uniform2f(
            gl.getUniformLocation(shaderProgram, "textureOffset"),
            2/(stage._viewportWidth*this._quality), 2/(stage._viewportHeight*this._quality)
        );
    }

    /**
     * Array of multiply values for blur calculations.
     **/
    private static MUL_TABLE = [1, 171, 205, 293, 57, 373, 79, 137, 241, 27, 391, 357, 41, 19, 283, 265, 497, 469, 443, 421, 25, 191, 365, 349, 335, 161, 155, 149, 9, 278, 269, 261, 505, 245, 475, 231, 449, 437, 213, 415, 405, 395, 193, 377, 369, 361, 353, 345, 169, 331, 325, 319, 313, 307, 301, 37, 145, 285, 281, 69, 271, 267, 263, 259, 509, 501, 493, 243, 479, 118, 465, 459, 113, 446, 55, 435, 429, 423, 209, 413, 51, 403, 199, 393, 97, 3, 379, 375, 371, 367, 363, 359, 355, 351, 347, 43, 85, 337, 333, 165, 327, 323, 5, 317, 157, 311, 77, 305, 303, 75, 297, 294, 73, 289, 287, 71, 141, 279, 277, 275, 68, 135, 67, 133, 33, 262, 260, 129, 511, 507, 503, 499, 495, 491, 61, 121, 481, 477, 237, 235, 467, 232, 115, 457, 227, 451, 7, 445, 221, 439, 218, 433, 215, 427, 425, 211, 419, 417, 207, 411, 409, 203, 202, 401, 399, 396, 197, 49, 389, 387, 385, 383, 95, 189, 47, 187, 93, 185, 23, 183, 91, 181, 45, 179, 89, 177, 11, 175, 87, 173, 345, 343, 341, 339, 337, 21, 167, 83, 331, 329, 327, 163, 81, 323, 321, 319, 159, 79, 315, 313, 39, 155, 309, 307, 153, 305, 303, 151, 75, 299, 149, 37, 295, 147, 73, 291, 145, 289, 287, 143, 285, 71, 141, 281, 35, 279, 139, 69, 275, 137, 273, 17, 271, 135, 269, 267, 133, 265, 33, 263, 131, 261, 130, 259, 129, 257, 1];

    /**
     * Array of shift values for blur calculations.
     **/
    private static SHG_TABLE = [0, 9, 10, 11, 9, 12, 10, 11, 12, 9, 13, 13, 10, 9, 13, 13, 14, 14, 14, 14, 10, 13, 14, 14, 14, 13, 13, 13, 9, 14, 14, 14, 15, 14, 15, 14, 15, 15, 14, 15, 15, 15, 14, 15, 15, 15, 15, 15, 14, 15, 15, 15, 15, 15, 15, 12, 14, 15, 15, 13, 15, 15, 15, 15, 16, 16, 16, 15, 16, 14, 16, 16, 14, 16, 13, 16, 16, 16, 15, 16, 13, 16, 15, 16, 14, 9, 16, 16, 16, 16, 16, 16, 16, 16, 16, 13, 14, 16, 16, 15, 16, 16, 10, 16, 15, 16, 14, 16, 16, 14, 16, 16, 14, 16, 16, 14, 15, 16, 16, 16, 14, 15, 14, 15, 13, 16, 16, 15, 17, 17, 17, 17, 17, 17, 14, 15, 17, 17, 16, 16, 17, 16, 15, 17, 16, 17, 11, 17, 16, 17, 16, 17, 16, 17, 17, 16, 17, 17, 16, 17, 17, 16, 16, 17, 17, 17, 16, 14, 17, 17, 17, 17, 15, 16, 14, 16, 15, 16, 13, 16, 15, 16, 14, 16, 15, 16, 12, 16, 15, 16, 17, 17, 17, 17, 17, 13, 16, 15, 17, 17, 17, 16, 15, 17, 17, 17, 16, 15, 17, 17, 14, 16, 17, 17, 16, 17, 17, 16, 15, 17, 16, 14, 17, 16, 15, 17, 16, 17, 17, 16, 17, 15, 16, 17, 14, 17, 16, 15, 17, 16, 17, 13, 17, 16, 17, 17, 16, 17, 14, 17, 16, 17, 16, 17, 16, 17, 9];

    public getBounds(rect: Rectangle) {
        const x = this.blurX, y = this.blurY;
        if(x <= 0 && y <= 0) { return rect; }
        const q = Math.pow(this.quality, 0.2);
        return (rect || new Rectangle()).pad(y*q+1,x*q+1,y*q+1,x*q+1);
    }

    public clone() {
        return new BlurFilter(this.blurX, this.blurY, this.quality);
    }

    public toString() {
        return "[BlurFilter]";
    }

    public _applyFilter(imageData: ImageData): boolean {
        const radiusX = this.blurX >> 1;
        const radiusY = this.blurY >> 1;
        if (radiusX < 0 || radiusY < 0 || radiusX === 0 && radiusY === 0) return false;

        let iterations = this.quality;
        if (iterations > 3) iterations = 3;
        if (iterations < 1) iterations = 1;

        const px = imageData.data;
        let x=0, y=0, i=0, p=0, yp=0, yi=0, yw=0, r=0, g=0, b=0, a=0, pr=0, pg=0, pb=0, pa=0;

        const divx = radiusX + radiusX + 1;
        const divy = radiusY + radiusY + 1;
        const w = imageData.width | 0;
        const h = imageData.height | 0;

        const w1 = (w - 1);
        const h1 = (h - 1);
        const rxp1 = (radiusX + 1);
        const ryp1 = (radiusY + 1);

        type elem = {r: number, b: number, g: number, a: number, n?: elem};

        let ssx: elem = {r: 0, b: 0, g: 0, a: 0};
        let ssy: elem = {r: 0, b: 0, g: 0, a: 0};

        let sx: elem | undefined = ssx;
        let sy: elem | undefined = ssy;

        for ( i = 1; i < divx; i++ ) {
            sx = sx.n = {r: 0, b: 0, g: 0, a: 0};
        }
        for ( i = 1; i < divy; i++ ) {
            sy = sy.n = {r: 0, b: 0, g: 0, a: 0};
        }

        sx.n = ssx;
        sy.n = ssy;

        let si = null;

        const mtx = BlurFilter.MUL_TABLE[radiusX];
        const stx = BlurFilter.SHG_TABLE[radiusX];
        const mty = BlurFilter.MUL_TABLE[radiusY];
        const sty = BlurFilter.SHG_TABLE[radiusY];

        while (iterations-- > 0) {

            yw = yi = 0;
            let ms = mtx;
            let ss = stx;
            for (y = h; --y > -1;) {
                r = rxp1 * (pr = px[(yi)]);
                g = rxp1 * (pg = px[(yi + 1)]);
                b = rxp1 * (pb = px[(yi + 2)]);
                a = rxp1 * (pa = px[(yi + 3)]);

                sx = ssx;

                for( i = rxp1; --i > -1; ) {
                    sx!.r = pr;
                    sx!.g = pg;
                    sx!.b = pb;
                    sx!.a = pa;
                    sx = sx!.n;
                }

                for( i = 1; i < rxp1; i++ ) {
                    p = (yi + ((w1 < i ? w1 : i) << 2));
                    r += ( sx!.r = px[p]);
                    g += ( sx!.g = px[p+1]);
                    b += ( sx!.b = px[p+2]);
                    a += ( sx!.a = px[p+3]);
                    sx = sx!.n;
                }

                si = ssx;
                for ( x = 0; x < w; x++ ) {
                    px[yi++] = (r * ms) >>> ss;
                    px[yi++] = (g * ms) >>> ss;
                    px[yi++] = (b * ms) >>> ss;
                    px[yi++] = (a * ms) >>> ss;

                    p = ((yw + ((p = x + radiusX + 1) < w1 ? p : w1)) << 2);

                    r -= si!.r - ( si!.r = px[p]);
                    g -= si!.g - ( si!.g = px[p+1]);
                    b -= si!.b - ( si!.b = px[p+2]);
                    a -= si!.a - ( si!.a = px[p+3]);

                    si = si!.n;
                }
                yw += w;
            }

            ms = mty;
            ss = sty;
            for (x = 0; x < w; x++) {
                yi = (x << 2);

                r = (ryp1 * (pr = px[yi]));
                g = (ryp1 * (pg = px[(yi + 1)]));
                b = (ryp1 * (pb = px[(yi + 2)]));
                a = (ryp1 * (pa = px[(yi + 3)]));

                sy = ssy;
                for( i = 0; i < ryp1; i++ ) {
                    sy!.r = pr;
                    sy!.g = pg;
                    sy!.b = pb;
                    sy!.a = pa;
                    sy = sy!.n;
                }

                yp = w;

                for( i = 1; i <= radiusY; i++ ) {
                    yi = ( yp + x ) << 2;

                    r += ( sy!.r = px[yi]);
                    g += ( sy!.g = px[yi+1]);
                    b += ( sy!.b = px[yi+2]);
                    a += ( sy!.a = px[yi+3]);

                    sy = sy!.n;

                    if( i < h1 ) {
                        yp += w;
                    }
                }

                yi = x;
                si = ssy;

                for (y = 0; y < h; y++) {
                    p = yi << 2;
                    px[p+3] = pa = (a * ms) >>> ss;
                    if ( pa > 0 ) {
                        pa = iterations > 0 ? 255 / pa : 1;
                        px[p]   = ((r * ms) >>> ss ) * pa;
                        px[p+1] = ((g * ms) >>> ss ) * pa;
                        px[p+2] = ((b * ms) >>> ss ) * pa;
                    } else {
                        px[p] = px[p+1] = px[p+2] = 0
                    }

                    p = ( x + (( ( p = y + ryp1) < h1 ? p : h1 ) * w )) << 2;

                    r -= si!.r - ( si!.r = px[p]);
                    g -= si!.g - ( si!.g = px[p+1]);
                    b -= si!.b - ( si!.b = px[p+2]);
                    a -= si!.a - ( si!.a = px[p+3]);

                    si = si!.n;

                    yi += w;
                }

            }

        }
        return true;
    }
}