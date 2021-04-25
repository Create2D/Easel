import StageGL from "../display/StageGL";

import Filter from "./Filter";

export default class AlphaMaskFilter extends Filter {

    public mask: HTMLImageElement|HTMLCanvasElement|WebGLTexture | any;
    private _mapTexture: any;

    constructor(mask: HTMLImageElement|HTMLCanvasElement|WebGLTexture) {
        super();

        if (!Filter.isValidImageSource(mask)) {
            throw "Must provide valid image source for alpha mask, see Filter.isValidImageSource";
        }

        this.mask = mask;

        this.usesContext = true;

        this.FRAG_SHADER_BODY = (
            "uniform sampler2D uAlphaSampler;" +

            "void main(void) {" +
            "vec4 color = texture2D(uSampler, vTextureCoord);" +
            "vec4 alphaMap = texture2D(uAlphaSampler, vTextureCoord);" +

            "gl_FragColor = vec4(color.rgb * alphaMap.a, color.a * alphaMap.a);" +
            "}"
        );
    }

    public shaderParamSetup(gl: WebGLRenderingContext, stage: StageGL, shaderProgram: WebGLProgram): void {
        if (!this._mapTexture) {
            this._mapTexture = gl.createTexture();
        }

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this._mapTexture);
        stage.setTextureParams(gl);
        if (this.mask !== this._mapTexture) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.mask);
        }

        gl.uniform1i(
            gl.getUniformLocation(shaderProgram, "uAlphaSampler"),
            1
        );
    }

    public applyFilter(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, targetCtx: CanvasRenderingContext2D): boolean {
        if (!this.mask) {
            return true;
        }

        if (targetCtx === undefined) {
            targetCtx = ctx;
        }
        if (targetCtx !== ctx) {
            targetCtx.drawImage(ctx.canvas,
                0, 0, ctx.canvas.width, ctx.canvas.height,
                0, 0, targetCtx.canvas.width, targetCtx.canvas.height
            );
        }

        targetCtx.save();

        targetCtx.globalCompositeOperation = "destination-in";
        targetCtx.drawImage(this.mask, 0, 0, this.mask.width, this.mask.height, x, y, width, height);

        targetCtx.restore();
        return true;
    }

    public clone() {
        return new AlphaMaskFilter(this.mask);
    }

    public toString(): string {
        return "[AlphaMaskFilter]";
    }

}