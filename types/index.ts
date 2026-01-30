export type ImageItem = { url: string; path: string };

export type ProductOption = {
    name: string;      // e.g. "Color"
    values: string[];  // e.g. ["Rojo", "Azul"]
};

export type Variant = {
    id: string;              // simple id
    title: string;           // "Rojo / M"
    optionValues: string[];  // ["Rojo", "M"]
    price: number;           // int COP
    stock?: number;
    sku?: string;
    imageIndex?: number;     // index en images[]
    video?: VideoItem | null;
};

export type Product = {
    id: string;
    name: string;
    description?: string;
    price: number;
    categoryId: string;
    imageUrl?: string;
    images?: ImageItem[];
    variants?: Variant[];
};

export type Category = { id: string; name: string; order: number };

export type CartItem = {
    productId: string;
    productName: string;
    variantId?: string;
    variantTitle?: string;
    unitPrice: number; // COP int
    qty: number;
    imageUrl?: string;
};


export type OrderStatus = "new" | "confirmed" | "preparing" | "delivered" | "cancelled";

export type OrderItem = {
    productId: string;
    productName: string;
    variantId?: string | null;
    variantTitle?: string | null;
    unitPrice: number; // COP int
    qty: number;
    subtotal: number; // unitPrice * qty
};

export type Order = {
    id: string;
    status: OrderStatus;
    channel?: "whatsapp" | "manual";
    customer: {
        name: string;
        phone: string;
        address: string;
    };
    notes?: string;
    items: OrderItem[];
    total: number; // COP int
    createdAt?: any;
    updatedAt?: any;
};

export type Client = {
    id: string; // phone como id
    name: string;
    phone: string;
    address: string;

    totalOrders: number;
    totalSpent: number; // COP int
    lastOrderAt?: any;

    createdAt?: any;
    updatedAt?: any;
};

export type VideoItem = {
    url: string;
    path: string;
    thumbUrl?: string;
    durationSec?: number;
    optimizedUrl?: string;
    originalUrl?: string;
};
