import StageGL from "../display/StageGL";
import createCanvas from "../utils/Canvas";

import Filter from "./Filter";

export default class DisplacementFilter extends Filter {

    /**
     * The visual source to fetch the displacement map from.
     **/
    public dudvMap: any;

    /**
     * The absolute value of the maximum shift in x/y possible.
     **/
    public distance: number = 0;


    private _dudvCanvas: any;
    private _dudvCtx: any;
    private _mapTexture: any;


    constructor(dudvMap: HTMLImageElement | HTMLCanvasElement | WebGLTexture, distance: number = 0) {
        super();

        if (!Filter.isValidImageSource(dudvMap)) {
            throw "Must provide valid image source for displacement map, see Filter.isValidImageSource";
        }

        this.dudvMap = dudvMap;
        this.distance = distance;

        /**
         * This is a template to generate the shader for {{#crossLink FRAG_SHADER_BODY}}{{/crossLink}}
         */
        this.FRAG_SHADER_BODY = (
            "uniform sampler2D uDudvSampler;" +
            "uniform float fPower;" +
            "uniform vec2 pixelAdjustment;" +

            "void main(void) {" +
            "vec4 dudvValue = texture2D(uDudvSampler, vTextureCoord);" +
            "vec2 sampleOffset = mix(vec2(0.0), dudvValue.rg-0.5, dudvValue.a) * (fPower*pixelAdjustment);" +
            "gl_FragColor = texture2D(uSampler, vTextureCoord + sampleOffset);" +
            "}"
        );

        if (dudvMap instanceof WebGLTexture) {
            this._mapTexture = dudvMap;
        } else if (dudvMap instanceof HTMLCanvasElement) {
            this._dudvCanvas = dudvMap;
            this._dudvCtx = dudvMap.getContext("2d");
        } else {
            const canvas = createCanvas ? createCanvas() : document.createElement("canvas");
            canvas.width = dudvMap.width;
            canvas.height = dudvMap.height;
            (this._dudvCtx = canvas.getContext("2d")).drawImage(dudvMap, 0, 0);
        }
    }

    public shaderParamSetup(gl: WebGLRenderingContext, stage: StageGL, shaderProgram: WebGLProgram): void {
        if (!this._mapTexture) {
            this._mapTexture = gl.createTexture();
        }

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this._mapTexture);
        stage.setTextureParams(gl);
        if (this.dudvMap !== this._mapTexture) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.dudvMap);
        }

        gl.uniform1i(
            gl.getUniformLocation(shaderProgram, "uDudvSampler"),
            1
        );

        gl.uniform1f(
            gl.getUniformLocation(shaderProgram, "fPower"),
            this.distance
        );

        gl.uniform2f( //this is correct as the color maps to -0.5,0.5. This compounds the pixel delta, thus 2/size
            gl.getUniformLocation(shaderProgram, "pixelAdjustment"),
            2 / stage._viewportWidth, -2 / stage._viewportHeight
        );
    }

    public clone() {
        return new DisplacementFilter(this.dudvMap, this.distance);
    }

    public toString(): string {
        return "[DisplacementFilter]";
    }

    public _applyFilter(imageData: ImageData): boolean {
        // as we're reaching across pixels we need an unmodified clone of the source
        // slice/from/map/filter don't work correctly in IE11 and subarray creates a ref
        let refArray, refArraySrc = imageData.data;
        if (refArraySrc.slice !== undefined) {
            refArray = refArraySrc.slice();
        } else {
            refArray = new Uint8ClampedArray(refArraySrc.length);
            refArray.set(refArraySrc);
        }

        const outArray = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        let rowOffset, pixelStart;

        const sampleData = this._dudvCtx.getImageData(0, 0, this.dudvMap.width, this.dudvMap.height);
        const sampleArray = sampleData.data;
        const sampleWidth = sampleData.width;
        const sampleHeight = sampleData.height;
        let sampleRowOffset, samplePixelStart;

        const widthRatio = sampleWidth / width;
        const heightRatio = sampleHeight / height;
        const pxRange = 1 / 255;

        // performance optimizing lookup
        const distance = this.distance * 2;

        // the x and y need to stretch separately, nesting the for loops simplifies this logic even if the array is flat
        for (let i = 0; i < height; i++) {
            rowOffset = i * width;
            sampleRowOffset = ((i * heightRatio) | 0) * sampleWidth;

            // the arrays are int arrays, so a single pixel is [r,g,b,a, ...],so calculate the start of the pixel
            for (let j = 0; j < width; j++) {
                pixelStart = (rowOffset + j) * 4;
                samplePixelStart = (sampleRowOffset + ((j * widthRatio) | 0)) * 4;

                // modify the pixels
                const deltaPower = sampleArray[samplePixelStart + 3] * pxRange * distance;
                let xDelta = ((sampleArray[samplePixelStart] * pxRange - 0.5) * deltaPower) | 0;
                let yDelta = ((sampleArray[samplePixelStart + 1] * pxRange - 0.5) * deltaPower) | 0;

                if (j + xDelta < 0) {
                    xDelta = -j;
                }
                if (j + xDelta > width) {
                    xDelta = width - j;
                }
                if (i + yDelta < 0) {
                    yDelta = -i;
                }
                if (i + yDelta > height) {
                    yDelta = height - i;
                }

                const targetPixelStart = (pixelStart + xDelta * 4) + yDelta * 4 * width;
                outArray[pixelStart] = refArray[targetPixelStart];
                outArray[pixelStart + 1] = refArray[targetPixelStart + 1];
                outArray[pixelStart + 2] = refArray[targetPixelStart + 2];
                outArray[pixelStart + 3] = refArray[targetPixelStart + 3];
            }
        }

        return true;
    }
}