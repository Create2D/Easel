import StageGL from "../display/StageGL";
import Rectangle from "../geom/Rectangle";

export default abstract class Filter {
    public usesContext: boolean = false;
    public _multiPass: Filter|null = null;
    public VTX_SHADER_BODY?: string;
    public FRAG_SHADER_BODY?: string;

    public static isValidImageSource(src: HTMLImageElement|HTMLCanvasElement|WebGLTexture): boolean {
        return Boolean(src) && (
            src instanceof Image ||
            src instanceof WebGLTexture ||
            src instanceof HTMLCanvasElement
        );
    }

    public get bounds(): Rectangle|undefined {
        return;
    }

    public abstract shaderParamSetup(gl: WebGLRenderingContext, stage: StageGL, shaderProgram: WebGLProgram): void;

    public applyFilter(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, targetCtx?: CanvasRenderingContext2D): boolean {
        // this is the default behaviour because most filters access pixel data. It is overridden when not needed.
        targetCtx = targetCtx || ctx;
        let imageData;
        try {
            imageData = ctx.getImageData(x, y, width, height);
        } catch (e) {
            return false;
        }
        if (this._applyFilter(imageData)) {
            targetCtx.putImageData(imageData, x, y);
            return true;
        }
        return false;
    }

    public abstract clone(): any;

    public toString(): string {
        return "[Filter]";
    }

    public _applyFilter(imageData: ImageData): boolean {
        return true;
    }
}