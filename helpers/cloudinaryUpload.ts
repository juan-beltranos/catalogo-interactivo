import { getFunctions, httpsCallable } from "firebase/functions";
import app from "@/lib/firebase";
import { CloudImageItem, SignedPayload, UploadResult } from "@/types";

const functions = getFunctions(app, "us-central1");

export async function signCloudinaryUpload(params: {
    storeId: string;
    kind?: "products" | "videos";
}): Promise<SignedPayload> {
    const fn = httpsCallable(functions, "cloudinarySignUpload");
    const res = await fn({ storeId: params.storeId, kind: params.kind ?? "products" });
    return res.data as SignedPayload;
}

export async function uploadToCloudinarySigned(params: {
    file: File;
    signed: SignedPayload;
    resourceType?: "image" | "video";
    onProgress?: (pct: number) => void;
}): Promise<UploadResult> {
    const { file, signed, resourceType = "image", onProgress } = params;

    const endpoint =
        resourceType === "video"
            ? `https://api.cloudinary.com/v1_1/${signed.cloudName}/video/upload`
            : `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`;

    const form = new FormData();
    form.append("file", file);
    form.append("api_key", signed.apiKey);
    form.append("timestamp", String(signed.timestamp));
    form.append("signature", signed.signature);
    form.append("folder", signed.folder);
    form.append("overwrite", signed.overwrite ? "true" : "false");

    if (onProgress) {
        return await uploadToCloudinaryWithProgress(endpoint, form, onProgress);
    }

    const r = await fetch(endpoint, { method: "POST", body: form });
    const data = await r.json();

    if (!r.ok) {
        throw new Error(data?.error?.message || JSON.stringify(data));
    }

    return data as UploadResult;
}

export async function uploadImageToCloudinary(
    storeId: string,
    file: File,
    onProgress?: (pct: number) => void
): Promise<CloudImageItem> {
    const signed = await signCloudinaryUpload({ storeId, kind: "products" });

    const data = await uploadToCloudinarySigned({
        file,
        signed,
        resourceType: "image",
        onProgress,
    });

    return {
        url: data.secure_url,
        publicId: data.public_id,
        width: data.width,
        height: data.height,
        bytes: data.bytes,
    };
}

export async function deleteCloudinaryAsset(
    storeId: string,
    publicId: string,
    resourceType: "image" | "video" = "image"
) {
    const fn = httpsCallable(functions, "cloudinaryDeleteAsset");
    const res = await fn({ storeId, publicId, resourceType });
    return res.data as any;
}

export function uploadToCloudinaryWithProgress(
    endpoint: string,
    form: FormData,
    onProgress: (pct: number) => void
): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", endpoint);

        xhr.upload.onprogress = (evt) => {
            if (!evt.lengthComputable) return;
            const pct = Math.round((evt.loaded / evt.total) * 100);
            onProgress(pct);
        };

        xhr.onload = () => {
            try {
                const json = JSON.parse(xhr.responseText || "{}");
                if (xhr.status >= 200 && xhr.status < 300) resolve(json);
                else reject(new Error(json?.error?.message || xhr.responseText || "Upload failed"));
            } catch {
                reject(new Error(xhr.responseText || "Upload failed"));
            }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(form);
    });
}

export function cldImg(
    url: string,
    opts?: { w?: number; h?: number; crop?: "fill" | "limit"; q?: string }
) {
    if (!url) return url;

    const w = opts?.w ?? 600;
    const h = opts?.h;
    const crop = opts?.crop ?? "limit";
    const q = opts?.q ?? "auto";

    const parts = url.split("/upload/");
    if (parts.length !== 2) return url;

    const t = [
        "f_auto",
        `q_${q}`,
        "dpr_auto",
        crop === "fill" ? "c_fill" : "c_limit",
        `w_${w}`,
        h ? `h_${h}` : null,
    ]
        .filter(Boolean)
        .join(",");

    return `${parts[0]}/upload/${t}/${parts[1]}`;
}
