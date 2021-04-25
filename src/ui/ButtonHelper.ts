import DisplayObject from "../display/DisplayObject";
import MovieClip from "../display/MovieClip";
import Sprite from "../display/Sprite";

export default class ButtonHelper {
    /**
     * The target for this button helper.
     **/
    public readonly target?: MovieClip | Sprite;

    /**
     * The label name or frame number to display when the user mouses out of the target. Defaults to "over".
     **/
    public overLabel?: string | number;

    /**
     * The label name or frame number to display when the user mouses over the target. Defaults to "out".
     **/
    public outLabel?: string | number;

    /**
     * The label name or frame number to display when the user presses on the target. Defaults to "down".
     **/
    public downLabel?: string | number;

    /**
     * If true, then ButtonHelper will call gotoAndPlay, if false, it will use gotoAndStop. Default is false.
     **/
    public play?: boolean;

    private _isPressed = false;
    private _isOver = false;
    private _enabled = false;

    // ToDo remove
    private __reset: any;

    constructor(target: MovieClip | Sprite, outLabel: string = "out", overLabel: string = "over", downLabel: string = "down", play: boolean = false, hitArea?: DisplayObject, hitLabel?: string) {
        if (!target.addEventListener) {
            return;
        }

        this.target = target;
        this.outLabel = outLabel;
        this.overLabel = overLabel;
        this.downLabel = downLabel;
        this.play = play;


        // setup:
        if (target instanceof MovieClip) {
            target.mouseChildren = false; // prevents issues when children are removed from the display list when state changes.
        }
        this.enabled = true;
        this.handleEvent({});
        if (hitArea && hitArea instanceof MovieClip) {
            if (hitLabel) {
                hitArea.actionsEnabled = false;
                hitArea.gotoAndStop && hitArea.gotoAndStop(hitLabel);
            }
            target.hitArea = hitArea;
        }
    }

    public set enabled(value: boolean) {
        if (value == this._enabled) {
            return;
        }
        const o: any = this.target;
        this._enabled = value;
        if (value) {
            o.cursor = "pointer";
            o.addEventListener("rollover", this);
            o.addEventListener("rollout", this);
            o.addEventListener("mousedown", this);
            o.addEventListener("pressup", this);
            if (o._reset) {
                o.__reset = o._reset;
                o._reset = this._reset;
            }
        } else {
            o.cursor = null;
            o.removeEventListener("rollover", this);
            o.removeEventListener("rollout", this);
            o.removeEventListener("mousedown", this);
            o.removeEventListener("pressup", this);
            if (o.__reset) {
                o._reset = o.__reset;
                delete (o.__reset);
            }
        }
    }

    public get enabled(): boolean {
        return this._enabled;
    }

    public get paused(): boolean {
        return !this.play;
    }

    public set paused(pause: boolean) {
        this.play = !pause;
    }

    public toString(): string {
        return "[ButtonHelper]";
    }

    protected handleEvent(evt: any) {
        let label, t = this.target, type = evt.type;
        if (type == "mousedown") {
            this._isPressed = true;
            label = this.downLabel;
        } else if (type == "pressup") {
            this._isPressed = false;
            label = this._isOver ? this.overLabel : this.outLabel;
        } else if (type == "rollover") {
            this._isOver = true;
            label = this._isPressed ? this.downLabel : this.overLabel;
        } else { // rollout and default
            this._isOver = false;
            label = this._isPressed ? this.overLabel : this.outLabel;
        }
        if (t && label) {
            if (this.play) {
                t.gotoAndPlay && t.gotoAndPlay(label);
            } else {
                t.gotoAndStop && t.gotoAndStop(label);
            }
        }
    }

    /**
     * Injected into target. Preserves the paused state through a reset.
     **/
    private _reset() {
        // TODO: explore better ways to handle this issue. This is hacky & disrupts object signatures.
        let p = this.paused;
        this.__reset();
        this.paused = p;
    }

}