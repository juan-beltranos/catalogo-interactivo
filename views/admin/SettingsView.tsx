import React, { useEffect, useMemo, useState } from "react";
import {
    collection,
    doc,
    getDocs,
    limit,
    query,
    updateDoc,
    where,
} from "firebase/firestore";
import { db, storage } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { Store } from "@/interfaces";
import { slugify } from "@/helpers";
import { compressImage } from "@/helpers/imageCompression";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

const SettingsView: React.FC = () => {
    const { user } = useAuth();

    const [store, setStore] = useState<Store | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    // form — campos originales
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [description, setDescription] = useState("");
    const [whatsapp, setWhatsapp] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string>("");
    const [logoUploading, setLogoUploading] = useState(false);

    // form — campos nuevos
    const [brandColor, setBrandColor] = useState("#6366f1");
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [bannerPreview, setBannerPreview] = useState<string>("");
    const [bannerUploading, setBannerUploading] = useState(false);
    const [instagram, setInstagram] = useState("");
    const [facebook, setFacebook] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [location, setLocation] = useState("");

    // cargar tienda
    useEffect(() => {
        if (!user) return;

        const load = async () => {
            setLoading(true);
            const q = query(
                collection(db, "stores"),
                where("ownerUid", "==", user.uid),
                limit(1)
            );
            const snap = await getDocs(q);
            if (snap.empty) {
                setLoading(false);
                return;
            }

            const d = snap.docs[0];
            const data = d.data() as any;

            const s: Store = {
                id: d.id,
                name: data.name,
                slug: data.slug,
                address: data.description ?? "",
                whatsapp: data.whatsapp ?? "",
                isActive: data.isActive ?? true,
                createdAt: data.createdAt,
                logoUrl: data.logoUrl ?? "",
                logoPath: data.logoPath ?? "",
            };

            setLogoPreview(s.logoUrl || "");
            setStore(s);
            setName(s.name);
            setSlug(s.slug);
            setDescription(s.address ?? "");
            setWhatsapp(s.whatsapp ?? "");
            setIsActive(s.isActive ?? true);

            // cargar campos nuevos si existen en Firestore
            setBrandColor(data.brandColor ?? "#6366f1");
            setBannerPreview(data.bannerUrl ?? "");
            setInstagram(data.instagram ?? "");
            setFacebook(data.facebook ?? "");
            setEmail(data.email ?? "");
            setPhone(data.phone ?? "");
            setLocation(data.location ?? "");

            setLoading(false);
        };

        load();
    }, [user]);

    // --- Upload helpers ---

    const uploadStoreLogo = async (): Promise<{ logoUrl: string; logoPath: string } | null> => {
        if (!store || !logoFile) return null;

        setLogoUploading(true);
        try {
            const optimized = await compressImage(logoFile);
            const path = `stores/${store.id}/logo/${Date.now()}_${logoFile.name}`;
            const storageRef = ref(storage, path);
            await uploadBytes(storageRef, optimized);
            const url = await getDownloadURL(storageRef);

            if (store.logoPath) {
                try {
                    await deleteObject(ref(storage, store.logoPath));
                } catch (e) {
                    console.warn("No se pudo borrar logo anterior:", e);
                }
            }

            return { logoUrl: url, logoPath: path };
        } finally {
            setLogoUploading(false);
        }
    };

    const uploadStoreBanner = async (): Promise<{ bannerUrl: string; bannerPath: string } | null> => {
        if (!store || !bannerFile) return null;

        setBannerUploading(true);
        try {
            const optimized = await compressImage(bannerFile);
            const path = `stores/${store.id}/banner/${Date.now()}_${bannerFile.name}`;
            const storageRef = ref(storage, path);
            await uploadBytes(storageRef, optimized);
            const url = await getDownloadURL(storageRef);

            // borrar banner anterior si existe
            const currentBannerPath = (store as any).bannerPath;
            if (currentBannerPath) {
                try {
                    await deleteObject(ref(storage, currentBannerPath));
                } catch (e) {
                    console.warn("No se pudo borrar banner anterior:", e);
                }
            }

            return { bannerUrl: url, bannerPath: path };
        } finally {
            setBannerUploading(false);
        }
    };

    // --- URL catálogo ---

    const catalogUrl = useMemo(() => {
        if (!store?.slug) return "";
        return `${window.location.origin}/#/${store.slug}`;
    }, [store?.slug]);

    // --- Guardar ---

    const handleSave = async () => {
        if (!store) return;

        if (!name.trim()) {
            setError("El nombre de la tienda es obligatorio.");
            return;
        }

        const cleanSlug = slugify(slug);
        if (!cleanSlug) {
            setError("El slug no es válido.");
            return;
        }

        setSaving(true);
        setError("");

        let logoPayload: any = {};
        let bannerPayload: any = {};

        if (logoFile) {
            const uploaded = await uploadStoreLogo();
            if (uploaded) logoPayload = uploaded;
        }

        if (bannerFile) {
            const uploaded = await uploadStoreBanner();
            if (uploaded) bannerPayload = uploaded;
        }

        try {
            await updateDoc(doc(db, "stores", store.id), {
                name: name.trim(),
                slug: cleanSlug,
                description: description.trim(),
                whatsapp: whatsapp.trim(),
                isActive,
                // nuevos campos
                brandColor,
                instagram: instagram.trim(),
                facebook: facebook.trim(),
                email: email.trim(),
                phone: phone.trim(),
                location: location.trim(),
                ...logoPayload,
                ...bannerPayload,
                updatedAt: new Date(),
            });

            alert("Configuración guardada ✅");
            setStore({
                ...store,
                name,
                slug: cleanSlug,
                description,
                whatsapp,
                isActive,
                ...logoPayload,
                ...bannerPayload,
            } as any);
            if (logoPayload.logoUrl) setLogoPreview(logoPayload.logoUrl);
            if (bannerPayload.bannerUrl) setBannerPreview(bannerPayload.bannerUrl);
            setLogoFile(null);
            setBannerFile(null);

        } catch (e) {
            console.error(e);
            setError("No se pudo guardar la configuración.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Cargando configuración...</div>;
    }

    if (!store) {
        return <div className="p-8 text-center text-gray-500">No se encontró la tienda.</div>;
    }

    return (
        <div className="space-y-8 max-w-3xl">

            <div>
                <h1 className="text-2xl font-bold text-gray-900">Configuración de la tienda</h1>
                <p className="text-gray-500 mt-1">
                    Administra la información y el estado de tu negocio.
                </p>
            </div>

            {/* ── Logo ── */}
            <div className="bg-white border rounded-xl p-6 space-y-4">
                <h2 className="font-bold text-gray-900">Logo del negocio</h2>

                <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-2xl bg-gray-100 border overflow-hidden flex items-center justify-center">
                        {logoPreview ? (
                            <img src={logoPreview} alt="Logo" className="h-full w-full object-cover" />
                        ) : (
                            <i className="fa-regular fa-image text-gray-400 text-xl" />
                        )}
                    </div>

                    <div className="flex-1">
                        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border font-semibold cursor-pointer hover:bg-gray-50">
                            <i className="fa-solid fa-upload" />
                            Subir logo
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0] || null;
                                    setLogoFile(f);
                                    if (f) setLogoPreview(URL.createObjectURL(f));
                                }}
                            />
                        </label>

                        <p className="text-xs text-gray-500 mt-2">
                            Recomendado: cuadrado (1:1). Se optimiza automáticamente antes de subir.
                        </p>

                        {logoFile && (
                            <p className="text-xs text-indigo-600 mt-1 font-semibold">
                                Listo para guardar: {logoFile.name}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Banner principal (NUEVO) ── */}
            <div className="bg-white border rounded-xl p-6 space-y-4">
                <h2 className="font-bold text-gray-900">Banner principal</h2>

                {bannerPreview && (
                    <div className="w-full h-36 rounded-xl overflow-hidden border bg-gray-100">
                        <img
                            src={bannerPreview}
                            alt="Banner"
                            className="w-full h-full object-cover"
                        />
                    </div>
                )}

                <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border font-semibold cursor-pointer hover:bg-gray-50">
                        <i className="fa-solid fa-image" />
                        {bannerPreview ? "Cambiar banner" : "Subir banner"}
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0] || null;
                                setBannerFile(f);
                                if (f) setBannerPreview(URL.createObjectURL(f));
                            }}
                        />
                    </label>

                    {bannerPreview && (
                        <button
                            type="button"
                            onClick={() => {
                                setBannerFile(null);
                                setBannerPreview("");
                            }}
                            className="text-sm text-red-500 hover:underline"
                        >
                            Quitar banner
                        </button>
                    )}
                </div>

                <p className="text-xs text-gray-500">
                    Recomendado: 1200 × 400 px (proporción 3:1). Se optimiza antes de subir.
                </p>

                {bannerFile && (
                    <p className="text-xs text-indigo-600 font-semibold">
                        Listo para guardar: {bannerFile.name}
                    </p>
                )}
            </div>

            {/* ── Color de marca (NUEVO) ── */}
            <div className="bg-white border rounded-xl p-6 space-y-4">
                <h2 className="font-bold text-gray-900">Color de marca</h2>

                <div className="flex items-center gap-4">
                    <input
                        type="color"
                        value={brandColor}
                        onChange={(e) => setBrandColor(e.target.value)}
                        className="h-12 w-12 rounded-lg border cursor-pointer p-1"
                    />
                    <div>
                        <p className="text-sm font-medium text-gray-700">Color principal</p>
                        <p className="text-xs text-gray-500 font-mono">{brandColor}</p>
                    </div>
                </div>

                <p className="text-xs text-gray-500">
                    Se usará en botones y elementos destacados de tu catálogo público.
                </p>
            </div>

            {/* ── Información general (original) ── */}
            <div className="bg-white border rounded-xl p-6 space-y-4">
                <h2 className="font-bold text-gray-900">Información general</h2>

                <div>
                    <label className="text-sm font-medium text-gray-700">Nombre</label>
                    <input
                        className="w-full mt-1 p-3 border rounded-lg"
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            setSlug(slugify(e.target.value));
                        }}
                    />
                </div>

                <div>
                    <label className="text-sm font-medium text-gray-700">Slug (URL pública)</label>
                    <input
                        className="w-full mt-1 p-3 border rounded-lg font-mono"
                        value={slug}
                        onChange={(e) => setSlug(slugify(e.target.value))}
                    />
                </div>

                <div>
                    <label className="text-sm font-medium text-gray-700">Descripción</label>
                    <textarea
                        className="w-full mt-1 p-3 border rounded-lg"
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>
            </div>

            {/* ── Catálogo público (original) ── */}
            <div className="bg-white border rounded-xl p-6 space-y-4">
                <h2 className="font-bold text-gray-900">Catálogo público</h2>

                <div className="text-sm text-gray-600 break-all">{catalogUrl}</div>

                <div className="flex gap-2">
                    <button
                        onClick={() => window.open(catalogUrl, "_blank")}
                        className="px-4 py-2 border rounded-lg font-semibold"
                    >
                        Abrir catálogo
                    </button>
                    <button
                        onClick={() => navigator.clipboard.writeText(catalogUrl)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold"
                    >
                        Copiar link
                    </button>
                </div>

                <label className="flex items-center gap-3 mt-2">
                    <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                    />
                    <span className="text-sm text-gray-700">
                        Tienda activa (visible al público)
                    </span>
                </label>
            </div>

            {/* ── Redes sociales y contacto (NUEVO) ── */}
            <div className="bg-white border rounded-xl p-6 space-y-4">
                <h2 className="font-bold text-gray-900">Redes sociales y contacto</h2>

                {/* WhatsApp principal */}
                <div>
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <i className="fa-brands fa-whatsapp text-green-500" />
                        WhatsApp principal (solo números)
                    </label>
                    <input
                        className="w-full mt-1 p-3 border rounded-lg"
                        placeholder="573001234567"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value.replace(/[^\d]/g, ""))}
                    />
                </div>

                {/* Instagram */}
                <div>
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <i className="fa-brands fa-instagram text-pink-500" />
                        Instagram
                    </label>
                    <div className="flex mt-1">
                        <span className="inline-flex items-center px-3 border border-r-0 rounded-l-lg bg-gray-50 text-gray-500 text-sm">
                            @
                        </span>
                        <input
                            className="flex-1 p-3 border rounded-r-lg"
                            placeholder="tu_usuario"
                            value={instagram}
                            onChange={(e) => setInstagram(e.target.value.replace(/\s/g, ""))}
                        />
                    </div>
                </div>

                {/* Facebook */}
                <div>
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <i className="fa-brands fa-facebook text-blue-600" />
                        Facebook
                    </label>
                    <div className="flex mt-1">
                        <span className="inline-flex items-center px-3 border border-r-0 rounded-l-lg bg-gray-50 text-gray-500 text-sm">
                            facebook.com/
                        </span>
                        <input
                            className="flex-1 p-3 border rounded-r-lg"
                            placeholder="tu.pagina"
                            value={facebook}
                            onChange={(e) => setFacebook(e.target.value.replace(/\s/g, ""))}
                        />
                    </div>
                </div>

                {/* Correo */}
                <div>
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <i className="fa-regular fa-envelope text-gray-500" />
                        Correo electrónico
                    </label>
                    <input
                        type="email"
                        className="w-full mt-1 p-3 border rounded-lg"
                        placeholder="contacto@tunegocio.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                {/* Teléfono */}
                <div>
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <i className="fa-solid fa-phone text-gray-500" />
                        Teléfono
                    </label>
                    <input
                        className="w-full mt-1 p-3 border rounded-lg"
                        placeholder="3001234567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s()-]/g, ""))}
                    />
                </div>

                {/* Ubicación */}
                <div>
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <i className="fa-solid fa-location-dot text-red-500" />
                        Ubicación / Dirección
                    </label>
                    <input
                        className="w-full mt-1 p-3 border rounded-lg"
                        placeholder="Calle 10 # 5-20, Ibagué, Tolima"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                    />
                </div>
            </div>

            {/* ── Guardar (original) ── */}
            {error && <div className="text-sm text-red-600">{error}</div>}

            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold disabled:opacity-60"
                >
                    {saving ? "Guardando..." : "Guardar cambios"}
                </button>
            </div>
        </div>
    );
};

export default SettingsView;