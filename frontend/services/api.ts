import { AccountState, AdminCatalogOptions, AuthResponse, AuthUser, Product, ProductFilterOptions } from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

type ApiProduct = Product & {
  similarity?: number;
};

function getAuthHeaders(token?: string) {
  return token
    ? {
        Authorization: `Token ${token}`,
      }
    : {};
}

function extractErrorMessage(errorBody: unknown, parentKey?: string): string | null {
  if (!errorBody) {
    return null;
  }

  if (typeof errorBody === 'string') {
    return parentKey ? `${parentKey}: ${errorBody}` : errorBody;
  }

  if (Array.isArray(errorBody)) {
    return errorBody.map((item) => extractErrorMessage(item, parentKey)).filter(Boolean).join(' ');
  }

  if (typeof errorBody === 'object') {
    const values = Object.entries(errorBody as Record<string, unknown>)
      .map(([key, value]) => extractErrorMessage(value, key === 'non_field_errors' ? parentKey : key))
      .filter(Boolean);

    return values.length > 0 ? values.join(' ') : null;
  }

  return null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);

  if (!response.ok) {
    let errorMessage = `API request failed: ${response.status}`;

    try {
      const errorBody = await response.json();
      errorMessage = extractErrorMessage(errorBody) || errorMessage;
    } catch {
      // ignore non-json errors
    }

    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function normalizeProduct(product: ApiProduct): Product {
  return {
    ...product,
    id: String(product.id),
    images: Array.isArray(product.images) ? product.images : [],
    sizes: Array.isArray(product.sizes) ? product.sizes : [],
    oldPrice: product.oldPrice ?? undefined,
    isBestseller: Boolean(product.isBestseller),
  };
}

function normalizeCartItem(item: ApiProduct & { quantity: number; selectedSize: string }) {
  return {
    ...normalizeProduct(item),
    quantity: item.quantity,
    selectedSize: item.selectedSize,
  };
}

function normalizeAccountState(state: AccountState): AccountState {
  return {
    favorites: state.favorites.map(normalizeProduct),
    cart: state.cart.map(normalizeCartItem),
  };
}

export const productsAPI = {
  getAll: async (params?: {
    gender?: string | null;
    category?: string | null;
    subcategory?: string | null;
    brand?: string | null;
  }) => {
    const searchParams = new URLSearchParams();

    if (params?.gender) {
      searchParams.set('gender', params.gender);
    }

    if (params?.category) {
      searchParams.set('category', params.category);
    }

    if (params?.subcategory) {
      searchParams.set('subcategory', params.subcategory);
    }

    if (params?.brand) {
      searchParams.set('brand', params.brand);
    }

    const query = searchParams.toString();
    const products = await request<ApiProduct[]>(`/api/products/${query ? `?${query}` : ''}`);
    return products.map(normalizeProduct);
  },

  getBestsellers: async () => {
    const products = await request<ApiProduct[]>('/api/products/bestsellers/');
    return products.map(normalizeProduct);
  },

  getById: async (id: string) => {
    try {
      const product = await request<ApiProduct>(`/api/products/${id}/`);
      return normalizeProduct(product);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return undefined;
      }
      throw error;
    }
  },

  getByCategory: async (category: string) => productsAPI.getAll({ gender: category }),

  getByBrand: async (brand: string) => productsAPI.getAll({ brand }),

  getFilters: async (params?: { gender?: string | null; category?: string | null }) => {
    const searchParams = new URLSearchParams();

    if (params?.gender) {
      searchParams.set('gender', params.gender);
    }

    if (params?.category) {
      searchParams.set('category', params.category);
    }

    const query = searchParams.toString();
    return request<ProductFilterOptions>(`/api/products/filters/${query ? `?${query}` : ''}`);
  },

  searchByImage: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const products = await request<ApiProduct[]>('/api/search-by-image/', {
      method: 'POST',
      body: formData,
    });

    return products.map(normalizeProduct);
  },
};

export const authAPI = {
  register: async (payload: {
    name: string;
    email: string;
    password: string;
    password_confirm: string;
  }) =>
    request<AuthResponse>('/api/auth/register/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }),

  login: async (payload: { identifier: string; password: string }) =>
    request<AuthResponse>('/api/auth/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }),

  me: async (token: string) =>
    request<AuthUser>('/api/auth/me/', {
      headers: {
        ...getAuthHeaders(token),
      },
    }),

  logout: async (token: string) =>
    request<void>('/api/auth/logout/', {
      method: 'POST',
      headers: {
        ...getAuthHeaders(token),
      },
    }),
};

export const accountAPI = {
  getState: async (token: string) =>
    normalizeAccountState(
      await request<AccountState>('/api/account/state/', {
        headers: {
          ...getAuthHeaders(token),
        },
      })
    ),

  syncState: async (token: string, state: AccountState) =>
    normalizeAccountState(
      await request<AccountState>('/api/account/sync/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(token),
        },
        body: JSON.stringify({
          favorites: state.favorites.map((item) => item.id),
          cart: state.cart.map((item) => ({
            productId: item.id,
            size: item.selectedSize,
            quantity: item.quantity,
          })),
        }),
      })
    ),
};

export const ordersAPI = {
  create: async (token: string, payload: { shipping_address: string }) =>
    request<{ orderId: number }>('/api/orders/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(token),
      },
      body: JSON.stringify(payload),
    }),
};

export const adminAPI = {
  getCatalogOptions: async (token: string) =>
    request<AdminCatalogOptions>('/api/admin/catalog/options/', {
      headers: {
        ...getAuthHeaders(token),
      },
    }),

  createProduct: async (
    token: string,
    payload: {
      name: string;
      brand: string;
      material: string;
      description: string;
      basePrice: string;
      discountPercent: string;
      categoryId: string;
      genderIds: number[];
      color: string;
      sizes: Array<{ sizeId: number; stockQuantity: number }>;
      images: File[];
      primaryImageIndex: number;
    }
  ) => {
    const formData = new FormData();
    formData.append('name', payload.name);
    formData.append('brand', payload.brand);
    formData.append('material', payload.material);
    formData.append('description', payload.description);
    formData.append('base_price', payload.basePrice);
    formData.append('discount_percent', payload.discountPercent || '0');
    formData.append('categoryId', payload.categoryId);
    formData.append('color', payload.color);
    formData.append('primaryImageIndex', String(payload.primaryImageIndex));
    payload.genderIds.forEach((id) => formData.append('genderIds', String(id)));
    formData.append('sizes', JSON.stringify(payload.sizes));
    payload.images.forEach((file) => formData.append('images', file));

    return request<Product>('/api/admin/products/', {
      method: 'POST',
      headers: {
        ...getAuthHeaders(token),
      },
      body: formData,
    }).then(normalizeProduct);
  },
};
