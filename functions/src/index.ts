import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

admin.initializeApp();

setGlobalOptions({
    region: "us-central1",
    memory: "128MiB",
    timeoutSeconds: 30,
    maxInstances: 1,
    minInstances: 0,
    concurrency: 10,
});

function getFutureDateFromFirestore(value: any, now: Date): Date | null {
    if (!value) return null;

    if (typeof value.toDate === "function") {
        const date = value.toDate();
        return date > now ? date : null;
    }

    if (typeof value === "number") {
        const date = new Date(value);
        return date > now ? date : null;
    }

    if (value instanceof Date) {
        return value > now ? value : null;
    }

    return null;
}

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

        /**
         * Base de inicio para calcular el próximo vencimiento.
         *
         * Casos:
         * 1. Si ya tiene una suscripción paga vigente, se suma 1 mes desde subscriptionEndAt.
         * 2. Si está en prueba gratis activa y paga antes de vencer, se suma 1 mes desde trialEndsAt.
         * 3. Si no tiene nada activo o ya venció, se suma 1 mes desde hoy.
         */
        let baseDate = now;

        const currentSubscriptionEndDate = getFutureDateFromFirestore(
            storeData.subscriptionEndAt,
            now
        );

        const currentTrialEndDate =
            getFutureDateFromFirestore(storeData.trialEndsAt, now) ||
            getFutureDateFromFirestore(storeData.trialEndsAtMs, now);

        if (currentSubscriptionEndDate) {
            baseDate = currentSubscriptionEndDate;
        } else if (
            storeData.hasFreeTrial === true &&
            storeData.freeTrialStatus === "active" &&
            currentTrialEndDate
        ) {
            baseDate = currentTrialEndDate;
        }

        const newEndDate = new Date(baseDate);
        newEndDate.setMonth(newEndDate.getMonth() + 1);

        await storeRef.set(
            {
                hasActiveSubscription: true,

                subscriptionType: "subscription",
                subscriptionStatus: "active",
                subscriptionStartAt: Timestamp.fromDate(now),
                subscriptionEndAt: Timestamp.fromDate(newEndDate),
                subscriptionLastPaymentAt: FieldValue.serverTimestamp(),

                /**
                 * Si venía de prueba gratis, la marcamos como convertida.
                 * No borramos las fechas de trial para mantener historial.
                 */
                freeTrialStatus:
                    storeData.hasFreeTrial === true ? "converted" : storeData.freeTrialStatus ?? null,

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

            /**
             * Para auditoría:
             * Si pagó durante prueba gratis, queda marcado aquí.
             */
            hadFreeTrial: storeData.hasFreeTrial === true,
            previousFreeTrialStatus: storeData.freeTrialStatus ?? null,
            previousTrialEndsAt: storeData.trialEndsAt ?? null,
            previousTrialEndsAtMs: storeData.trialEndsAtMs ?? null,

            createdAt: FieldValue.serverTimestamp(),
            subscriptionStartAt: Timestamp.fromDate(now),
            subscriptionBaseDate: Timestamp.fromDate(baseDate),
            subscriptionEndAt: Timestamp.fromDate(newEndDate),
        });

        res.status(200).json({
            ok: true,
            message: "Suscripción activada correctamente",
            storeId: storeDoc.id,
            subscriptionStartAt: now,
            subscriptionBaseDate: baseDate,
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