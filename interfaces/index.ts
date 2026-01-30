import { ImageItem, ProductOption, Variant, VideoItem } from "@/types";

export interface Product {
    id: string;
    name: string;
    description?: string;
    price: number;
    categoryId: string;
    images: ImageItem[];
    options: ProductOption[];
    variants: Variant[];
    videos?: VideoItem[];
}

export interface Store {
    id: string;
    name: string;
    whatsapp: string;
    slug: string;
    address?: string;
    isActive?: boolean;
    createdAt: string;
    logoUrl?: string;
    logoPath?: string;
}

export interface SidebarProps {
    onNavigate?: () => void;
}

export interface SidebarItemProps {
    to: string;
    icon: string;
    label: string;
    active: boolean;
    onNavigate?: () => void;
}

export interface Category {
  id: string;
  name: string;
  order: number;
}