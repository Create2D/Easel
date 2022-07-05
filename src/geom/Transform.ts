export default class Transform
{
    public x: number = 0;
    public y: number = 0;
    public scaleX: number = 1;
    public scaleY: number = 1;
    public rotation: number = 0;
    public skewX: number = 0;
    public skewY: number = 0;
    public regX: number = 0;
    public regY: number = 0;

    constructor() {
    }

    public get scale(): number {
        return Math.min(this.scaleX, this.scaleY);
    }
    public set scale(s: number) {
        this.scaleX = this.scaleY = s;
    }

    public static readonly IDENTITY: Transform = new Transform();
    public static identity(): Transform {
       return new Transform();
    }
}