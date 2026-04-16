export interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  oldPrice?: number;
  category: 'men' | 'women' | 'accessories';
  subcategory: string;
  images: string[];
  description: string;
  sizes: string[];
  isBestseller?: boolean;
}

export interface CartItem extends Product {
  quantity: number;
  selectedSize: string;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  username: string;
  role: string;
  isStaff: boolean;
  isSuperuser: boolean;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface AccountState {
  favorites: Product[];
  cart: CartItem[];
}

export interface ProductFilterOptions {
  categories: Array<{ name: string; slug: string }>;
  subcategories: Array<{ name: string; slug: string; parentSlug: string | null }>;
  brands: string[];
}

export interface AdminCategoryOption {
  id: number;
  name: string;
  slug: string | null;
  parentId: number | null;
  parentName: string | null;
  sizeGroup: 'alpha' | 'denim' | 'shoes';
}

export interface AdminGenderOption {
  id: number;
  name: string;
}

export interface AdminSizeOption {
  id: number;
  name: string;
}

export interface AdminCatalogOptions {
  categories: AdminCategoryOption[];
  genders: AdminGenderOption[];
  sizes: AdminSizeOption[];
  brands: string[];
}
