import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';

type FirestoreTimestampLike = {
    seconds?: number;
    nanoseconds?: number;
    toDate?: () => Date;
};

type StoreInfo = {
    id: string;
    name: string;
    slug: string;
    hasActiveSubscription: boolean;
    subscriptionEndAt?: string | number | Date | FirestoreTimestampLike | null;
};

const WOMPI_PAYMENT_URL = 'https://checkout.wompi.co/l/TU_LINK_DE_PAGO';

const parseDate = (
    value?: string | number | Date | FirestoreTimestampLike | null
): Date | null => {
    if (!value) return null;

    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof value === 'object') {
        if (typeof value.toDate === 'function') {
            const parsed = value.toDate();
            return isNaN(parsed.getTime()) ? null : parsed;
        }

        if (typeof value.seconds === 'number') {
            const parsed = new Date(value.seconds * 1000);
            return isNaN(parsed.getTime()) ? null : parsed;
        }
    }

    return null;
};

const formatDate = (
    value?: string | number | Date | FirestoreTimestampLike | null
) => {
    const parsed = parseDate(value);
    if (!parsed) return 'No disponible';

    return new Intl.DateTimeFormat('es-CO', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    }).format(parsed);
};

const getDaysRemaining = (
    value?: string | number | Date | FirestoreTimestampLike | null
) => {
    const parsed = parseDate(value);
    if (!parsed) return null;

    const now = new Date();
    const diffMs = parsed.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const SubscriptionView: React.FC = () => {
    const { user } = useAuth();

    const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const loadStore = async () => {
            try {
                if (!user?.uid) {
                    if (isMounted) {
                        setStoreInfo(null);
                        setLoading(false);
                    }
                    return;
                }

                const qStore = query(
                    collection(db, 'stores'),
                    where('ownerUid', '==', user.uid),
                    limit(1)
                );

                const snap = await getDocs(qStore);

                if (!isMounted) return;

                if (snap.empty) {
                    setStoreInfo(null);
                    setLoading(false);
                    return;
                }

                const doc = snap.docs[0];
                const data = doc.data() as any;

                setStoreInfo({
                    id: doc.id,
                    name: typeof data.name === 'string' ? data.name : '',
                    slug: typeof data.slug === 'string' ? data.slug : '',
                    hasActiveSubscription: data.hasActiveSubscription === true,
                    subscriptionEndAt: data.subscriptionEndAt ?? null,
                });
            } catch (error) {
                console.error('Error cargando la suscripción:', error);
                if (isMounted) setStoreInfo(null);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadStore();

        return () => {
            isMounted = false;
        };
    }, [user?.uid]);

    const registeredEmail = user?.email || '';

    const daysRemaining = useMemo(
        () => getDaysRemaining(storeInfo?.subscriptionEndAt),
        [storeInfo?.subscriptionEndAt]
    );

    const statusConfig = useMemo(() => {
        if (!storeInfo) {
            return {
                badge: 'Sin datos',
                badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
                alertClass: 'bg-gray-50 border-gray-200 text-gray-700',
                title: 'No se encontró información de la tienda',
                message: 'Verifica que tu usuario tenga una tienda asociada.',
                icon: 'fa-circle-info',
            };
        }

        // 🔴 PRIORIDAD TOTAL: si no tiene suscripción activa
        if (!storeInfo.hasActiveSubscription) {
            return {
                badge: 'Inactiva',
                badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
                alertClass: 'bg-gray-50 border-gray-200 text-gray-700',
                title: 'Suscripción inactiva',
                message: 'No tienes una suscripción activa. Realiza el pago para activarla.',
                icon: 'fa-circle-info',
            };
        }

        // 👇 SOLO si está activa, usamos fechas
        if (!storeInfo.subscriptionEndAt) {
            return {
                badge: 'Activa',
                badgeClass: 'bg-green-100 text-green-700 border-green-200',
                alertClass: 'bg-green-50 border-green-200 text-green-700',
                title: 'Suscripción activa',
                message: 'Tu suscripción está activa.',
                icon: 'fa-circle-check',
            };
        }

        if (daysRemaining === null) {
            return {
                badge: 'Activa',
                badgeClass: 'bg-green-100 text-green-700 border-green-200',
                alertClass: 'bg-green-50 border-green-200 text-green-700',
                title: 'Suscripción activa',
                message: 'No se pudo calcular la fecha de vencimiento.',
                icon: 'fa-circle-check',
            };
        }

        if (daysRemaining < 0) {
            return {
                badge: 'Vencida',
                badgeClass: 'bg-red-100 text-red-700 border-red-200',
                alertClass: 'bg-red-50 border-red-200 text-red-700',
                title: 'Suscripción vencida',
                message: 'Tu suscripción ya expiró.',
                icon: 'fa-triangle-exclamation',
            };
        }

        if (daysRemaining <= 5) {
            return {
                badge: 'Por vencer',
                badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
                alertClass: 'bg-amber-50 border-amber-200 text-amber-700',
                title: 'Próxima a vencer',
                message: `Tu suscripción vence en ${daysRemaining} día${daysRemaining === 1 ? '' : 's'}.`,
                icon: 'fa-clock',
            };
        }

        return {
            badge: 'Activa',
            badgeClass: 'bg-green-100 text-green-700 border-green-200',
            alertClass: 'bg-green-50 border-green-200 text-green-700',
            title: 'Suscripción activa',
            message: `Te quedan ${daysRemaining} días de suscripción.`,
            icon: 'fa-circle-check',
        };
    }, [storeInfo, daysRemaining]);

    const handleCopyEmail = async () => {
        if (!registeredEmail) {
            alert('No se encontró el correo del usuario autenticado.');
            return;
        }

        try {
            await navigator.clipboard.writeText(registeredEmail);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error(error);
            alert(`Correo registrado: ${registeredEmail}`);
        }
    };

    const handleOpenWompi = () => {
        if (!registeredEmail) {
            alert('No se encontró el correo del usuario autenticado.');
            return;
        }

        window.open(WOMPI_PAYMENT_URL, '_blank', 'noopener,noreferrer');
    };

    if (loading) {
        return (
            <div className="bg-white rounded-2xl border p-8 text-center text-gray-500">
                Cargando suscripción...
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Suscripción</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Gestiona el pago mensual de tu plan y revisa el estado actual de tu suscripción.
                </p>
            </div>

            <div className="bg-white rounded-2xl border p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Estado de tu suscripción</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Aquí puedes ver si tu plan está activo, por vencer o vencido.
                        </p>
                    </div>

                    <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${statusConfig.badgeClass}`}
                    >
                        {statusConfig.badge}
                    </span>
                </div>

                <div className={`mt-6 rounded-xl border p-4 ${statusConfig.alertClass}`}>
                    <div className="flex items-start gap-3">
                        <i className={`fa-solid ${statusConfig.icon} mt-1`} />
                        <div>
                            <p className="font-bold">{statusConfig.title}</p>
                            <p className="text-sm mt-1">{statusConfig.message}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="rounded-xl border p-4">
                        <p className="text-xs uppercase tracking-wide text-gray-400">Tienda</p>
                        <p className="text-sm font-semibold text-gray-900 mt-2 break-words">
                            {storeInfo?.name || 'No disponible'}
                        </p>
                    </div>

                    <div className="rounded-xl border p-4">
                        <p className="text-xs uppercase tracking-wide text-gray-400">Vence el</p>
                        <p className="text-sm font-semibold text-gray-900 mt-2">
                            {formatDate(storeInfo?.subscriptionEndAt)}
                        </p>
                    </div>

                    <div className="rounded-xl border p-4">
                        <p className="text-xs uppercase tracking-wide text-gray-400">Días restantes</p>
                        <p className="text-sm font-semibold text-gray-900 mt-2">
                            {daysRemaining === null ? 'No disponible' : daysRemaining < 0 ? '0' : daysRemaining}
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border p-6">
                <h2 className="text-xl font-bold text-gray-900">Pago de suscripción</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Antes de ir a pagar, copia el correo con el que registraste tu tienda y pégalo en la
                    pasarela externa de Wompi.
                </p>

                <div className="mt-5 rounded-xl border bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-400">
                        Correo registrado en la tienda
                    </p>
                    <p className="text-lg font-bold text-gray-900 mt-2 break-all">
                        {registeredEmail || 'No disponible'}
                    </p>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row gap-3">
                    <button
                        type="button"
                        onClick={handleCopyEmail}
                        className="px-4 py-3 rounded-xl border font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        <i className="fa-regular fa-copy mr-2" />
                        {copied ? 'Correo copiado' : 'Copiar correo'}
                    </button>

                    <button
                        type="button"
                        onClick={handleOpenWompi}
                        className="px-4 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors"
                    >
                        <i className="fa-solid fa-arrow-up-right-from-square mr-2" />
                        Ir a pagar con Wompi
                    </button>
                </div>

                <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800">
                    Al hacer clic en <b>Ir a pagar con Wompi</b> se abrirá una pasarela de pago externa.
                    Vas a salir temporalmente de nuestro sistema para completar el pago.
                </div>
            </div>
        </div>
    );
};

export default SubscriptionView;