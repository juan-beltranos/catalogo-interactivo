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

    // form
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [description, setDescription] = useState("");
    const [whatsapp, setWhatsapp] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string>("");
    const [logoUploading, setLogoUploading] = useState(false);

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

            setLoading(false);
        };

        load();
    }, [user]);

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


    const catalogUrl = useMemo(() => {
        if (!store?.slug) return "";
        return `${window.location.origin}/#/${store.slug}`;
    }, [store?.slug]);

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

        if (logoFile) {
            const uploaded = await uploadStoreLogo();
            if (uploaded) logoPayload = uploaded;
        }

        try {
            await updateDoc(doc(db, "stores", store.id), {
                name: name.trim(),
                slug: cleanSlug,
                description: description.trim(),
                whatsapp: whatsapp.trim(),
                isActive,
                ...logoPayload,
                updatedAt: new Date(),
            });

            alert("Configuración guardada ✅");
            setStore({ ...store, name, slug: cleanSlug, description, whatsapp, isActive, ...logoPayload });
            if (logoPayload.logoUrl) setLogoPreview(logoPayload.logoUrl);
            setLogoFile(null);

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

                        {logoFile ? (
                            <p className="text-xs text-indigo-600 mt-1 font-semibold">
                                Listo para guardar: {logoFile.name}
                            </p>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* Info tienda */}
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

            {/* Catálogo */}
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

            {/* WhatsApp */}
            <div className="bg-white border rounded-xl p-6 space-y-4">
                <h2 className="font-bold text-gray-900">Pedidos</h2>

                <div>
                    <label className="text-sm font-medium text-gray-700">
                        WhatsApp (solo números)
                    </label>
                    <input
                        className="w-full mt-1 p-3 border rounded-lg"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value.replace(/[^\d]/g, ""))}
                    />
                </div>
            </div>

            {/* Guardar */}
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
