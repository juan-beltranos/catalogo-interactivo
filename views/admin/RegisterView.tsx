import React, { useMemo, useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { Navigate, useNavigate } from "react-router-dom";
import { addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";

function slugify(input: string) {
    return input
        .toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
}

function getUrlParam(paramName: string) {
    // Funciona con URLs normales: /admin/register?source=client
    const normalParams = new URLSearchParams(window.location.search);
    const normalValue = normalParams.get(paramName);

    if (normalValue) return normalValue;

    // Funciona con HashRouter: /#/admin/register?source=client
    const hash = window.location.hash;
    const queryString = hash.includes("?") ? hash.split("?")[1] : "";
    const hashParams = new URLSearchParams(queryString);

    return hashParams.get(paramName) || "";
}

const businessTypes = [
    "Ropa",
    "Calzado",
    "Alimentos",
    "Restaurante",
    "Comidas rápidas",
    "Panadería",
    "Repostería",
    "Cafetería",
    "Bebidas",
    "Supermercado",
    "Minimercado",
    "Tienda de barrio",
    "Frutas y verduras",
    "Carnicería",
    "Pescadería",
    "Lácteos",
    "Productos orgánicos",
    "Belleza y cuidado personal",
    "Peluquería / Barbería",
    "Cosméticos",
    "Perfumería",
    "Accesorios",
    "Joyería",
    "Relojería",
    "Tecnología",
    "Celulares y accesorios",
    "Computadores",
    "Electrodomésticos",
    "Muebles",
    "Decoración",
    "Hogar",
    "Ferretería",
    "Construcción",
    "Papelería",
    "Librería",
    "Juguetería",
    "Mascotas",
    "Veterinaria",
    "Farmacia",
    "Salud",
    "Servicios médicos",
    "Gimnasio / Fitness",
    "Deportes",
    "Bicicletas",
    "Motos",
    "Repuestos",
    "Automotriz",
    "Lavadero de autos",
    "Floristería",
    "Regalos",
    "Artesanías",
    "Eventos",
    "Fotografía",
    "Publicidad",
    "Diseño gráfico",
    "Servicios profesionales",
    "Consultoría",
    "Educación",
    "Cursos / Academia",
    "Turismo",
    "Hotel / Hospedaje",
    "Transporte",
    "Inmobiliaria",
    "Moda",
    "Ropa infantil",
    "Ropa deportiva",
    "Lencería",
    "Uniformes",
    "Tienda virtual",
    "Otro",
];

const RegisterView: React.FC = () => {
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();

    // Parámetro de origen desde la URL.
    // Ejemplo: https://catalogo-interactivo.vercel.app/#/admin/register?source=client
    const source = useMemo(() => getUrlParam("source").trim().toLowerCase(), []);
    const isClientSource = source === "client";

    // Admin
    const [adminName, setAdminName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    // Negocio / tienda
    const [storeName, setStoreName] = useState("");
    const [storeSlug, setStoreSlug] = useState("");
    const [businessType, setBusinessType] = useState("");
    const [city, setCity] = useState("");
    const [whatsapp, setWhatsapp] = useState("");
    const [address, setAddress] = useState("");

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const suggestedSlug = useMemo(() => slugify(storeName), [storeName]);

    if (authLoading) return null;
    if (user) return <Navigate to="/admin" replace />;

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const cleanAdminName = adminName.trim();
        const cleanEmail = email.trim().toLowerCase();
        const cleanStoreName = storeName.trim();
        const cleanSlug = (storeSlug.trim() || suggestedSlug).trim();
        const cleanBusinessType = businessType.trim();
        const cleanCity = city.trim();
        const cleanWhatsapp = whatsapp.trim().replace(/\s+/g, "");

        // Fechas para prueba gratis
        const now = new Date();
        const trialEndsDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Validaciones MVP
        if (!cleanAdminName) return setError("Escribe tu nombre.");
        if (!cleanEmail) return setError("Escribe tu email.");
        if (password.length < 6) return setError("La contraseña debe tener mínimo 6 caracteres.");

        if (!cleanStoreName) return setError("Escribe el nombre del negocio.");
        if (!cleanSlug) return setError("El slug del negocio es obligatorio.");
        if (!cleanBusinessType) return setError("Selecciona el tipo de negocio.");
        if (!cleanCity) return setError("Escribe la ciudad del negocio.");
        if (!cleanWhatsapp) return setError("Escribe el WhatsApp del negocio (ej: 573001112233).");

        // Validación simple WhatsApp (solo números, mínimo 10)
        if (!/^\d{10,15}$/.test(cleanWhatsapp)) {
            return setError("WhatsApp debe contener solo números (incluye código país, ej: 57...).");
        }

        setLoading(true);

        try {
            // 1) Crear usuario admin
            const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
            await updateProfile(cred.user, { displayName: cleanAdminName });

            // 2) Crear store en Firestore
            const storesRef = collection(db, "stores");

            const storeDoc = await addDoc(storesRef, {
                name: cleanStoreName,
                slug: cleanSlug,
                businessType: cleanBusinessType,
                city: cleanCity,
                whatsapp: cleanWhatsapp,
                address: address.trim() || "",
                ownerUid: cred.user.uid,
                isActive: true,

                // Fuente del registro
                source: source || "direct",

                // Suscripción / acceso
                subscriptionType: isClientSource ? "free_trial" : "one_time",
                subscriptionStatus: isClientSource ? "trialing" : "inactive",

                // IMPORTANTE:
                // Si viene desde la landing con source=client,
                // queda activo durante los 7 días gratis.
                hasActiveSubscription: isClientSource,

                // Prueba gratis de 7 días
                hasFreeTrial: isClientSource,
                freeTrialDays: isClientSource ? 7 : 0,
                freeTrialStatus: isClientSource ? "active" : "none",
                freeTrialSource: isClientSource ? "client" : null,
                trialStartedAt: isClientSource ? serverTimestamp() : null,
                trialEndsAt: isClientSource ? Timestamp.fromDate(trialEndsDate) : null,
                trialEndsAtMs: isClientSource ? trialEndsDate.getTime() : null,

                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            localStorage.setItem("activeStoreId", storeDoc.id);

            navigate("/admin", { replace: true });
        } catch (err: any) {
            console.error(err);
            const code = err?.code as string | undefined;

            if (code === "auth/email-already-in-use") setError("Ese correo ya está registrado.");
            else if (code === "auth/invalid-email") setError("El correo no es válido.");
            else if (code === "auth/weak-password") setError("Contraseña muy débil (mínimo 6).");
            else {
                setError("No se pudo crear la cuenta/tienda. Revisa los datos e intenta de nuevo.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
            <div className="w-full max-w-xl bg-white rounded-xl shadow p-6">
                <h1 className="text-2xl font-bold">Crear cuenta</h1>
                <p className="text-gray-500 mt-1">Admin + datos del negocio</p>

                {isClientSource ? (
                    <div className="mt-4 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg p-3 text-sm">
                        Tu registro incluye 7 días gratis.
                    </div>
                ) : null}

                <form onSubmit={handleRegister} className="mt-6 space-y-6">
                    {/* Datos admin */}
                    <section className="space-y-4">
                        <h2 className="text-lg font-semibold">Datos del administrador</h2>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Nombre</label>
                            <input
                                className="mt-1 w-full border rounded-lg p-2"
                                value={adminName}
                                onChange={(e) => setAdminName(e.target.value)}
                                placeholder="Tu nombre"
                                autoComplete="name"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Email</label>
                            <input
                                className="mt-1 w-full border rounded-lg p-2"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="correo@dominio.com"
                                type="email"
                                autoComplete="email"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Contraseña</label>

                            <div className="relative mt-1">
                                <input
                                    className="w-full border rounded-lg p-2 pr-12"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Mínimo 6 caracteres"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="new-password"
                                />

                                <button
                                    type="button"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
                                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                    title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                >
                                    {showPassword ? "Ocultar" : "Ver"}
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Datos negocio */}
                    <section className="space-y-4">
                        <h2 className="text-lg font-semibold">Datos del negocio</h2>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Nombre del negocio</label>
                            <input
                                className="mt-1 w-full border rounded-lg p-2"
                                value={storeName}
                                onChange={(e) => {
                                    setStoreName(e.target.value);
                                }}
                                placeholder="Mi Tienda"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Tipo de negocio</label>
                            <select
                                className="mt-1 w-full border rounded-lg p-2 bg-white"
                                value={businessType}
                                onChange={(e) => setBusinessType(e.target.value)}
                            >
                                <option value="">Selecciona una opción</option>

                                {businessTypes.map((type) => (
                                    <option key={type} value={type}>
                                        {type}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Ciudad</label>
                            <input
                                className="mt-1 w-full border rounded-lg p-2"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                placeholder="Ej: Bogotá, Medellín, Cali..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Slug (URL pública)</label>
                            <input
                                className="mt-1 w-full border rounded-lg p-2"
                                value={storeSlug}
                                onChange={(e) => setStoreSlug(slugify(e.target.value))}
                                placeholder={suggestedSlug || "mi-tienda"}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Tu catálogo público será:{" "}
                                <span className="font-mono">
                                    /#/{storeSlug || suggestedSlug || "mi-tienda"}
                                </span>
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                WhatsApp (con código país)
                            </label>
                            <input
                                className="mt-1 w-full border rounded-lg p-2"
                                value={whatsapp}
                                onChange={(e) => setWhatsapp(e.target.value)}
                                placeholder="573001112233"
                                inputMode="numeric"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Ejemplo Colombia: 57 + número (sin +, sin espacios)
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Dirección (opcional)</label>
                            <input
                                className="mt-1 w-full border rounded-lg p-2"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="Calle 123 #45-67"
                            />
                        </div>
                    </section>

                    {error ? (
                        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                            {error}
                        </div>
                    ) : null}

                    <div className="space-y-3">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-600 text-white rounded-lg p-2 font-semibold disabled:opacity-60"
                        >
                            {loading ? "Creando..." : "Crear cuenta y tienda"}
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate("/admin/login")}
                            className="w-full border rounded-lg p-2 font-semibold"
                        >
                            Ya tengo cuenta
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RegisterView;