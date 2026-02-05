import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { v2 as cloudinary } from "cloudinary";

initializeApp();
const db = getFirestore();

const CLOUDINARY_CLOUD_NAME = defineSecret("CLOUDINARY_CLOUD_NAME");
const CLOUDINARY_API_KEY = defineSecret("CLOUDINARY_API_KEY");
const CLOUDINARY_API_SECRET = defineSecret("CLOUDINARY_API_SECRET");

// Configurar Cloudinary una sola vez por instancia (reduce overhead)
let cloudinaryConfigured = false;
function configureCloudinaryOnce() {
    if (cloudinaryConfigured) return;

    cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME.value(),
        api_key: CLOUDINARY_API_KEY.value(),
        api_secret: CLOUDINARY_API_SECRET.value(),
        secure: true,
    });

    cloudinaryConfigured = true;
}

async function assertStoreOwner(storeId: string, uid: string) {
    const storeSnap = await db.doc(`stores/${storeId}`).get();
    if (!storeSnap.exists) throw new HttpsError("not-found", "Store not found");

    const ownerUid = storeSnap.data()?.ownerUid;
    if (ownerUid !== uid) throw new HttpsError("permission-denied", "Not allowed");
}

/**
 * Firma para subir directo a Cloudinary desde el cliente.
 * Esto debe ser rápido y barato.
 */
export const cloudinarySignUpload = onCall(
    {
        region: "us-central1",
        secrets: [CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET],
        memory: "128MiB",
        timeoutSeconds: 10,
        minInstances: 0,
        maxInstances: 2,
    },
    async (request) => {
        const t0 = Date.now();

        if (!request.auth) throw new HttpsError("unauthenticated", "Login required");

        const { storeId, kind } = request.data as {
            storeId: string;
            kind?: "products" | "videos";
        };

        if (!storeId) throw new HttpsError("invalid-argument", "storeId required");

        await assertStoreOwner(storeId, request.auth.uid);

        configureCloudinaryOnce();

        const timestamp = Math.floor(Date.now() / 1000);
        const folder = `stores/${storeId}/${kind === "videos" ? "videos" : "products"}`;

        // Cloudinary suele esperar overwrite como boolean, pero firmamos el string para ser consistentes
        const paramsToSign: Record<string, any> = {
            folder,
            overwrite: "true",
            timestamp,
        };

        const signature = cloudinary.utils.api_sign_request(
            paramsToSign,
            CLOUDINARY_API_SECRET.value()
        );

        console.log("cloudinarySignUpload", {
            uid: request.auth.uid,
            storeId,
            kind: kind ?? "products",
            ms: Date.now() - t0,
        });

        return {
            cloudName: CLOUDINARY_CLOUD_NAME.value(),
            apiKey: CLOUDINARY_API_KEY.value(),
            timestamp,
            signature,
            folder,
            overwrite: true,
        };
    }
);

/**
 * Borra un asset en Cloudinary (image/video) validando dueño de la tienda.
 */
export const cloudinaryDeleteAsset = onCall(
    {
        region: "us-central1",
        secrets: [CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET],
        memory: "256MiB",
        timeoutSeconds: 30,
        minInstances: 0,
        maxInstances: 2,
    },
    async (request) => {
        const t0 = Date.now();

        if (!request.auth) throw new HttpsError("unauthenticated", "Login required");

        const { storeId, publicId, resourceType } = request.data as {
            storeId: string;
            publicId: string;
            resourceType?: "image" | "video";
        };

        if (!storeId) throw new HttpsError("invalid-argument", "storeId required");
        if (!publicId) throw new HttpsError("invalid-argument", "publicId required");

        await assertStoreOwner(storeId, request.auth.uid);

        configureCloudinaryOnce();

        const type: "image" | "video" = resourceType ?? "image";

        try {
            const result = await cloudinary.uploader.destroy(publicId, {
                resource_type: type,
            });

            console.log("cloudinaryDeleteAsset", {
                uid: request.auth.uid,
                storeId,
                publicId,
                resourceType: type,
                ms: Date.now() - t0,
                cloudinaryResult: result?.result,
            });

            return { ok: true, result };
        } catch (err: any) {
            console.error("Cloudinary destroy error:", {
                uid: request.auth.uid,
                storeId,
                publicId,
                resourceType: type,
                ms: Date.now() - t0,
                message: err?.message,
            });

            throw new HttpsError("internal", err?.message || "Cloudinary delete failed");
        }
    }
);
