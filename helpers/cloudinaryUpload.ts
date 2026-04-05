import { CloudImageItem, UploadResult } from "@/types";

type CloudinaryResourceType = "image" | "video";

type UploadUnsignedParams = {
    file: File | Blob;
    cloudName: string;
    uploadPreset: string;
    folder?: string;
    resourceType?: CloudinaryResourceType;
    fileName?: string;
    tags?: string[];
    context?: Record<string, string>;
    onProgress?: (pct: number) => void;
};

function buildCloudinaryEndpoint(
    cloudName: string,
    resourceType: CloudinaryResourceType = "image"
) {
    return `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
}

function appendIfValue(form: FormData, key: string, value: unknown) {
    if (value === undefined || value === null || value === "") return;
    form.append(key, String(value));
}

export async function uploadToCloudinaryUnsigned({
    file,
    cloudName,
    uploadPreset,
    folder,
    resourceType = "image",
    fileName,
    tags,
    context,
    onProgress,
}: UploadUnsignedParams): Promise<UploadResult> {
    const endpoint = buildCloudinaryEndpoint(cloudName, resourceType);

    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", uploadPreset);

    appendIfValue(form, "folder", folder);

    if (fileName) {
        form.append("public_id", fileName);
        form.append("use_filename", "true");
        form.append("unique_filename", "true");
    }

    if (tags?.length) {
        form.append("tags", tags.join(","));
    }

    if (context && Object.keys(context).length) {
        const contextString = Object.entries(context)
            .map(([k, v]) => `${k}=${v}`)
            .join("|");
        form.append("context", contextString);
    }

    if (onProgress) {
        return await uploadToCloudinaryWithProgress(endpoint, form, onProgress);
    }

    const r = await fetch(endpoint, {
        method: "POST",
        body: form,
    });

    const data = await r.json();

    if (!r.ok) {
        throw new Error(data?.error?.message || "Error subiendo archivo a Cloudinary");
    }

    return data as UploadResult;
}

export async function uploadImageToCloudinary(params: {
    file: File;
    cloudName: string;
    uploadPreset: string;
    folder?: string;
    onProgress?: (pct: number) => void;
}): Promise<CloudImageItem> {
    const data = await uploadToCloudinaryUnsigned({
        file: params.file,
        cloudName: params.cloudName,
        uploadPreset: params.uploadPreset,
        folder: params.folder,
        resourceType: "image",
        onProgress: params.onProgress,
    });

    return {
        url: data.secure_url,
        publicId: data.public_id,
        width: data.width,
        height: data.height,
        bytes: data.bytes,
    };
}

export async function uploadImagesToCloudinary(params: {
    files: File[];
    cloudName: string;
    uploadPreset: string;
    folder?: string;
    onFileProgress?: (fileIndex: number, pct: number, fileName: string) => void;
}): Promise<CloudImageItem[]> {
    const { files, cloudName, uploadPreset, folder, onFileProgress } = params;

    const uploaded: CloudImageItem[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        const data = await uploadToCloudinaryUnsigned({
            file,
            cloudName,
            uploadPreset,
            folder,
            resourceType: "image",
            onProgress: (pct) => onFileProgress?.(i, pct, file.name),
        });

        uploaded.push({
            url: data.secure_url,
            publicId: data.public_id,
            width: data.width,
            height: data.height,
            bytes: data.bytes,
        });
    }

    return uploaded;
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
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(json);
                } else {
                    reject(
                        new Error(json?.error?.message || xhr.responseText || "Upload failed")
                    );
                }
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