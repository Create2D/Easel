import StageGL from "../display/StageGL";

import Filter from "./Filter";

export default class ColorFilter extends Filter {
    constructor(
        public redMultiplier: number = 1,
        public greenMultiplier: number = 1,
        public blueMultiplier: number = 1,
        public alphaMultiplier: number = 1,
        public redOffset: number = 0, // This is a range between -255 and 255.
        public greenOffset: number = 0, // This is a range between -255 and 255.
        public blueOffset: number = 0, // This is a range between -255 and 255.
        public alphaOffset: number = 0 // This is a range between -255 and 255.
    ) {
        super();

        this.FRAG_SHADER_BODY = `
            uniform vec4 uColorMultiplier;
            uniform vec4 uColorOffset;

            void main(void) {
                vec4 color = texture2D(uSampler, vTextureCoord);
                color = clamp(vec4(0.0), vec4(1.0), vec4(vec3(color.rgb / color.a), color.a));
                color = clamp(vec4(0.0), vec4(1.0), color * uColorMultiplier + uColorOffset);
    
                gl_FragColor = vec4(color.rgb * color.a, color.a);
            }
        `;
    }

    public shaderParamSetup(gl: WebGLRenderingContext, stage: StageGL, shaderProgram: WebGLProgram): void {
        gl.uniform4f(
            gl.getUniformLocation(shaderProgram, "uColorMultiplier"),
            this.redMultiplier, this.greenMultiplier, this.blueMultiplier, this.alphaMultiplier
        );

        gl.uniform4f(
            gl.getUniformLocation(shaderProgram, "uColorOffset"),
            this.redOffset / 255, this.greenOffset / 255, this.blueOffset / 255, this.alphaOffset / 255
        );
    }

    public toString(): string {
        return "[ColorFilter]";
    }

    public clone() {
        return new ColorFilter(
            this.redMultiplier, this.greenMultiplier, this.blueMultiplier, this.alphaMultiplier,
            this.redOffset, this.greenOffset, this.blueOffset, this.alphaOffset
        );
    }

    public _applyFilter(imageData: ImageData): boolean {
        const data = imageData.data;
        const l = data.length;
        for (let i = 0; i < l; i += 4) {
            data[i] = data[i] * this.redMultiplier + this.redOffset;
            data[i + 1] = data[i + 1] * this.greenMultiplier + this.greenOffset;
            data[i + 2] = data[i + 2] * this.blueMultiplier + this.blueOffset;
            data[i + 3] = data[i + 3] * this.alphaMultiplier + this.alphaOffset;
        }
        return true;
    }
}