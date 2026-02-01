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

function configureCloudinary() {
    cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME.value(),
        api_key: CLOUDINARY_API_KEY.value(),
        api_secret: CLOUDINARY_API_SECRET.value(),
        secure: true,
    });
}

async function assertStoreOwner(storeId: string, uid: string) {
    const storeSnap = await db.doc(`stores/${storeId}`).get();
    if (!storeSnap.exists) throw new HttpsError("not-found", "Store not found");
    const ownerUid = storeSnap.data()?.ownerUid;
    if (ownerUid !== uid) throw new HttpsError("permission-denied", "Not allowed");
}

export const cloudinarySignUpload = onCall(
    {
        region: "us-central1",
        secrets: [CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET],
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login required");

        const { storeId, kind } = request.data as { storeId: string; kind?: "products" | "videos" };
        if (!storeId) throw new HttpsError("invalid-argument", "storeId required");

        await assertStoreOwner(storeId, request.auth.uid);

        configureCloudinary();

        const timestamp = Math.floor(Date.now() / 1000);

        const folder = `stores/${storeId}/${kind === "videos" ? "videos" : "products"}`;
        const paramsToSign: Record<string, any> = {
            folder,
            overwrite: "true",
            timestamp,
        };


        const signature = cloudinary.utils.api_sign_request(
            paramsToSign,
            CLOUDINARY_API_SECRET.value()
        );

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

export const cloudinaryDeleteAsset = onCall(
    {
        region: "us-central1",
        secrets: [CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET],
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login required");

        const { storeId, publicId, resourceType } = request.data as {
            storeId: string;
            publicId: string;
            resourceType?: "image" | "video";
        };

        if (!storeId) throw new HttpsError("invalid-argument", "storeId required");
        if (!publicId) throw new HttpsError("invalid-argument", "publicId required");

        await assertStoreOwner(storeId, request.auth.uid);

        configureCloudinary();

        const type: "image" | "video" = resourceType ?? "image";

        try {
            const result = await cloudinary.uploader.destroy(publicId, {
                resource_type: type,
                // si alguna vez borras PDFs u otros: type: "upload"
                // type: "upload",
            });

            // result: { result: "ok" | "not found" | ... }
            return { ok: true, result };
        } catch (err: any) {
            console.error("Cloudinary destroy error:", err);
            throw new HttpsError("internal", err?.message || "Cloudinary delete failed");
        }
    }
);
