import Shadow from "../display/Shadow";

import Matrix2D from "./Matrix2D";

export default class DisplayProps {
    constructor(
        private _visible?: boolean,
        private _alpha?: number,
        private _shadow?: Shadow,
        private _compositeOperation?: CompositeOperation,
        private _matrix?: Matrix2D
    ) {}

    public setValues(visible?: boolean, alpha?: number, shadow?: Shadow, compositeOperation?: CompositeOperation, matrix?: Matrix2D): DisplayProps {
        this._visible = !!visible;
        this._alpha = alpha == null ? 1 : alpha;
        this._shadow = shadow;
        this._compositeOperation = compositeOperation;
        this._matrix = matrix || (this._matrix && this._matrix.identity()) || new Matrix2D();
        return this;
    }

    public get visible(): boolean {
        return !!this._visible;
    }
    public set alpha(value: number) {
        this._alpha = this._alpha ? value : undefined;
    }
    public get alpha(): number {
        return this._alpha || 1;
    }
    public get matrix(): Matrix2D {
        return this._matrix || (this._matrix = Matrix2D.identity());
    }

    public append(visible?: boolean, alpha?: number, shadow?: Shadow, compositeOperation?: CompositeOperation, matrix?: Matrix2D): DisplayProps {
        this.alpha *= alpha || 1 ;
        this._shadow = shadow || this._shadow;
        this._compositeOperation = compositeOperation || this._compositeOperation;
        this._visible = this._visible && visible;
        matrix && this.matrix.appendMatrix(matrix);
        return this;
    }

    public prepend(visible?: boolean, alpha?: number, shadow?: Shadow, compositeOperation?: CompositeOperation, matrix?: Matrix2D): DisplayProps {
        this.alpha *= alpha || 1;
        this._shadow = this._shadow || shadow;
        this._compositeOperation = this._compositeOperation || compositeOperation;
        this._visible = this._visible && visible;
        matrix && this.matrix.prependMatrix(matrix);
        return this;
    }

    public identity(): DisplayProps {
        this._visible = true;
        this._alpha = 1;
        this._shadow = this._compositeOperation = undefined;
        this._matrix = Matrix2D.identity();
        return this;
    }

    public toString(): string {
        return `[DisplayProps (
            ${this.matrix.toString()}
        )]`;
    }

    public clone(): DisplayProps {
        return new DisplayProps(this._visible, this._alpha, this._shadow, this._compositeOperation, this.matrix.clone());
    }
}
