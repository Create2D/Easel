import {EventDispatcher} from "@create2d/core";

import Container from "../display/Container";
import DisplayObject from "../display/DisplayObject";
import StageGL from "../display/StageGL";

interface IStageGL extends StageGL {
    _renderBatch_?: (...args: any)=>any
    _renderCover_?: (...args: any)=>any
}

export default class WebGLInspector extends EventDispatcher {

    /**
     * Alternate output for debugging situations where "console" is not available, i.e. Mobile or remote debugging.
     * Expects object with a "log" function that takes any number of params.
     **/
    protected static alternateOutput?: Console;

    /**
     * Default stage to assume when non provided
     **/
    protected static stage: StageGL;
    
    private static _activeShader: any;
    private static _batchID: number;
    private static _batchVertexCount: number;
    private static _drawID: string;
    private static __lastHighest: number;
    private static _inspectorFrame: any;
    private static _webGLContext: WebGLRenderingContext;
    private static _projectionMatrix: Float32Array;
    private static _vertices: Float32Array;
    private static _indices: Float32Array;
    private static _uvs: Float32Array;
    private static _alphas: Float32Array;
    private static batchReason: string = "LoadedTextureDebug";
    private static _batchTextureCount: number;
    private static _renderBatch_: ()=>void;
    private static _mainShader: any;
    private static _batchTextureOutput: any;
    private static _builtShaders: any;
    private static _renderMode: any;

    private static _viewportWidth: GLsizei;
    private static _viewportHeight: GLsizei;

    /**
     * A utility and helper class designed to work with {{#crossLink "StageGL"}}{{/crossLink}} to help investigate and
     * test performance or display problems. It contains logging functions to analyze behaviour and performance testing
     * utilities.
     **/
    constructor(stage: StageGL) {
        super();
    }

    /**
     * Utility to call the right logging
     **/
    public static log(...args: any) {
        (WebGLInspector.alternateOutput ? WebGLInspector.alternateOutput.log : console.log).apply(this, args);
    }

    /**
     * Perform all of the logging reports at once.
     **/
    public static logAll(stage: StageGL = WebGLInspector.stage) {
        WebGLInspector.log("Average batches Per Draw", (stage._batchID/stage._drawID).toFixed(4));
        WebGLInspector.logContextInfo(stage._webGLContext);
        WebGLInspector.logDepth(stage.children, "");
        WebGLInspector.logTextureFill(stage);
    }

    /**
     * Replace the stage's Draw command with a new draw command. This is useful for:
     * <ul>
     *     <li> Testing performance, with no render cost. See `WebGLInspector.drawEmpty` </li>
     *     <li> Troubleshooting and tracking loaded textures. See `WebGLInspector.drawTexOnBuffer` </li>
     *     <li> Misc feature or troubleshooting injection </li>
     * </ul>
     * @method replaceRenderBatchCall
     * @param {StageGL} [stage=WebGLInspector.stage] The stage to log information for.
     * @param {Function} newFunc .
     */
    public static replaceRenderBatchCall(stage: IStageGL = WebGLInspector.stage, newFunc: ()=>void) {
        if (!newFunc && stage._renderBatch_) {
            stage._renderBatch = stage._renderBatch_;
            stage._renderBatch_ = undefined;
        } else {
            if (!stage._renderBatch_) {
                stage._renderBatch_ = stage._renderBatch;
            }
            stage._renderBatch = newFunc;
        }
    }

    /**
     * Identical to replaceRenderBatchCall, but affects the Cover command.
     **/
    public static replaceRenderCoverCall(stage: IStageGL = WebGLInspector.stage, newFunc: ()=>void) {
        if (newFunc === undefined && stage._renderCover_) {
            stage._renderCover = stage._renderCover_;
            stage._renderCover_ = undefined;
        } else {
            if (stage._renderCover_ === undefined) {
                stage._renderCover_ = stage._renderCover;
            }
            stage._renderCover = newFunc;
        }
    }

    /**
     * Recursively walk the entire display tree, log the attached items, and display it in a tree view.
     **/
    public static logDepth(children: DisplayObject[] = WebGLInspector.stage.children, prepend: string = "", customLog?: Function) {
        const l = children.length;
        for (let i=0; i<l; i++) {
            const child = children[i];
            (customLog ? customLog : WebGLInspector.log)(prepend+"-", child);
            if (child instanceof Container && child.children.length) {
                WebGLInspector.logDepth(child.children, "|"+prepend, customLog);
            }
        }
    }

    /**
     * Examine the context and provide information about its capabilities.
     **/
    public static logContextInfo(gl: WebGLRenderingContext = WebGLInspector.stage._webGLContext) {
        let data = `
== LOG
Max textures per draw: ${ gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) }
Max textures active: ${ gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) }

Max texture size: ${ (gl.getParameter(gl.MAX_TEXTURE_SIZE)/2) }^2
Max cache size: ${ (gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)/2) }^2

Max attributes per vertex: ${gl.getParameter(gl.MAX_VERTEX_ATTRIBS)}
WebGL Version string: ${gl.getParameter(gl.VERSION)}
======`;
        WebGLInspector.log(data);
    }

    /**
     * Simulate renders and watch what happens for textures moving around between draw calls. A texture moving between
     * slots means it was removed and then re-added to draw calls. Performance may be better if it was allowed to stay
     * on GPU, consider sprite sheeting it with something stable.
     **/
    public static logTextureFill(stage: StageGL = WebGLInspector.stage) {
        const dict = stage._textureDictionary;
        const count = stage._batchTextureCount;
        WebGLInspector.log("textureMax:", count);
        const output = [];
        for (let n in dict) {
            const str = n.replace(window.location.origin, "");
            const tex = dict[n];
            const shifted = tex._lastActiveIndex ? tex._lastActiveIndex === tex._activeIndex : false;
            output.push({src: str, element: tex, shifted: shifted});
            tex._lastActiveIndex = tex._activeIndex;
        }

        output.sort(function(a,b){
            if (a.element._drawID === stage._drawID) { return 1; }
            if (a.element._drawID < b.element._drawID) { return -1; }
            return 0;
        });

        const l = output.length;
        for (let i = 0; i<l; i++) {
            const out = output[i];
            const active = out.element._drawID === stage._drawID;
            WebGLInspector.log("["+out.src+"] "+ (active?"ACTIVE":"stale") +" "+ (out.shifted?"steady":"DRIFT"), out.element);
        }
    }

    /**
     * Utility function for use with {{#crossLink "logDepth"))((/crossLink}}. Logs an item's position and registration.
     * Useful to see if something is being forced off screen or has an integer position.
     **/
    public static dispProps(prepend: string = "", item: DisplayObject){
        const p = "\tP:"+ item.x.toFixed(2)+"x"+item.y.toFixed(2) +"\t";
        const r = "\tR:"+ item.regX.toFixed(2)+"x"+item.regY.toFixed(2) +"\t";

        WebGLInspector.log(prepend, item.toString()+"\t", p,r);
    }

    /**
     * Utility function for use with {{#crossLink "replaceRenderBatchCall"))((/crossLink}}.
     * Tracks the highest element per batch count any render has achieved, useful for fine tuning max performance.
     * Use `WebGLInspector.__lastHighest;` to inspect value.
     * Warning, this will not show values higher than your current batchSize.
     **/
    public static trackMaxBatchDraw() {
        const cardCount = this._batchVertexCount/StageGL.INDICES_PER_CARD;
        if(!(cardCount < WebGLInspector.__lastHighest)) { //backwards handles NaNs inline
            WebGLInspector.__lastHighest = cardCount;
        }

        // don't break regular behavior
        this._renderBatch_();
    }

    /**
     * Utility function for use with {{#crossLink "replaceRenderBatchCall"))((/crossLink}}.
     * Performs no GL draw command.
     **/
    public static drawEmptyBatch () {
        WebGLInspector.log("BlankBatch["+ this._drawID +":"+ this._batchID +"] : "+ this.batchReason);
        this._batchVertexCount = 0;
        this._batchID++;
    }

    /**
     * Utility function for use with {{#crossLink "replaceRenderCoverCall"))((/crossLink}}.
     * Performs no GL draw command.
     **/
    public static drawEmptyCover() {
        WebGLInspector.log("BlankCover["+ this._drawID +":"+ this._batchID +"] : "+ this.batchReason);
        this._batchID++;
    }

    /**
     * Utility function for use with {@link replaceRenderBatchCall}.
     **/
    public static drawTexBuffer() {
        const gl = this._webGLContext;
        const texSize = 2048;

        // backup
        const batchVertexCount = this._batchVertexCount;
        const projectionMatrix = this._projectionMatrix;
        const shader = this._activeShader;
        const vertices = this._vertices;
        const indices = this._indices;
        const uvs = this._uvs;
        const alphas = this._alphas;
        const reason = this.batchReason;

        // create
        if (!this._inspectorFrame) {
            this._inspectorFrame = this.getRenderBufferTexture(texSize, texSize);
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._inspectorFrame._frameBuffer);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        // configure
        this._activeShader = this._mainShader;
        gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
        gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.viewport(0, 0, texSize, texSize);

        this._projectionMatrix = new Float32Array([2/texSize, 0, 0, 0, 0, -2/texSize, 0, 0, 0, 0, 1, 0, -1, 1, 0, 1]);
        this._vertices = new Float32Array(this._batchTextureCount * 2 * StageGL.INDICES_PER_CARD);
        this._indices = new Float32Array(this._batchTextureCount * 1 * StageGL.INDICES_PER_CARD);
        this._uvs = new Float32Array(this._batchTextureCount * 2 * StageGL.INDICES_PER_CARD);
        this._alphas = new Float32Array(this._batchTextureCount * 1 * StageGL.INDICES_PER_CARD);
        this.batchReason = "LoadedTextureDebug";

        const squareBase = Math.ceil(Math.sqrt(this._batchTextureCount));
        for(let i=0; i<this._batchTextureCount; i++) {
            const i1 = i*6, i2 = i1*2;
            const row = i % squareBase, col = Math.floor(i / squareBase), size = (1/squareBase) * texSize;
            this._vertices[i2] =	(row)*size;					this._vertices[i2+1] =	(col)*size;
            this._vertices[i2+2] =	(row)*size;					this._vertices[i2+3] =	(col+1)*size;
            this._vertices[i2+4] =	(row+1)*size;				this._vertices[i2+5] =	(col)*size;
            this._vertices[i2+6] =	this._vertices[i2+2];		this._vertices[i2+7] =	this._vertices[i2+3];
            this._vertices[i2+8] =	this._vertices[i2+4];		this._vertices[i2+9] =	this._vertices[i2+5];
            this._vertices[i2+10] =	(row+1)*size;				this._vertices[i2+11] =	(col+1)*size;
            this._uvs[i2] =		0;			this._uvs[i2+1] =	1;
            this._uvs[i2+2] =	0;			this._uvs[i2+3] =	0;
            this._uvs[i2+4] =	1;			this._uvs[i2+5] =	1;
            this._uvs[i2+6] =	0;			this._uvs[i2+7] =	0;
            this._uvs[i2+8] =	1;			this._uvs[i2+9] =	1;
            this._uvs[i2+10] =	1;			this._uvs[i2+11] =	0;
            this._indices[i1] = this._indices[i1+1] = this._indices[i1+2] = this._indices[i1+3] = this._indices[i1+4] = this._indices[i1+5] = i;
            this._alphas[i1] = this._alphas[i1+1] = this._alphas[i1+2] = this._alphas[i1+3] = this._alphas[i1+4] = this._alphas[i1+5] = 1;
        }

        // output
        this._batchVertexCount = this._batchTextureCount * StageGL.INDICES_PER_CARD;
        this._renderBatch_();
        this._batchID--;

        // reset and perform
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._batchTextureOutput!._frameBuffer);

        const shaderData = this._builtShaders[this._renderMode];
        gl.blendEquationSeparate(shaderData.eqRGB, shaderData.eqA);
        gl.blendFuncSeparate(shaderData.srcRGB, shaderData.dstRGB, shaderData.srcA, shaderData.dstA);
        gl.viewport(0, 0, this._viewportWidth, this._viewportHeight);

        this._activeShader = shader;
        this._batchVertexCount = batchVertexCount;
        this._projectionMatrix = projectionMatrix;
        this._vertices = vertices;
        this._indices = indices;
        this._uvs = uvs;
        this._alphas = alphas;
        this.batchReason = reason;

        this._renderBatch_();
    }

    private static getRenderBufferTexture(texSize: number, texSize2: number): any {
        return undefined;
    }
}
