import { getFunctions, httpsCallable } from "firebase/functions";
import app from "@/lib/firebase";
import { CloudImageItem, SignedPayload } from "@/types";

type SignResponse = {
    cloudName: string;
    apiKey: string;
    timestamp: number;
    signature: string;
    folder?: string;
    publicId?: string; 
};

type UploadResult = {
    secure_url: string;
    public_id: string;
    width?: number;
    height?: number;
    format?: string;
    bytes?: number;
};

export async function signCloudinaryUpload(storeId: string, opts?: { folder?: string; publicId?: string; resourceType?: "image" | "video" }) {
    const functions = getFunctions(app, "us-central1");
    const fn = httpsCallable(functions, "cloudinarySignUpload");

    const res = await fn({
        storeId,
        folder: opts?.folder,
        publicId: opts?.publicId,
        resourceType: opts?.resourceType ?? "image",
    });

    return res.data as SignResponse;
}

export async function uploadToCloudinarySigned(file: File, sign: SignResponse, resourceType: "image" | "video" = "image") {
    const endpoint =
        resourceType === "video"
            ? `https://api.cloudinary.com/v1_1/${sign.cloudName}/video/upload`
            : `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`;

    const form = new FormData();
    form.append("file", file);
    form.append("api_key", sign.apiKey);
    form.append("timestamp", String(sign.timestamp));
    form.append("signature", sign.signature);

    if (sign.folder) form.append("folder", sign.folder);
    if (sign.publicId) form.append("public_id", sign.publicId);

    // súper recomendado para optimizar entrega en Cloudinary:
    form.append("overwrite", "true");

    const r = await fetch(endpoint, { method: "POST", body: form });
    if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Cloudinary upload failed: ${txt}`);
    }
    return (await r.json()) as UploadResult;
}

export async function deleteCloudinaryAsset(storeId: string, publicId: string, resourceType: "image" | "video" = "image") {
    const functions = getFunctions(app, "us-central1");
    const fn = httpsCallable(functions, "cloudinaryDeleteAsset");
    const res = await fn({ storeId, publicId, resourceType });
    return res.data as any;
}

export function uploadToCloudinaryWithProgress(
    endpoint: string,
    form: FormData,
    onProgress?: (pct: number) => void
): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", endpoint);

        xhr.upload.onprogress = (evt) => {
            if (!evt.lengthComputable) return;
            const pct = Math.round((evt.loaded / evt.total) * 100);
            onProgress?.(pct);
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
            } else {
                reject(new Error(xhr.responseText || "Upload failed"));
            }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(form);
    });
}

export function cldImg(
    url: string,
    opts?: {
        w?: number;
        h?: number;
        crop?: "fill" | "limit";
        q?: string;        // "auto" recomendado
    }
) {
    if (!url) return url;

    const w = opts?.w ?? 600;
    const h = opts?.h;
    const crop = opts?.crop ?? "limit";
    const q = opts?.q ?? "auto";

    const parts = url.split("/upload/");
    if (parts.length !== 2) return url;

    const t = [
        "f_auto",          // ✅ cloudinary elige webp/avif si soporta
        `q_${q}`,          // ✅ compresión inteligente
        "dpr_auto",        // ✅ retina sin pedir imágenes gigantes
        crop === "fill" ? "c_fill" : "c_limit",
        `w_${w}`,
        h ? `h_${h}` : null,
    ]
        .filter(Boolean)
        .join(",");

    return `${parts[0]}/upload/${t}/${parts[1]}`;
}


export async function uploadImageToCloudinary(storeId: string, file: File): Promise<CloudImageItem> {
    // ✅ usa el mismo app y la misma región que el resto
    const functions = getFunctions(app, "us-central1");
    const sign = httpsCallable(functions, "cloudinarySignUpload");

    const signed = (await sign({ storeId, kind: "products" })).data as SignedPayload;

    const form = new FormData();
    form.append("file", file);
    form.append("api_key", signed.apiKey);
    form.append("timestamp", String(signed.timestamp));
    form.append("signature", signed.signature);
    form.append("folder", signed.folder);

    // ✅ NO envíes overwrite si viene undefined
    // y si viene boolean, conviértelo a "true"/"false"
    if (typeof (signed as any).overwrite === "boolean") {
        form.append("overwrite", (signed as any).overwrite ? "true" : "false");
    } else {
        // opcional: si quieres SIEMPRE overwrite true
        form.append("overwrite", "true");
    }

    const endpoint = `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`;

    const res = await fetch(endpoint, { method: "POST", body: form });
    const data = await res.json();

    if (!res.ok) {
        // importante para ver el error real de cloudinary
        throw new Error(data?.error?.message || JSON.stringify(data));
    }

    return {
        url: data.secure_url,
        publicId: data.public_id,
        width: data.width,
        height: data.height,
        bytes: data.bytes,
    };
}
