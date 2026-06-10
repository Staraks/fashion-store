import { AccountState, AdminCatalogOptions, AdminOrder, AdminProductDetail, AdminReview, AdminUser, AuthResponse, AuthUser, Product, ProductFilterOptions, ProductReviewSummary, UserOrder } from '../types';

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

const ERROR_FIELD_LABELS: Record<string, string> = {
  detail: '',
  email: 'Почта',
  identifier: 'Почта или имя пользователя',
  username: 'Имя пользователя',
  password: 'Пароль',
  password_confirm: 'Подтверждение пароля',
  non_field_errors: '',
};

function extractErrorMessage(errorBody: unknown, parentKey?: string): string | null {
  if (!errorBody) {
    return null;
  }

  if (typeof errorBody === 'string') {
    const fieldLabel = parentKey ? ERROR_FIELD_LABELS[parentKey] ?? parentKey : '';
    return fieldLabel ? `${fieldLabel}: ${errorBody}` : errorBody;
  }

  if (Array.isArray(errorBody)) {
    const messages = errorBody.map((item) => extractErrorMessage(item)).filter(Boolean);
    const fieldLabel = parentKey ? ERROR_FIELD_LABELS[parentKey] ?? parentKey : '';
    const message = messages.join(' ');
    return fieldLabel && message ? `${fieldLabel}: ${message}` : message;
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

async function requestFile(path: string, init?: RequestInit): Promise<{ blob: Blob; filename: string | null }> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);

  if (!response.ok) {
    let errorMessage = `API request failed: ${response.status}`;

    try {
      const errorBody = await response.json();
      errorMessage = extractErrorMessage(errorBody) || errorMessage;
    } catch {
      try {
        errorMessage = (await response.text()) || errorMessage;
      } catch {
        // ignore non-text errors
      }
    }

    throw new Error(errorMessage);
  }

  const disposition = response.headers.get('Content-Disposition');
  const filenameMatch = disposition?.match(/filename="?([^"]+)"?/i);

  return {
    blob: await response.blob(),
    filename: filenameMatch?.[1] ?? null,
  };
}

function normalizeProduct(product: ApiProduct): Product {
  return {
    ...product,
    id: String(product.id),
    similarity: typeof product.similarity === 'number' ? product.similarity : undefined,
    images: Array.isArray(product.images) ? product.images : [],
    sizes: Array.isArray(product.sizes) ? product.sizes : [],
    oldPrice: product.oldPrice ?? undefined,
    isBestseller: Boolean(product.isBestseller),
    isVisible: product.isVisible !== false,
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

  searchByImage: async (file: File, gender?: string | null) => {
    const formData = new FormData();
    formData.append('file', file);
    const searchParams = new URLSearchParams();

    if (gender) {
      searchParams.set('gender', gender);
    }

    const query = searchParams.toString();
    const products = await request<ApiProduct[]>(`/api/search-by-image/${query ? `?${query}` : ''}`, {
      method: 'POST',
      body: formData,
    });

    return products.map(normalizeProduct);
  },

  getReviews: async (productId: string) =>
    request<ProductReviewSummary>(`/api/products/${productId}/reviews/`),

  createReview: async (
    token: string,
    productId: string,
    payload: { rating: number; comment: string }
  ) =>
    request(`/api/products/${productId}/reviews/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(token),
      },
      body: JSON.stringify(payload),
    }),
};

export const authAPI = {
  register: async (payload: {
    username: string;
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

  updateAvatar: async (token: string, file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);

    return request<AuthUser>('/api/auth/me/', {
      method: 'PATCH',
      headers: {
        ...getAuthHeaders(token),
      },
      body: formData,
    });
  },

  requestPasswordReset: async (token: string, email: string) =>
    request<{ detail: string }>('/api/auth/password-reset/request/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(token),
      },
      body: JSON.stringify({ email }),
    }),

  confirmPasswordReset: async (payload: {
    uid: string;
    token: string;
    password: string;
    password_confirm: string;
  }) =>
    request<{ detail: string }>('/api/auth/password-reset/confirm/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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
    request<{ orderId: number; paymentId: string }>('/api/orders/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(token),
      },
      body: JSON.stringify(payload),
    }),

  list: async (token: string) =>
    request<UserOrder[]>('/api/orders/', {
      headers: {
        ...getAuthHeaders(token),
      },
    }),
};

export const adminAPI = {
  getCatalogOptions: async (token: string) =>
    request<AdminCatalogOptions>('/api/admin/catalog/options/', {
      headers: {
        ...getAuthHeaders(token),
      },
    }),

  getProducts: async (
    token: string,
    params?: {
      category?: string | null;
      subcategory?: string | null;
      brand?: string | null;
    }
  ) => {
    const searchParams = new URLSearchParams();

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
    return request<ApiProduct[]>(`/api/admin/products/${query ? `?${query}` : ''}`, {
      headers: {
        ...getAuthHeaders(token),
      },
    }).then((products) => products.map(normalizeProduct));
  },

  getProductDetail: async (token: string, productId: string) =>
    request<AdminProductDetail>(`/api/admin/products/${productId}/`, {
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
      isVisible?: boolean;
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
    formData.append('isVisible', String(payload.isVisible ?? true));
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

  updateProduct: async (
    token: string,
    productId: string,
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
      isVisible?: boolean;
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
    formData.append('isVisible', String(payload.isVisible ?? true));
    payload.genderIds.forEach((id) => formData.append('genderIds', String(id)));
    formData.append('sizes', JSON.stringify(payload.sizes));
    payload.images.forEach((file) => formData.append('images', file));

    return request<Product>(`/api/admin/products/${productId}/`, {
      method: 'PATCH',
      headers: {
        ...getAuthHeaders(token),
      },
      body: formData,
    }).then(normalizeProduct);
  },

  updateProductVisibility: async (token: string, productId: string, isVisible: boolean) =>
    request<Product>(`/api/admin/products/${productId}/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(token),
      },
      body: JSON.stringify({ isVisible }),
    }).then(normalizeProduct),

  deleteProduct: async (token: string, productId: string) =>
    request<void>(`/api/admin/products/${productId}/`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeaders(token),
      },
    }),

  getReviews: async (token: string, status?: string) => {
    const searchParams = new URLSearchParams();
    if (status) {
      searchParams.set('status', status);
    }

    return request<AdminReview[]>(`/api/admin/reviews/${searchParams.toString() ? `?${searchParams.toString()}` : ''}`, {
      headers: {
        ...getAuthHeaders(token),
      },
    });
  },

  updateReviewStatus: async (token: string, reviewId: number, status: 'approved' | 'rejected') =>
    request<AdminReview>(`/api/admin/reviews/${reviewId}/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(token),
      },
      body: JSON.stringify({ status }),
    }),

  getOrders: async (token: string) =>
    request<AdminOrder[]>('/api/admin/orders/', {
      headers: {
        ...getAuthHeaders(token),
      },
    }),

  updateOrderStatus: async (token: string, orderId: number, status: string) =>
    request<AdminOrder>(`/api/admin/orders/${orderId}/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(token),
      },
      body: JSON.stringify({ status }),
    }),

  getUsers: async (token: string) =>
    request<AdminUser[]>('/api/admin/users/', {
      headers: {
        ...getAuthHeaders(token),
      },
    }),

  updateUserRole: async (token: string, userId: number, role: string) =>
    request<AdminUser>(`/api/admin/users/${userId}/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(token),
      },
      body: JSON.stringify({ role }),
    }),

  downloadSalesReport: async (token: string, start: string, end: string) => {
    const searchParams = new URLSearchParams({ start, end });
    return requestFile(`/api/admin/reports/sales/?${searchParams.toString()}`, {
      headers: {
        ...getAuthHeaders(token),
      },
    });
  },
};
