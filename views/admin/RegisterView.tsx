import React, { useMemo, useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { Navigate, useNavigate } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";

function slugify(input: string) {
    return input
        .toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // quita acentos
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
}

const RegisterView: React.FC = () => {
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();

    // Admin
    const [adminName, setAdminName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    // Negocio / tienda
    const [storeName, setStoreName] = useState("");
    const [storeSlug, setStoreSlug] = useState("");
    const [whatsapp, setWhatsapp] = useState(""); // ej: 573001112233
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
        const cleanWhatsapp = whatsapp.trim().replace(/\s+/g, "");

        // Validaciones MVP
        if (!cleanAdminName) return setError("Escribe tu nombre.");
        if (!cleanEmail) return setError("Escribe tu email.");
        if (password.length < 6) return setError("La contraseña debe tener mínimo 6 caracteres.");

        if (!cleanStoreName) return setError("Escribe el nombre del negocio.");
        if (!cleanSlug) return setError("El slug del negocio es obligatorio.");
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
            // Recomendado: stores como colección raíz (y luego subcolecciones por store)
            const storesRef = collection(db, "stores");
            const storeDoc = await addDoc(storesRef, {
                name: cleanStoreName,
                slug: cleanSlug,
                whatsapp: cleanWhatsapp,
                address: address.trim() || "",
                ownerUid: cred.user.uid,
                isActive: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            // 3) (Opcional) Crear perfil de usuario en /users
            // Esto ayuda después (multi-store, roles, etc.)
            // await setDoc(doc(db, "users", cred.user.uid), { ... })

            // 4) Redirigir al admin
            // Puedes guardar storeId en localStorage si tu app lo necesita
            localStorage.setItem("activeStoreId", storeDoc.id);

            navigate("/admin", { replace: true });
        } catch (err: any) {
            console.error(err);
            const code = err?.code as string | undefined;

            if (code === "auth/email-already-in-use") setError("Ese correo ya está registrado.");
            else if (code === "auth/invalid-email") setError("El correo no es válido.");
            else if (code === "auth/weak-password") setError("Contraseña muy débil (mínimo 6).");
            else {
                // Importante: slug duplicado NO lo detecta Firestore por sí solo.
                // Eso lo resolvemos en el siguiente paso con validación previa o reglas.
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
                            <input
                                className="mt-1 w-full border rounded-lg p-2"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Mínimo 6 caracteres"
                                type="password"
                                autoComplete="new-password"
                            />
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
                                    // sugerir slug automáticamente si el usuario no lo tocó
                                    if (!storeSlug) {
                                        // no lo forzamos, solo sugerimos visualmente abajo
                                    }
                                }}
                                placeholder="Mi Tienda"
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
                                Tu catálogo público será: <span className="font-mono">/#/{storeSlug || suggestedSlug || "mi-tienda"}</span>
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">WhatsApp (con código país)</label>
                            <input
                                className="mt-1 w-full border rounded-lg p-2"
                                value={whatsapp}
                                onChange={(e) => setWhatsapp(e.target.value)}
                                placeholder="573001112233"
                                inputMode="numeric"
                            />
                            <p className="text-xs text-gray-500 mt-1">Ejemplo Colombia: 57 + número (sin +, sin espacios)</p>
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
