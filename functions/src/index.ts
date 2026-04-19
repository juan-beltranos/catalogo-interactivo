import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

admin.initializeApp();

setGlobalOptions({
    region: "us-central1",
});

export const activateSubscription = onRequest(async (req, res): Promise<void> => {
    try {
        if (req.method !== "POST") {
            res.status(405).json({
                ok: false,
                message: "Método no permitido",
            });
            return;
        }

        const { email } = req.body ?? {};

        if (!email || typeof email !== "string") {
            res.status(400).json({
                ok: false,
                message: "El campo email es obligatorio",
            });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        let userRecord: admin.auth.UserRecord;
        try {
            userRecord = await admin.auth().getUserByEmail(normalizedEmail);
        } catch (error) {
            res.status(404).json({
                ok: false,
                message: "No se encontró un usuario con ese correo",
            });
            return;
        }

        const db = getFirestore();

        const storesSnap = await db
            .collection("stores")
            .where("ownerUid", "==", userRecord.uid)
            .limit(1)
            .get();

        if (storesSnap.empty) {
            res.status(404).json({
                ok: false,
                message: "No se encontró una tienda asociada a este usuario",
            });
            return;
        }

        const storeDoc = storesSnap.docs[0];
        const storeRef = storeDoc.ref;
        const storeData = storeDoc.data();

        const now = new Date();
        let baseDate = now;

        if (storeData.subscriptionEndAt?.toDate) {
            const currentEndDate = storeData.subscriptionEndAt.toDate();
            if (currentEndDate > now) {
                baseDate = currentEndDate;
            }
        }

        const newEndDate = new Date(baseDate);
        newEndDate.setMonth(newEndDate.getMonth() + 1);

        await storeRef.set(
            {
                hasActiveSubscription: true,
                subscriptionType: "subscription",
                subscriptionStartAt: Timestamp.fromDate(now),
                subscriptionEndAt: Timestamp.fromDate(newEndDate),
                subscriptionLastPaymentAt: FieldValue.serverTimestamp(),
                ownerEmail: normalizedEmail,
                updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        const paymentRef = storeRef.collection("subscriptionPayments").doc();

        await paymentRef.set({
            email: normalizedEmail,
            ownerUid: userRecord.uid,
            storeId: storeDoc.id,
            status: "approved",
            type: "monthly_subscription",
            createdAt: FieldValue.serverTimestamp(),
            subscriptionStartAt: Timestamp.fromDate(now),
            subscriptionEndAt: Timestamp.fromDate(newEndDate),
        });

        res.status(200).json({
            ok: true,
            message: "Suscripción activada correctamente",
            storeId: storeDoc.id,
            subscriptionEndAt: newEndDate,
            paymentId: paymentRef.id,
        });
    } catch (error) {
        console.error("Error activando suscripción:", error);
        res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
        });
    }
});