import StageGL from "../display/StageGL";
import createCanvas from "../utils/Canvas";

import Filter from "./Filter";

export default class AlphaMapFilter extends Filter {
    /**
     * The greyscale image (or canvas) to use as the alpha value for the result. This should be exactly the same dimensions as the target.
     **/
    public alphaMap: HTMLImageElement|HTMLCanvasElement|WebGLTexture | any;

    private _map: HTMLImageElement|HTMLCanvasElement | any;
    private _mapCtx: CanvasRenderingContext2D | any;
    private _mapTexture: WebGLTexture | any;

    constructor(alphaMap: HTMLImageElement|HTMLCanvasElement|WebGLTexture) {
        super();

        if (!Filter.isValidImageSource(alphaMap)) {
            throw "Must provide valid image source for alpha map, see Filter.isValidImageSource";
        }

        this.alphaMap = alphaMap;

        this.FRAG_SHADER_BODY = (
            "uniform sampler2D uAlphaSampler;"+

            "void main(void) {" +
            "vec4 color = texture2D(uSampler, vTextureCoord);" +
            "vec4 alphaMap = texture2D(uAlphaSampler, vTextureCoord);" +

            // some image formats can have transparent white rgba(1,1,1, 0) when put on the GPU, this means we need a slight tweak
            // using ceil ensure that the colour will be used so long as it exists but pure transparency will be treated black
            "float newAlpha = alphaMap.r * ceil(alphaMap.a);" +
            "gl_FragColor = vec4(clamp(color.rgb/color.a, 0.0, 1.0) * newAlpha, newAlpha);" +
            "}"
        );

        if(alphaMap instanceof WebGLTexture) {
            this._mapTexture = alphaMap;
        }
    }

    public shaderParamSetup(gl: WebGLRenderingContext, stage: StageGL, shaderProgram: WebGLProgram) {
        if(!this._mapTexture) {
            this._mapTexture = gl.createTexture() || undefined;
        }

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this._mapTexture);
        stage.setTextureParams(gl);
        if (this.alphaMap !== this._mapTexture) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.alphaMap);
        }

        gl.uniform1i(
            gl.getUniformLocation(shaderProgram, "uAlphaSampler"),
            1
        );
    }

    public clone() {
        return new AlphaMapFilter(this.alphaMap);
    }

    public toString(): string {
        return "[AlphaMapFilter]";
    }

    public _applyFilter(imageData: any) {
        if (!this._prepAlphaMap()) {
            return false;
        }

        const outArray = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        let rowOffset, pixelStart;

        const sampleData = this._mapCtx.getImageData(0,0, this._map.width,this._map.height);
        const sampleArray = sampleData.data;
        const sampleWidth = sampleData.width;
        const sampleHeight = sampleData.height;
        let sampleRowOffset, samplePixelStart;

        const widthRatio = sampleWidth/width;
        const heightRatio = sampleHeight/height;

        // performance optimizing lookup

        // the x and y need to stretch separately, nesting the for loops simplifies this logic even if the array is flat
        for (let i=0; i<height; i++) {
            rowOffset = i * width;
            sampleRowOffset = ((i*heightRatio) |0) * sampleWidth;

            // the arrays are int arrays, so a single pixel is [r,g,b,a, ...],so calculate the start of the pixel
            for (let j=0; j<width; j++) {
                pixelStart = (rowOffset + j) *4;
                samplePixelStart = (sampleRowOffset + ((j*widthRatio) |0)) *4;

                // modify the pixels
                outArray[pixelStart] =   outArray[pixelStart];
                outArray[pixelStart+1] = outArray[pixelStart+1];
                outArray[pixelStart+2] = outArray[pixelStart+2];
                outArray[pixelStart+3] = sampleArray[samplePixelStart];
            }
        }

        return true;
    }

    private _prepAlphaMap(): boolean {
        if (!this.alphaMap) {
            return false;
        }
        if (this.alphaMap === this._map && this._mapCtx) {
            return true;
        }

        const map = this._map = this.alphaMap;
        let canvas: any = map;
        let ctx;
        if (map instanceof HTMLCanvasElement) {
            ctx = canvas.getContext("2d");
        } else {
            canvas = createCanvas ? createCanvas() : document.createElement("canvas");
            canvas.width = map.width;
            canvas.height = map.height;
            ctx = canvas.getContext("2d");
            ctx.drawImage(map, 0, 0);
        }

        this._mapCtx = ctx;

        return true;
    }

}