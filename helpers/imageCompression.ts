import imageCompression from "browser-image-compression";

export async function compressImage(file: File) {
    const compressed = await imageCompression(file, {
        maxSizeMB: 0.6,
        maxWidthOrHeight: 1400,
        useWebWorker: true,
        initialQuality: 0.8,
    });
    return compressed;
}
