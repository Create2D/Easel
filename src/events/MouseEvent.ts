import {Event} from "@create2d/core";

import DisplayObject from "../display/DisplayObject";

export default class MouseEvent extends Event {
    constructor(type: string, bubbles: boolean, cancelable: boolean,
                public stageX: number,
                public stageY: number,
                private nativeEvent: any,
                private pointerID: number|string,
                private primary: boolean,
                public rawX: number,
                public rawY: number,
                private relatedTarget?: DisplayObject) {
        super(type, bubbles, cancelable);

        this.rawX = (rawX==null)?stageX:rawX;
        this.rawY = (rawY==null)?stageY:rawY;
    }

    public get localX(): number {
        return this.currentTarget ? this.currentTarget.globalToLocal(this.rawX, this.rawY).x : 0;
    }

    public get localY(): number {
        return this.currentTarget ? this.currentTarget.globalToLocal(this.rawX, this.rawY).y : 0;
    }

    public get isTouch(): boolean {
        return this.pointerID !== -1;
    }

    public clone(): MouseEvent {
        return new MouseEvent(this.type, this.bubbles, this.cancelable, this.stageX, this.stageY, this.nativeEvent, this.pointerID, this.primary, this.rawX, this.rawY);
    }

    public toString(): string {
        return `[MouseEvent (type=${this.type} stageX=${this.stageX} stageY=${this.stageY})]`;
    }
}