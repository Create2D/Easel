import StageGL from "../display/StageGL";

import Filter from "./Filter";

export default class AberrationFilter extends Filter {
    constructor(
        public xDir: number = 0,
        public yDir: number = 0,
        public redMultiplier: number = 0,
        public greenMultiplier: number = 0,
        public blueMultiplier: number = 0,
        public originalMix: number = 0,
        public alphaMax: boolean = false) {
        super();

        this.FRAG_SHADER_BODY = (
            "uniform vec2 uColorDirection;" +
            "uniform vec3 uColorMultiplier;" +
            "uniform vec2 uExtraProps;" +

            "void main(void) {" +
            "vec4 sample = texture2D(" +
            "uSampler, " +
            "vTextureCoord" +
            ");" +
            "vec4 rSample = texture2D(" +
            "uSampler, " +
            "vTextureCoord + (uColorDirection * uColorMultiplier.r)" +
            ");" +
            "vec4 gSample = texture2D(" +
            "uSampler, " +
            "vTextureCoord + (uColorDirection * uColorMultiplier.g)" +
            ");" +
            "vec4 bSample = texture2D(" +
            "uSampler, " +
            "vTextureCoord + (uColorDirection * uColorMultiplier.b)" +
            ");" +

            "float newAlpha = " + (this.alphaMax ?
                    "max(rSample.a, max(gSample.a, max(bSample.a, sample.a)))" :
                    "(rSample.a + gSample.a + bSample.a) / 3.0"
            ) + ";" +
            "vec4 result = vec4(" +
            "min(1.0, rSample.r/(rSample.a+0.00001)) * newAlpha, " +
            "min(1.0, gSample.g/(gSample.a+0.00001)) * newAlpha, " +
            "min(1.0, bSample.b/(bSample.a+0.00001)) * newAlpha, " +
            "newAlpha" +
            ");" +
            "gl_FragColor = mix(result, sample, uExtraProps[0]*sample.a);" +
            "}"
        )
    }

    public shaderParamSetup(gl: WebGLRenderingContext, stage: StageGL, shaderProgram: WebGLProgram) {

        gl.uniform2f(
            gl.getUniformLocation(shaderProgram, "uColorDirection"),
            this.xDir*(1/stage._viewportWidth), this.yDir*(1/-stage._viewportHeight)
        );

        gl.uniform3f(
            gl.getUniformLocation(shaderProgram, "uColorMultiplier"),
            -this.redMultiplier,
            -this.greenMultiplier,
            -this.blueMultiplier
        );

        gl.uniform2f(
            gl.getUniformLocation(shaderProgram, "uExtraProps"),
            this.originalMix, 0
        );
    }

    public _applyFilter(imageData: ImageData): boolean {
        const refPixels = imageData.data.slice();
        const outPixels = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        let offset, pixel;

        for (let i=0; i<height; i++) {
            offset = i*width;
            for (let j=0; j<width; j++) {
                pixel = (offset+j)*4;

                let rX = j+( (this.xDir*-this.redMultiplier) |0), rY = i+( (this.yDir*-this.redMultiplier) |0);
                let gX = j+( (this.xDir*-this.greenMultiplier) |0), gY = i+( (this.yDir*-this.greenMultiplier) |0);
                let bX = j+( (this.xDir*-this.blueMultiplier) |0), bY = i+( (this.yDir*-this.blueMultiplier) |0);

                rX = Math.max(0, Math.min(width-1 , rX));
                rY = Math.max(0, Math.min(height-1 , rY));

                gX = Math.max(0, Math.min(width-1 , gX));
                gY = Math.max(0, Math.min(height-1 , gY));

                bX = Math.max(0, Math.min(width-1 , bX));
                bY = Math.max(0, Math.min(height-1 , bY));

                let redPixel = ((rY*width)+rX)*4;
                let grnPixel = ((gY*width)+gX)*4;
                let bluPixel = ((bY*width)+bX)*4;

                outPixels[pixel] =		refPixels[redPixel];
                outPixels[pixel+1] =	refPixels[grnPixel+1];
                outPixels[pixel+2] =	refPixels[bluPixel+2];
                outPixels[pixel+3] =	this.alphaMax ?
                    Math.max(refPixels[redPixel+3], refPixels[grnPixel+3], refPixels[bluPixel+3]) :
                    (refPixels[redPixel+3] + refPixels[grnPixel+3] + refPixels[bluPixel+3]) / 3;
            }
        }
        return true;
    }

    public clone(): AberrationFilter {
        return new AberrationFilter(this.xDir, this.yDir, this.redMultiplier, this.greenMultiplier, this.blueMultiplier, this.originalMix, this.alphaMax);
    }
}