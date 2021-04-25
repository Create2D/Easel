export default function createCanvas(width = 1, height = 1) {
    let c;
    if ((window as any).createCanvas) {
        c = (window as any).createCanvas();
    }
    if (window.document !== undefined && window.document.createElement !== undefined) {
        c = document.createElement("canvas");
    }
    if (c !== undefined) {
        c.width = width;
        c.height = height;
        return c;
    }

    throw "Canvas not supported in this environment.";
}