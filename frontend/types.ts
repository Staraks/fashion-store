export interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  oldPrice?: number;
  material: string;
  color: string;
  similarity?: number;
  category: 'men' | 'women' | 'accessories';
  subcategory: string;
  images: string[];
  description: string;
  sizes: string[];
  isBestseller?: boolean;
  isVisible: boolean;
}

export interface CartItem extends Product {
  quantity: number;
  selectedSize: string;
}

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  role: string;
  isStaff: boolean;
  isSuperuser: boolean;
  avatarUrl?: string | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface ProductReview {
  id: number;
  username: string;
  avatarUrl?: string | null;
  rating: number;
  comment: string;
  status?: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface AdminReview extends ProductReview {
  status: 'pending' | 'approved' | 'rejected';
  productId: number;
  productName: string;
  productBrand: string;
  productPrice: number;
  productImage?: string | null;
  userEmail: string;
  moderatedBy?: string | null;
  moderatedAt?: string | null;
}

export interface ProductReviewSummary {
  averageRating: number | null;
  reviewsCount: number;
  reviews: ProductReview[];
}

export interface OrderItem {
  id: number;
  productId: string;
  productName: string;
  brand: string;
  image: string | null;
  size: string;
  quantity: number;
  price: number;
  lineTotal: number;
}

export interface UserOrder {
  id: number;
  status: string;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  paymentId: string;
  shippingAddress: string;
  createdAt: string;
  itemsCount: number;
  items: OrderItem[];
}

export interface AdminOrder extends UserOrder {
  customer: {
    id: number;
    username: string;
    email: string;
  } | null;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string;
  isStaff: boolean;
  isSuperuser: boolean;
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

export interface AdminProductImage {
  id: number;
  url: string;
  is_primary: boolean;
  sort_order: number;
}

export interface AdminProductDetail {
  id: number;
  name: string;
  brand: string;
  material: string;
  description: string;
  basePrice: string;
  discountPercent: string;
  categoryId: number | null;
  subcategoryId: number | null;
  genderIds: number[];
  color: string;
  sizes: Array<{ sizeId: number; stockQuantity: number }>;
  images: AdminProductImage[];
  isVisible: boolean;
}
