import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDocs,
  where,
  limit,
  doc,
  runTransaction,
  increment,
  QueryDocumentSnapshot,
  DocumentData,
  startAfter,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Product, Store } from "@/interfaces";
import { CartItem, Category, Variant } from "@/types";
import { buildWaLink, calcTotal, cartStorageKey, formatCOP, getProductDisplayPrice, getProductMainImage, norm } from "@/helpers";
import { ImageCarousel } from "@/components/catalog/ImageCarousel";
import { cldImg } from "@/helpers/cloudinaryUpload";

const PAGE_SIZE = 20;


const CatalogView: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();

  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Cart + checkout
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);

  // Checkout form
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");

  const [search, setSearch] = useState("");
  const [queryError, setQueryError] = useState<string | null>(null);


  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastDoc, setLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  // Variant picker modal
  const [productModal, setProductModal] = useState<{
    open: boolean;
    product: Product | null;
    selectedVariantId?: string | null;
  }>({ open: false, product: null, selectedVariantId: null });

  const total = useMemo(() => calcTotal(cart), [cart]);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const filteredProducts = useMemo(() => {
    const q = norm(search);
    const byCategory =
      activeCategoryId === "all"
        ? products
        : products.filter((p) => p.categoryId === activeCategoryId);

    if (!q) return byCategory;

    const base = byCategory;

    return base.filter((p) => {
      const catName = categoryNameById.get(p.categoryId) || "";

      const variantsText = (p.variants || [])
        .map((v: any) => `${v.title ?? ""} ${v.sku ?? ""}`)
        .join(" ");

      const priceText = `${p.price ?? ""} ${(p.variants || []).map((v: any) => v.price ?? "").join(" ")}`;

      const haystack = norm(
        `${p.name} ${p.sku ?? ""} ${p.description} ${catName} ${variantsText} ${priceText}`
      );

      return haystack.includes(q);
    });
  }, [products, activeCategoryId, search, categoryNameById]);

  useEffect(() => {
    if (!categories.length) return;
    if (activeCategoryId !== "all") return;
    setActiveCategoryId("all");
  }, [categories]);

  useEffect(() => {
    if (!slug) return;
    try {
      const raw = localStorage.getItem(cartStorageKey(slug));
      if (raw) setCart(JSON.parse(raw));
    } catch { }
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    localStorage.setItem(cartStorageKey(slug), JSON.stringify(cart));
  }, [cart, slug]);

  useEffect(() => {
    const fetchStoreBySlug = async () => {
      if (!slug) return;
      setLoading(true);

      const qStore = query(collection(db, "stores"), where("slug", "==", slug), limit(1));
      const snap = await getDocs(qStore);

      if (!snap.empty) {
        const storeDoc = snap.docs[0];
        const data = storeDoc.data() as any;
        const s: Store = { id: storeDoc.id, ...(data as any) };

        if (s.isActive === false) {
          setStore(null);
          setLoading(false);
          return;
        }

        setStore(s);
        document.title = `${s.name} | Catálogo`;
      } else {
        setStore(null);
        setLoading(false);
      }
    };
    fetchStoreBySlug();
  }, [slug]);

  useEffect(() => {
    if (!store) return;

    const qCats = query(
      collection(db, "stores", store.id, "categories"),
      orderBy("order", "asc")
    );

    const unsubscribeCats = onSnapshot(qCats, (snap) => {
      setCategories(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });

    return () => unsubscribeCats();
  }, [store]);

  const addToCart = (prod: Product, variant?: Variant) => {
    const unitPrice = variant ? Number(variant.price || 0) : Number(prod.price || 0);
    if (!unitPrice) return;

    if (variant && typeof variant.stock === "number" && variant.stock <= 0) {
      alert("Esta variante está agotada.");
      return;
    }

    const item: CartItem = {
      productId: prod.id,
      productName: prod.name,
      variantId: variant?.id,
      variantTitle: variant?.title,
      unitPrice,
      qty: 1,
      imageUrl: getProductMainImage(prod),
    };

    setCart((prev) => {
      const idx = prev.findIndex(
        (x) => x.productId === item.productId && (x.variantId || "") === (item.variantId || "")
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...prev, item];
    });
  };

  const changeQty = (index: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      const it = next[index];
      if (!it) return prev;

      const q = it.qty + delta;
      const prod = products.find(p => p.id === it.productId);
      const v = prod?.variants?.find(vv => vv.id === it.variantId);

      const maxStock =
        v && typeof v.stock === "number" ? v.stock : undefined;

      if (maxStock !== undefined && q > maxStock) return prev;

      if (q <= 0) next.splice(index, 1);
      else next[index] = { ...it, qty: q };
      return next;
    });
  };

  const clearCart = () => setCart([]);

  const openAddFlow = (prod: Product) => {
    setProductModal({ open: true, product: prod, selectedVariantId: null });
  };

  const placeOrder = async () => {
    if (!store) return;
    if (!cart.length) return;

    const cleanName = customerName.trim();
    const cleanPhone = customerPhone.trim().replace(/[^\d]/g, "");
    const cleanAddress = customerAddress.trim();

    if (!cleanName) return alert("Escribe tu nombre.");
    if (!cleanPhone) return alert("Escribe tu teléfono.");
    if (!cleanAddress) return alert("Escribe tu dirección.");

    if (!/^\d{7,15}$/.test(cleanPhone)) return alert("Teléfono inválido. Usa solo números.");
    if (!store.whatsapp) return alert("Esta tienda no tiene WhatsApp configurado.");

    setPlacingOrder(true);

    try {
      const items = cart.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        variantId: it.variantId ?? null,
        variantTitle: it.variantTitle ?? null,
        unitPrice: it.unitPrice,
        qty: it.qty,
        subtotal: it.unitPrice * it.qty,
      }));

      const orderTotal = calcTotal(cart);

      // refs
      const clientRef = doc(db, "stores", store.id, "clients", cleanPhone); // clientId = phone
      const orderRef = doc(collection(db, "stores", store.id, "orders"));   // id automático

      // Transacción: upsert cliente + crear orden
      await runTransaction(db, async (tx) => {
        const clientSnap = await tx.get(clientRef);

        // Upsert cliente
        if (!clientSnap.exists()) {
          tx.set(clientRef, {
            name: cleanName,
            phone: cleanPhone,
            address: cleanAddress,
            notes: "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastOrderAt: serverTimestamp(),
            totalOrders: 1,
            totalSpent: orderTotal,
          });
        } else {
          // Si existe, actualiza datos y contadores
          tx.update(clientRef, {
            name: cleanName,            // si cambia, lo actualizamos
            address: cleanAddress,      // si cambia, lo actualizamos
            updatedAt: serverTimestamp(),
            lastOrderAt: serverTimestamp(),
            totalOrders: increment(1),
            totalSpent: increment(orderTotal),
          });
        }

        // Crear pedido y referenciar al cliente
        tx.set(orderRef, {
          status: "new",
          channel: "whatsapp",
          clientId: cleanPhone, // referencia al cliente
          customer: {
            name: cleanName,
            phone: cleanPhone,
            address: cleanAddress,
          },
          notes: customerNotes.trim() || "",
          items,
          total: orderTotal,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      // Mensaje a WhatsApp (usa orderRef.id)
      const lines: string[] = [];
      lines.push("🛒 *Nuevo pedido*");
      lines.push(`Tienda: *${store.name}*`);
      lines.push(`Pedido ID: ${orderRef.id}`);
      lines.push("");
      lines.push(`👤 Cliente: *${cleanName}*`);
      lines.push(`📞 Tel: ${cleanPhone}`);
      lines.push(`📍 Dirección: ${cleanAddress}`);
      if (customerNotes.trim()) lines.push(`📝 Notas: ${customerNotes.trim()}`);
      lines.push("");
      lines.push("📦 *Productos*:");
      cart.forEach((it) => {
        const v = it.variantTitle ? ` (${it.variantTitle})` : "";
        lines.push(`- ${it.qty} x ${it.productName}${v} — ${formatCOP(it.unitPrice * it.qty)}`);
      });
      lines.push("");
      lines.push(`💰 *Total:* ${formatCOP(orderTotal)}`);

      const waUrl = buildWaLink(store.whatsapp, lines.join("\n"));

      clearCart();
      setCheckoutOpen(false);

      window.open(waUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error(e);
      alert("No se pudo crear el pedido. Intenta de nuevo.");
    } finally {
      setPlacingOrder(false);
    }
  };

  const getDiscountBadge = (p: Product) => {
    const d = p.discount;
    if (!d || !d.value) return null;

    if (d.type === "percent") {
      const pct = Math.min(100, Math.max(0, Number(d.value) || 0));
      if (!pct) return null;
      return `-${pct}%`;
    }

    const amt = Math.max(0, Number(d.value) || 0);
    if (!amt) return null;
    return `-${formatCOP(amt)}`;
  };

  const getFinalPriceNumber = (p: Product) => {
    const base = Number(p.price || 0);
    const d = p.discount;

    if (!d || !d.value) return base;

    if (d.type === "percent") {
      const pct = Math.min(100, Math.max(0, Number(d.value) || 0));
      return Math.max(0, Math.round(base * (1 - pct / 100)));
    }

    const amt = Math.max(0, Number(d.value) || 0);
    return Math.max(0, base - amt);
  };

  const hasValidDiscount = (p: Product) => {
    const d = p.discount;
    if (!d || !d.value) return false;
    if (d.type === "percent") return Number(d.value) > 0;
    return Number(d.value) > 0;
  };

  const fetchFirstPage = async () => {
    if (!store) return;

    setLoading(true);
    setQueryError(null);

    try {
      const baseRef = collection(db, "stores", store.id, "products");

      const constraints: any[] = [
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE + 1),
      ];

      if (activeCategoryId !== "all") {
        constraints.unshift(where("categoryId", "==", activeCategoryId));
      }

      const qProds = query(baseRef, ...constraints);
      const snap = await getDocs(qProds);
      const docs = snap.docs;

      const more = docs.length > PAGE_SIZE;
      const pageDocs = more ? docs.slice(0, PAGE_SIZE) : docs;

      setProducts(pageDocs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Product[]);
      setHasMore(more);
      setLastDoc(pageDocs[pageDocs.length - 1] ?? null);
    } catch (e: any) {
      console.error("fetchFirstPage error:", e);

      // Mensaje amigable si es índice faltante
      const msg =
        String(e?.message || "").toLowerCase().includes("index")
          ? "Falta un índice en Firestore para filtrar por categoría. Revisa la consola (hay un link automático para crearlo)."
          : "Error consultando productos. Revisa la consola.";

      setQueryError(msg);

      setProducts([]);
      setHasMore(false);
      setLastDoc(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchMorePage = async () => {
    if (!store || !lastDoc || !hasMore || loadingMore) return;

    setLoadingMore(true);
    setQueryError(null);

    try {
      const baseRef = collection(db, "stores", store.id, "products");

      const constraints: any[] = [
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(PAGE_SIZE + 1),
      ];

      if (activeCategoryId !== "all") {
        constraints.unshift(where("categoryId", "==", activeCategoryId));
      }

      const qMore = query(baseRef, ...constraints);

      const snap = await getDocs(qMore);
      const docs = snap.docs;

      const more = docs.length > PAGE_SIZE;
      const pageDocs = more ? docs.slice(0, PAGE_SIZE) : docs;

      setProducts((prev) => [
        ...prev,
        ...(pageDocs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Product[]),
      ]);

      setHasMore(more);
      setLastDoc(pageDocs[pageDocs.length - 1] ?? lastDoc);
    } catch (e: any) {
      console.error("fetchMorePage error:", e);

      const msg =
        String(e?.message || "").toLowerCase().includes("index")
          ? "Falta un índice en Firestore para paginar por categoría. Revisa la consola para crearlo."
          : "Error cargando más productos. Revisa la consola.";

      setQueryError(msg);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!store) return;

    setProducts([]);
    setLastDoc(null);
    setHasMore(false);

    fetchFirstPage();
  }, [store?.id, activeCategoryId]);

  if (loading) return <div className="h-screen flex items-center justify-center">Cargando catálogo...</div>;
  if (!store) return <div className="h-screen flex items-center justify-center">Tienda no encontrada.</div>;


  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white pb-28">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            {/* Logo / Avatar */}
            <div className="shrink-0">
              {store.logoUrl ? (
                <div className="h-12 w-12 rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
                  <img
                    src={store.logoUrl}
                    alt={`Logo ${store.name}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="h-12 w-12 rounded-2xl bg-black text-white font-extrabold flex items-center justify-center shadow-sm">
                  {(store.name || "T").trim().slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            {/* Title */}
            <div className="min-w-0">
              <h1 className="font-extrabold text-base sm:text-xl text-gray-900 truncate">
                {store.name}
              </h1>
              <p className="text-[11px] sm:text-xs text-gray-500 truncate">
                Catálogo • Pedidos por WhatsApp
              </p>
            </div>

            {/* Cart */}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setCheckoutOpen(true)}
                className="relative inline-flex items-center gap-2 rounded-full bg-black text-white px-4 py-2 font-extrabold shadow-sm hover:bg-indigo-700 active:scale-[0.99] transition"
              >
                <i className="fa-solid fa-cart-shopping" />
                <span className="text-sm hidden sm:inline">Carrito</span>

                {cart.length > 0 ? (
                  <span className="ml-1 inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-white text-black text-xs font-black">
                    {cart.reduce((a, b) => a + b.qty, 0)}
                  </span>
                ) : null}
              </button>
            </div>
          </div>

          {/* Optional: línea fina elegante */}
          <div className="mt-4 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
        </div>
      </header>

      {/* Categories bar */}
      <div className="sticky top-[73px] sm:top-[80px] z-30 bg-white/80 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {/* All */}
            <button
              type="button"
              onClick={() => setActiveCategoryId("all")}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-extrabold border transition
          ${activeCategoryId === "all"
                  ? "bg-black text-white border-indigo-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
            >
              Todo
            </button>

            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-extrabold border transition
            ${activeCategoryId === cat.id
                    ? "bg-black text-white border-indigo-600"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Título de la vista */}

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, descripción, categoría, variante..."
              className="w-full pl-9 pr-10 py-2.5 rounded-2xl border border-gray-200 bg-white
                 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            {search.trim() ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                aria-label="Limpiar búsqueda"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {activeCategoryId === "all"
              ? "Mostrando todos los productos"
              : `Mostrando: ${(categories.find((c) => c.id === activeCategoryId)?.name) || "Categoría"
              }`}
          </div>

          {activeCategoryId !== "all" ? (
            <button
              type="button"
              onClick={() => setActiveCategoryId("all")}
              className="text-sm font-extrabold  hover:text-indigo-900"
            >
              Ver todo
            </button>
          ) : null}
        </div>

        {/* Grid productos */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-6 text-gray-500 shadow-sm">
            No hay productos en esta categoría.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filteredProducts.map((prod) => {
              const img = getProductMainImage(prod);
              const imgOptim = img ? cldImg(img, { w: 600, h: 600, crop: "fill" }) : "";
              const priceInfo = getProductDisplayPrice(prod);
              const hasVariants = (prod.variants?.length ?? 0) > 0;
              const badge = getDiscountBadge(prod);
              const hasDisc = hasValidDiscount(prod);
              const finalPriceNum = getFinalPriceNumber(prod);


              return (
                <div
                  key={prod.id}
                  className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition overflow-hidden flex flex-col"
                >
                  <div className="relative aspect-square bg-gray-100 overflow-hidden">
                    {img ? (
                      <img
                        src={imgOptim}
                        alt={prod.name}
                        className="relative z-10 h-full w-full object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-gray-400">
                        <i className="fa-regular fa-image text-2xl" />
                      </div>
                    )}

                    {/* Badge descuento */}
                    {badge ? (
                      <div className="absolute top-3 left-3 z-20">
                        <span className="inline-flex items-center rounded-full bg-yellow-400 text-white px-3 py-1 text-xs font-extrabold shadow-sm">
                          {badge}
                        </span>
                      </div>
                    ) : null}

                    {/* Label precio (tu label actual) */}
                    <div className="absolute left-3 bottom-3 z-20">
                      <span className="inline-flex items-center rounded-full bg-white/90 backdrop-blur px-3 py-1 text-xs font-extrabold  border border-indigo-50 shadow-sm">
                        {priceInfo.label}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 sm:p-4 flex-1 flex flex-col">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm sm:text-[15px] font-extrabold text-gray-900 ">
                          {prod.name}
                        </h3>

                        {/* En pantallas sm+ mantenemos el SKU al lado */}
                        {prod.sku ? (
                          <span className="hidden sm:inline-flex shrink-0 text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-1">
                            SKU: {prod.sku}
                          </span>
                        ) : null}
                      </div>

                      {/* En móvil mostramos el SKU debajo para que no corte el nombre */}
                      {prod.sku ? (
                        <span className="sm:hidden inline-flex w-fit text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-1">
                          SKU: {prod.sku}
                        </span>
                      ) : null}
                    </div>


                    {prod.description ? (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {prod.description}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">&nbsp;</p>
                    )}

                    {/* Precio tachado + final (solo si NO hay variantes) */}
                    {/* {!hasVariants ? (
                      <div className="mt-2">
                        {hasDisc ? (
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs text-gray-400 line-through font-bold">
                              {formatCOP(Number(prod.price || 0))}
                            </span>
                            <span className="text-sm font-extrabold ">
                              {formatCOP(finalPriceNum)}
                            </span>
                          </div>
                        ) : (
                          <div className="text-sm font-extrabold ">
                            {formatCOP(Number(prod.price || 0))}
                          </div>
                        )}
                      </div>
                    ) : null} */}


                    <button
                      onClick={() => openAddFlow(prod)}
                      className="mt-3 w-full rounded-xl py-2.5 text-xs sm:text-sm font-extrabold
                      bg-black text-white hover:bg-indigo-700 active:scale-[0.99] transition"
                    >
                      {hasVariants ? "Elegir variante" : "Añadir al carrito"}
                    </button>

                    {hasVariants ? (
                      <div className="mt-2 text-[11px] text-gray-500">
                        Variantes disponibles: <b>{prod.variants?.length}</b>
                      </div>
                    ) : null}
                  </div>
                </div>

              );
            })}
          </div>
        )}

        {hasMore ? (
          <div className="flex justify-center">
            <button
              onClick={fetchMorePage}
              disabled={loadingMore}
              className="px-5 py-3 rounded-2xl font-extrabold border bg-white hover:bg-gray-50 disabled:opacity-60"
            >
              {loadingMore ? "Cargando..." : "Cargar más"}
            </button>
          </div>
        ) : null}

      </main>

      {/* Bottom CTA */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[92%] max-w-md bg-gray-900 text-white p-4 rounded-2xl shadow-2xl flex justify-between items-center z-50">
          <div>
            <div className="font-extrabold">
              {cart.reduce((a, b) => a + b.qty, 0)} items
            </div>
            <div className="text-xs opacity-90">{formatCOP(total)}</div>
          </div>

          <button
            onClick={() => setCheckoutOpen(true)}
            className="bg-white text-gray-900 px-4 py-2 rounded-xl font-extrabold text-sm hover:bg-gray-100"
          >
            Finalizar
          </button>
        </div>
      )}

      {/* Variant Modal (mejorada) */}
      {productModal.open && productModal.product && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-xl">
            <div className="p-4 sm:p-6 border-b flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg sm:text-xl font-extrabold text-gray-900 truncate">
                  {productModal.product.name}
                </div>
                {productModal.product.description ? (
                  <div className="text-sm text-gray-500 line-clamp-2">
                    {productModal.product.description}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500"> </div>
                )}
              </div>

              <button
                onClick={() => setProductModal({ open: false, product: null, selectedVariantId: null })}
                className="h-10 w-10 rounded-full border flex items-center justify-center hover:bg-gray-50"
                aria-label="Cerrar"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-auto">
              <ImageCarousel
                images={(productModal.product.images || []).map((x: any) => x.url).filter(Boolean)}
                alt={productModal.product.name}
              />

              {(productModal.product.videos?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-extrabold text-gray-900">Videos</div>
                  <div className="grid grid-cols-1 gap-3">
                    {productModal.product.videos!.map((v: any) => (
                      <div key={v.path || v.url} className="rounded-2xl overflow-hidden border bg-black">
                        <video src={v.url} controls className="w-full h-56 object-contain" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Price */}
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">Precio</div>
                <div className="font-extrabold ">
                  {getProductDisplayPrice(productModal.product).label}
                </div>
              </div>

              {/* Variants */}
              {(productModal.product.variants?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-extrabold text-gray-900">Variantes</div>

                  <div className="grid grid-cols-1 gap-2">
                    {(productModal.product.variants || []).map((v) => {
                      const outOfStock = typeof v.stock === "number" && v.stock <= 0;
                      const selected = productModal.selectedVariantId === v.id;

                      return (
                        <button
                          key={v.id}
                          type="button"
                          disabled={outOfStock}
                          onClick={() =>
                            setProductModal((pm) => ({ ...pm, selectedVariantId: v.id }))
                          }
                          className={`w-full rounded-2xl p-4 border flex items-center justify-between text-left transition
                      ${outOfStock ? "opacity-50 cursor-not-allowed bg-gray-50" : "bg-white hover:bg-gray-50"}
                      ${selected ? "border-indigo-600 ring-2 ring-indigo-100" : "border-gray-200"}
                    `}
                        >
                          <div>
                            <div className="font-extrabold text-gray-900">{v.title}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              {typeof v.stock === "number" ? (outOfStock ? "Agotado" : `Stock: ${v.stock}`) : "Stock no definido"}
                            </div>
                          </div>
                          <div className="font-extrabold ">
                            {formatCOP(Number(v.price || 0))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-6 border-t bg-white">
              <button
                type="button"
                onClick={() => {
                  const p = productModal.product!;
                  const variants = p.variants || [];

                  if (variants.length > 0) {
                    const chosen = variants.find((v) => v.id === productModal.selectedVariantId);
                    if (!chosen) return alert("Selecciona una variante.");
                    addToCart(p, chosen);
                  } else {
                    addToCart(p);
                  }

                  setProductModal({ open: false, product: null, selectedVariantId: null });
                }}
                className="w-full rounded-2xl py-3 font-extrabold bg-black text-white hover:bg-indigo-700"
              >
                Añadir al carrito
              </button>

              <button
                type="button"
                onClick={() => setProductModal({ open: false, product: null, selectedVariantId: null })}
                className="w-full rounded-2xl py-3 font-extrabold border hover:bg-gray-50 mt-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Drawer (móvil) + Modal (desktop) */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-3xl h-full overflow-hidden shadow-2xl">
            {/* header */}
            <div className="p-4 sm:p-6 border-b flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-extrabold text-gray-900">Tu pedido</div>
                <div className="text-sm text-gray-500">Completa tus datos y envía por WhatsApp</div>
              </div>
              <button
                onClick={() => setCheckoutOpen(false)}
                className="h-10 w-10 rounded-full border flex items-center justify-center hover:bg-gray-50"
                aria-label="Cerrar"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-auto max-h-[70vh]">
              {/* cart list */}
              <div className="space-y-3">
                {cart.length === 0 ? (
                  <div className="text-gray-400">Tu carrito está vacío.</div>
                ) : (
                  cart.map((it, idx) => (
                    <div
                      key={`${it.productId}:${it.variantId || "base"}`}
                      className="flex gap-3 border border-gray-100 rounded-2xl p-3 shadow-sm"
                    >
                      <div className="w-16 h-16 rounded-2xl bg-gray-100 overflow-hidden border relative">
                        {it.imageUrl ? (
                          <>
                            <img
                              src={it.imageUrl ? cldImg(it.imageUrl, { w: 160, h: 160, crop: "fill" }) : ""}
                              alt={it.productName}
                              className="relative z-10 w-full h-full object-contain"
                              loading="lazy"
                            />
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <i className="fa-regular fa-image text-sm" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-extrabold text-gray-900 truncate">{it.productName}</div>
                        {it.variantTitle ? (
                          <div className="text-xs text-gray-500">{it.variantTitle}</div>
                        ) : null}
                        <div className="text-sm  font-extrabold mt-1">
                          {formatCOP(it.unitPrice)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Subtotal: <b>{formatCOP(it.unitPrice * it.qty)}</b>
                        </div>
                      </div>

                      <div className="flex flex-col items-end justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            className="w-9 h-9 rounded-xl border hover:bg-gray-50"
                            onClick={() => changeQty(idx, -1)}
                            type="button"
                          >
                            <i className="fa-solid fa-minus text-xs" />
                          </button>
                          <div className="w-6 text-center font-extrabold">{it.qty}</div>
                          <button
                            className="w-9 h-9 rounded-xl border hover:bg-gray-50"
                            onClick={() => changeQty(idx, +1)}
                            type="button"
                          >
                            <i className="fa-solid fa-plus text-xs" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* total */}
              {cart.length > 0 ? (
                <div className="mt-5 flex items-center justify-between border-t pt-4">
                  <div className="font-extrabold text-gray-900">Total</div>
                  <div className="font-black  text-lg">{formatCOP(total)}</div>
                </div>
              ) : null}

              {/* form */}
              <div className="mt-6 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-1">
                    <label className="text-xs font-semibold text-gray-600">Nombre</label>
                    <input
                      className="w-full mt-1 p-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="Tu nombre"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="text-xs font-semibold text-gray-600">Teléfono</label>
                    <input
                      className="w-full mt-1 p-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="Solo números"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600">Dirección</label>
                  <input
                    className="w-full mt-1 p-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="Tu dirección"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600">Notas (opcional)</label>
                  <textarea
                    className="w-full mt-1 p-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="Indicaciones para el pedido"
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            </div>

            {/* footer actions */}
            <div className="p-4 sm:p-6 border-t bg-white">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    clearCart();
                    setCheckoutOpen(false);
                  }}
                  className="flex-1 rounded-2xl p-3 font-extrabold border hover:bg-gray-50"
                  disabled={placingOrder}
                >
                  Vaciar
                </button>

                <button
                  type="button"
                  onClick={placeOrder}
                  className="flex-1 rounded-2xl p-3 font-extrabold bg-black text-white hover:bg-indigo-700 disabled:opacity-60"
                  disabled={placingOrder || cart.length === 0}
                >
                  {placingOrder ? "Enviando..." : "Enviar a WhatsApp"}
                </button>
              </div>

              <p className="text-xs text-gray-400 mt-3">
                Se creará el pedido y se abrirá WhatsApp para confirmarlo con la tienda.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

};

export default CatalogView;
