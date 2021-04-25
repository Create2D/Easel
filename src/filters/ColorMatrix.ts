export default class ColorMatrix extends Array<number> {
    constructor(brightness: number = 0, contrast: number = 0, saturation: number = 0, hue: number = 0) {
        super();
        this.setColor(brightness, contrast, saturation, hue);
    }

    /**
     * Array of delta values for contrast calculations.
     **/
    static DELTA_INDEX: ColorMatrix = [
        0, 0.01, 0.02, 0.04, 0.05, 0.06, 0.07, 0.08, 0.1, 0.11,
        0.12, 0.14, 0.15, 0.16, 0.17, 0.18, 0.20, 0.21, 0.22, 0.24,
        0.25, 0.27, 0.28, 0.30, 0.32, 0.34, 0.36, 0.38, 0.40, 0.42,
        0.44, 0.46, 0.48, 0.5, 0.53, 0.56, 0.59, 0.62, 0.65, 0.68,
        0.71, 0.74, 0.77, 0.80, 0.83, 0.86, 0.89, 0.92, 0.95, 0.98,
        1.0, 1.06, 1.12, 1.18, 1.24, 1.30, 1.36, 1.42, 1.48, 1.54,
        1.60, 1.66, 1.72, 1.78, 1.84, 1.90, 1.96, 2.0, 2.12, 2.25,
        2.37, 2.50, 2.62, 2.75, 2.87, 3.0, 3.2, 3.4, 3.6, 3.8,
        4.0, 4.3, 4.7, 4.9, 5.0, 5.5, 6.0, 6.5, 6.8, 7.0,
        7.3, 7.5, 7.8, 8.0, 8.4, 8.7, 9.0, 9.4, 9.6, 9.8,
        10.0
    ] as ColorMatrix;

    /**
     * Identity matrix values.
     **/
    static IDENTITY_MATRIX: ColorMatrix = [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 1, 0,
        0, 0, 0, 0, 1
    ] as ColorMatrix;

    /**
     * The constant length of a color matrix.
     **/
    static LENGTH = ColorMatrix.IDENTITY_MATRIX.length;

    /**
     * Create an instance of ColorMatrix using the Sepia preset
     **/
    public static createSepiaPreset(): ColorMatrix {
        return (new ColorMatrix()).copy([
            0.4977, 0.9828, 0.1322, 0.0000, 14,
            0.4977, 0.9828, 0.1322, 0.0000, -14,
            0.4977, 0.9828, 0.1322, 0.0000, -47,
            0.0000, 0.0000, 0.0000, 1.0000, 0,
            0, 0, 0, 0, 1
        ] as ColorMatrix);
    }

    /**
     * Create an instance of ColorMatrix using an invert color preset
     **/
    public static createInvertPreset(): ColorMatrix {
        return (new ColorMatrix()).copy([
            -1.0000, 0.0000, 0.0000, 0.0000, 255,
            0.0000, -1.0000, 0.0000, 0.0000, 255,
            0.0000, 0.0000, -1.0000, 0.0000, 255,
            0.0000, 0.0000, 0.0000, 1.0000, 0,
            0, 0, 0, 0, 1
        ] as ColorMatrix);
    }

    /**
     * Create an instance of ColorMatrix using the Greyscale preset.
     * Note: -100 saturation accounts for perceived brightness, the greyscale preset treats all channels equally.
     **/
    public static createGreyscalePreset(): ColorMatrix {
        return (new ColorMatrix()).copy([
            0.3333, 0.3334, 0.3333, 0.0000, 0,
            0.3333, 0.3334, 0.3333, 0.0000, 0,
            0.3333, 0.3334, 0.3333, 0.0000, 0,
            0.0000, 0.0000, 0.0000, 1.0000, 0,
            0, 0, 0, 0, 1
        ] as ColorMatrix);
    }

    /**
     * Resets the instance with the specified values.
     **/
    public setColor(brightness: number = 0, contrast: number = 0, saturation: number = 0, hue: number = 0): ColorMatrix {
        return this.reset().adjustColor(brightness, contrast, saturation, hue);
    }

    /**
     * Resets the matrix to identity values.
     **/
    public reset(): ColorMatrix {
        return this.copy(ColorMatrix.IDENTITY_MATRIX);
    }

    /**
     * Shortcut method to adjust brightness, contrast, saturation and hue.
     * Equivalent to calling adjustHue(hue), adjustContrast(contrast),
     * adjustBrightness(brightness), adjustSaturation(saturation), in that order.
     **/
    public adjustColor(brightness: number = 0, contrast: number = 0, saturation: number = 0, hue: number = 0): ColorMatrix {
        this.adjustHue(hue);
        this.adjustContrast(contrast);
        this.adjustBrightness(brightness);
        return this.adjustSaturation(saturation);
    }

    /**
     * Adjusts the brightness of pixel color by adding the specified value to the red, green and blue channels.
     * Positive values will make the image brighter, negative values will make it darker.
     **/
    public adjustBrightness(value: number): ColorMatrix {
        if (value == 0 || isNaN(value)) {
            return this;
        }
        value = ColorMatrix._cleanValue(value, 255);
        this._multiplyMatrix([
            1, 0, 0, 0, value,
            0, 1, 0, 0, value,
            0, 0, 1, 0, value,
            0, 0, 0, 1, 0,
            0, 0, 0, 0, 1
        ] as ColorMatrix);
        return this;
    }

    public set hue(value: number) {
        this.adjustBrightness(value);
    }

    /**
     * Adjusts the colour offset of pixel color by adding the specified value to the red, green and blue channels.
     * Positive values will make the image brighter, negative values will make it darker.
     **/
    public adjustOffset(r: number, g: number, b: number): ColorMatrix {
        this[4] = ColorMatrix._cleanValue(this[4] + r, 255);
        this[9] = ColorMatrix._cleanValue(this[9] + g, 255);
        this[14] = ColorMatrix._cleanValue(this[14] + b, 255);
        return this;
    }

    /**
     * Adjusts the contrast of pixel color.
     * Positive values will increase contrast, negative values will decrease contrast.
     **/
    public adjustContrast(value: number): ColorMatrix {
        if (value == 0 || isNaN(value)) {
            return this;
        }
        value = ColorMatrix._cleanValue(value, 100);
        let x;
        if (value < 0) {
            x = 127 + value / 100 * 127;
        } else {
            x = value % 1;
            if (x == 0) {
                x = ColorMatrix.DELTA_INDEX[value];
            } else {
                x = ColorMatrix.DELTA_INDEX[(value << 0)] * (1 - x) + ColorMatrix.DELTA_INDEX[(value << 0) + 1] * x; // use linear interpolation for more granularity.
            }
            x = x * 127 + 127;
        }
        this._multiplyMatrix([
            x / 127, 0, 0, 0, 0.5 * (127 - x),
            0, x / 127, 0, 0, 0.5 * (127 - x),
            0, 0, x / 127, 0, 0.5 * (127 - x),
            0, 0, 0, 1, 0,
            0, 0, 0, 0, 1
        ] as ColorMatrix);
        return this;
    }

    /**
     * Adjusts the color saturation of the pixel.
     * Positive values will increase saturation, negative values will decrease saturation (trend towards greyscale).
     **/
    public adjustSaturation(value: number): ColorMatrix {
        if (value == 0) {
            return this;
        }
        value = ColorMatrix._cleanValue(value, 100);
        let x = 1 + ((value > 0) ? 3 * value / 100 : value / 100);
        const lumR = 0.3086;
        const lumG = 0.6094;
        const lumB = 0.0820;
        this._multiplyMatrix([
            lumR * (1 - x) + x, lumG * (1 - x), lumB * (1 - x), 0, 0,
            lumR * (1 - x), lumG * (1 - x) + x, lumB * (1 - x), 0, 0,
            lumR * (1 - x), lumG * (1 - x), lumB * (1 - x) + x, 0, 0,
            0, 0, 0, 1, 0,
            0, 0, 0, 0, 1
        ] as ColorMatrix);
        return this;
    }


    /**
     * Adjusts the hue of the pixel color.
     **/
    public adjustHue(value: number): ColorMatrix {
        if (value == 0) {
            return this;
        }
        value = ColorMatrix._cleanValue(value, 180) / 180 * Math.PI;
        const cosVal = Math.cos(value);
        const sinVal = Math.sin(value);
        const lumR = 0.213;
        const lumG = 0.715;
        const lumB = 0.072;
        this._multiplyMatrix([
            lumR + cosVal * (1 - lumR) + sinVal * (-lumR), lumG + cosVal * (-lumG) + sinVal * (-lumG), lumB + cosVal * (-lumB) + sinVal * (1 - lumB), 0, 0,
            lumR + cosVal * (-lumR) + sinVal * (0.143), lumG + cosVal * (1 - lumG) + sinVal * (0.140), lumB + cosVal * (-lumB) + sinVal * (-0.283), 0, 0,
            lumR + cosVal * (-lumR) + sinVal * (-(1 - lumR)), lumG + cosVal * (-lumG) + sinVal * (lumG), lumB + cosVal * (1 - lumB) + sinVal * (lumB), 0, 0,
            0, 0, 0, 1, 0,
            0, 0, 0, 0, 1
        ] as ColorMatrix);
        return this;
    }

    /**
     * Concatenates (multiplies) the specified matrix with this one.
     **/
    public concat(matrix: ColorMatrix): ColorMatrix {
        matrix = ColorMatrix._fixMatrix(matrix);
        if (matrix.length != ColorMatrix.LENGTH) {
            return this;
        }
        this._multiplyMatrix(matrix);
        return this;
    }

    /**
     * Returns a clone of this ColorMatrix.
     **/
    public clone(): ColorMatrix {
        return (new ColorMatrix()).copy(this);
    }

    /**
     * Return a length 25 (5x5) array instance containing this matrix's values.
     **/
    public toArray(): Array<number> {
        const arr = [];
        for (let i = 0, l = ColorMatrix.LENGTH; i < l; i++) {
            arr[i] = this[i];
        }
        return arr;
    }

    /**
     * Copy the specified matrix's values to this matrix.
     **/
    public copy(matrix: ColorMatrix): ColorMatrix {
        const l = ColorMatrix.LENGTH;
        for (let i = 0; i < l; i++) {
            this[i] = matrix[i];
        }
        return this;
    }

    /**
     * Returns a string representation of this object.
     **/
    public toString(): string {
        let sz = "";
        sz += "    " + this[0].toFixed(4) + ", " + this[1].toFixed(4) + ", " + this[2].toFixed(4) + ", " + this[3].toFixed(4) + ", " + (this[4] | 0) + ",\n";
        sz += "    " + this[5].toFixed(4) + ", " + this[6].toFixed(4) + ", " + this[7].toFixed(4) + ", " + this[8].toFixed(4) + ", " + (this[9] | 0) + ",\n";
        sz += "    " + this[10].toFixed(4) + ", " + this[11].toFixed(4) + ", " + this[12].toFixed(4) + ", " + this[13].toFixed(4) + ", " + (this[14] | 0) + ",\n";
        sz += "    " + this[15].toFixed(4) + ", " + this[16].toFixed(4) + ", " + this[17].toFixed(4) + ", " + this[18].toFixed(4) + ", " + (this[19] | 0) + ",\n";
        sz += "    " + (this[20] | 0) + ", " + (this[21] | 0) + ", " + (this[22] | 0) + ", " + (this[23] | 0) + ", " + (this[24] | 0) + "\n";
        return "[ColorMatrix] {\n" + sz + "}";
    }

    private _multiplyMatrix(matrix: ColorMatrix): void {
        let i, j, k, col = [];

        for (i = 0; i < 5; i++) {
            for (j = 0; j < 5; j++) {
                col[j] = this[j + i * 5];
            }
            for (j = 0; j < 5; j++) {
                let val = 0;
                for (k = 0; k < 5; k++) {
                    val += matrix[j + k * 5] * col[k];
                }
                this[j + i * 5] = val;
            }
        }
    }

    /**
     * Make sure values are within the specified range, hue has a limit of 180, brightness is 255, others are 100.
     **/
    private static _cleanValue(value: number, limit: number): number {
        return Math.min(limit, Math.max(-limit, value));
    }

    /**
     * Makes sure matrixes are 5x5 (25 long).
     **/
    private static _fixMatrix(matrix: ColorMatrix): ColorMatrix {
        if (!matrix) {
            matrix = ColorMatrix.IDENTITY_MATRIX;
        } else if (matrix.length < ColorMatrix.LENGTH) {
            matrix = matrix.slice(0, matrix.length).concat(ColorMatrix.IDENTITY_MATRIX.slice(matrix.length, ColorMatrix.LENGTH)) as ColorMatrix;
        } else if (matrix.length > ColorMatrix.LENGTH) {
            matrix = matrix.slice(0, ColorMatrix.LENGTH) as ColorMatrix;
        }
        return matrix;
    }
}