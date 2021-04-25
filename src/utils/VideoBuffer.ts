import createCanvas from "./Canvas";

export default class VideoBuffer {
    private readyState: number;
    private _video: HTMLVideoElement;
    private _canvas?: HTMLCanvasElement;
    private _lastTime: number = -1;

    constructor(video: HTMLVideoElement) {
        this._video = video;
        this.readyState = video.readyState;

        if (this.readyState < 2) {
            video.addEventListener("canplaythrough", this._videoReady.bind(this));
        }
        //once:true isn't supported everywhere, but its a non-critical optimization here.
    }

    /**
     * Gets an HTML canvas element showing the current video frame, or the previous frame if in a seek / loop.
     * Primarily for use by {@link easel.Bitmap}.
     **/
    public getImage(): HTMLCanvasElement|undefined {
        if (this.readyState < 2) {
            return;
        }
        let canvas = this._canvas, video = this._video;
        if (!canvas) {
            canvas = this._canvas = createCanvas();
            if (canvas) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }
        }
        if (canvas && video.readyState >= 2 && video.currentTime !== this._lastTime) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            }
            this._lastTime = video.currentTime;
        }
        return canvas;
    }

    protected _videoReady() {
        this.readyState = 2;
    }

}
