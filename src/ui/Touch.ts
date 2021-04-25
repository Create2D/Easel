import Stage from "../display/Stage";

interface TouchStage extends Stage {
    __touch?: {
        f?: (...args: any)=>any,
        pointers: any,
        multitouch: boolean,
        preventDefault: boolean,
        count: number,
        activeIDs?: {[k: string]: boolean}
    };
}

export default class Touch {

    private constructor() {
        throw "Touch cannot be instantiated";
    }


// public static methods:
    /**
     * Returns `true` if touch is supported in the current browser.
     **/
    public static isSupported(): boolean {
        return !!(('ontouchstart' in window) // iOS & Android
            || (window.MSPointerEvent && window.navigator.msMaxTouchPoints > 0) // IE10
            || (window.PointerEvent && window.navigator.maxTouchPoints > 0)); // IE11+
    }

    /**
     * Enables touch interaction for the specified EaselJS {{#crossLink "Stage"}}{{/crossLink}}. Currently supports iOS
     * (and compatible browsers, such as modern Android browsers), and IE10/11. Supports both single touch and
     * multi-touch modes. Extends the EaselJS {{#crossLink "MouseEvent"}}{{/crossLink}} model, but without support for
     * double click or over/out events. See the MouseEvent {{#crossLink "MouseEvent/pointerId:property"}}{{/crossLink}}
     * for more information.
     **/
    public static enable(stage: TouchStage, singleTouch: boolean = false, allowDefault: boolean = false) {
        if (!stage || !stage.canvas || !Touch.isSupported()) {
            return false;
        }
        if (stage.__touch) {
            return true;
        }

        // inject required properties on stage:
        stage.__touch = {pointers: {}, multitouch: !singleTouch, preventDefault: !allowDefault, count: 0};

        // note that in the future we may need to disable the standard mouse event model before adding
        // these to prevent duplicate calls. It doesn't seem to be an issue with iOS devices though.
        if ('ontouchstart' in window) {
            Touch._IOS_enable(stage);
        } else if (window.PointerEvent || window.MSPointerEvent) {
            Touch._IE_enable(stage);
        }
        return true;
    }

    /**
     * Removes all listeners that were set up when calling `Touch.enable()` on a stage.
     **/
    public static disable(stage: TouchStage) {
        if (!stage) {
            return;
        }
        if ('ontouchstart' in window) {
            Touch._IOS_disable(stage);
        } else if (window.PointerEvent || window.MSPointerEvent) {
            Touch._IE_disable(stage);
        }

        delete stage.__touch;
    }

    protected static _IOS_enable(stage: TouchStage) {
        const canvas = stage.canvas;
        const f = stage.__touch!.f = (e) => {
            Touch._IOS_handleEvent(stage, e);
        };
        canvas.addEventListener("touchstart", f, false);
        canvas.addEventListener("touchmove", f, false);
        canvas.addEventListener("touchend", f, false);
        canvas.addEventListener("touchcancel", f, false);
    }

    protected static _IOS_disable(stage: TouchStage) {
        let canvas = stage.canvas;
        if (!canvas) {
            return;
        }
        let f = stage.__touch!.f;

        if (!f) {
            return;
        }
        canvas.removeEventListener("touchstart", f, false);
        canvas.removeEventListener("touchmove", f, false);
        canvas.removeEventListener("touchend", f, false);
        canvas.removeEventListener("touchcancel", f, false);
    }

    protected static _IOS_handleEvent(stage: TouchStage, e: any) {
        if (!stage) {
            return;
        }
        if (stage.__touch!.preventDefault) {
            e.preventDefault && e.preventDefault();
        }
        const touches = e.changedTouches;
        const type = e.type;
        for (let i = 0, l = touches.length; i < l; i++) {
            const touch = touches[i];
            const id = touch.identifier;
            if (touch.target != stage.canvas) {
                continue;
            }

            if (type === "touchstart") {
                this._handleStart(stage, id, e, touch.pageX, touch.pageY);
            } else if (type === "touchmove") {
                this._handleMove(stage, id, e, touch.pageX, touch.pageY);
            } else if (type === "touchend" || type === "touchcancel") {
                this._handleEnd(stage, id, e);
            }
        }
    }

    protected static _IE_enable(stage: TouchStage) {
        const canvas = stage.canvas;
        const f = stage.__touch!.f = (e) => {
            Touch._IE_handleEvent(stage, e);
        };

        if (window.PointerEvent === undefined) {
            canvas.addEventListener("MSPointerDown", f, false);
            window.addEventListener("MSPointerMove", f, false);
            window.addEventListener("MSPointerUp", f, false);
            window.addEventListener("MSPointerCancel", f, false);
            if (stage.__touch!.preventDefault) {
                (canvas.style as any).msTouchAction = "none";
            }
        } else {
            canvas.addEventListener("pointerdown", f, false);
            window.addEventListener("pointermove", f, false);
            window.addEventListener("pointerup", f, false);
            window.addEventListener("pointercancel", f, false);
            if (stage.__touch!.preventDefault) {
                canvas.style.touchAction = "none";
            }

        }
        stage.__touch!.activeIDs = {};
    }

    protected static _IE_disable(stage: TouchStage) {
        const f = stage.__touch!.f;

        if (!f) {
            return;
        }

        if (window.PointerEvent === undefined) {
            window.removeEventListener("MSPointerMove", f, false);
            window.removeEventListener("MSPointerUp", f, false);
            window.removeEventListener("MSPointerCancel", f, false);
            if (stage.canvas) {
                stage.canvas.removeEventListener("MSPointerDown", f, false);
            }
        } else {
            window.removeEventListener("pointermove", f, false);
            window.removeEventListener("pointerup", f, false);
            window.removeEventListener("pointercancel", f, false);
            if (stage.canvas) {
                stage.canvas.removeEventListener("pointerdown", f, false);
            }
        }
    }

    protected static _IE_handleEvent(stage: TouchStage, e: any) {
        if (!stage) {
            return;
        }
        if (stage.__touch!.preventDefault) {
            e.preventDefault && e.preventDefault();
        }
        const type = e.type;
        const id = e.pointerId;
        const ids = stage.__touch!.activeIDs;

        if (type === "MSPointerDown" || type === "pointerdown") {
            if (e.srcElement != stage.canvas) {
                return;
            }
            ids![id] = true;
            this._handleStart(stage, id, e, e.pageX, e.pageY);
        } else if (ids![id]) { // it's an id we're watching
            if (type === "MSPointerMove" || type === "pointermove") {
                this._handleMove(stage, id, e, e.pageX, e.pageY);
            } else if (type === "MSPointerUp" || type === "MSPointerCancel"
                || type === "pointerup" || type === "pointercancel") {
                delete (ids![id]);
                this._handleEnd(stage, id, e);
            }
        }
    }

    protected static _handleStart(stage: TouchStage, id: string|number, e: any, x: number, y: number) {
        const props = stage.__touch;
        if (!props!.multitouch && props!.count) {
            return;
        }
        const ids = props!.pointers;
        if (ids[id]) {
            return;
        }
        ids[id] = true;
        props!.count++;
        stage._handlePointerDown(id, e, x, y);
    }

    protected static _handleMove(stage: TouchStage, id: string|number, e: any, x: number, y: number) {
        if (!stage.__touch!.pointers[id]) {
            return;
        }
        stage._handlePointerMove(id, e, x, y);
    }

    protected static _handleEnd(stage: TouchStage, id: string|number, e: any) {
        // TODO: cancel should be handled differently for proper UI (ex. an up would trigger a click, a cancel would more closely resemble an out).
        const props = stage.__touch;
        if (!props) {
            return;
        }
        const ids = props.pointers;
        if (!ids[id]) {
            return;
        }
        props.count--;
        stage._handlePointerUp(id, e, true);
        delete (ids[id]);
    }
}