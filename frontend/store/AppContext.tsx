import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

import { accountAPI, authAPI, ordersAPI } from '../services/api';
import { AccountState, AuthUser, CartItem, Product } from '../types';

const AUTH_TOKEN_KEY = 'fashion-store-auth-token';
const CART_STORAGE_KEY = 'fashion-store-cart';
const FAVORITES_STORAGE_KEY = 'fashion-store-favorites';

interface AppContextType {
  cart: CartItem[];
  favorites: Product[];
  user: AuthUser | null;
  authToken: string | null;
  authLoading: boolean;
  addToCart: (product: Product, size: string) => void;
  removeFromCart: (productId: string, size: string) => void;
  updateQuantity: (productId: string, size: string, delta: number) => void;
  toggleFavorite: (product: Product) => void;
  isFavorite: (productId: string) => boolean;
  clearCart: () => void;
  setAuthSession: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  placeOrder: (shippingAddress: string) => Promise<number>;
  cartTotal: number;
  cartCount: number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function readStoredItems<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const skipNextSyncRef = useRef(false);
  const hasLoadedAuthStateRef = useRef(false);

  useEffect(() => {
    setCart(readStoredItems<CartItem>(CART_STORAGE_KEY));
    setFavorites(readStoredItems<Product>(FAVORITES_STORAGE_KEY));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    const savedToken = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (!savedToken) {
      setAuthLoading(false);
      hasLoadedAuthStateRef.current = true;
      return;
    }

    setAuthToken(savedToken);
    authAPI
      .me(savedToken)
      .then(async (currentUser) => {
        setUser(currentUser);
        const state = await accountAPI.getState(savedToken);
        skipNextSyncRef.current = true;
        setCart(state.cart);
        setFavorites(state.favorites);
      })
      .catch(() => {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
        setAuthToken(null);
        setUser(null);
      })
      .finally(() => {
        setAuthLoading(false);
        hasLoadedAuthStateRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (!authToken || !user || !hasLoadedAuthStateRef.current) {
      return;
    }

    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }

    accountAPI
      .syncState(authToken, { cart, favorites })
      .then((state) => {
        skipNextSyncRef.current = true;
        setCart(state.cart);
        setFavorites(state.favorites);
      })
      .catch(() => {
        // keep local state if sync failed; next change will retry
      });
  }, [authToken, user, cart, favorites]);

  const setAuthSession = async (token: string, nextUser: AuthUser) => {
    skipNextSyncRef.current = true;
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    setAuthToken(token);
    setUser(nextUser);

    const syncedState = await accountAPI.syncState(token, { cart, favorites });
    skipNextSyncRef.current = true;
    setCart(syncedState.cart);
    setFavorites(syncedState.favorites);
  };

  const logout = async () => {
    if (authToken) {
      try {
        await authAPI.logout(authToken);
      } catch {
        // ignore logout network failures and clear local session anyway
      }
    }

    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
  };

  const addToCart = (product: Product, size: string) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id && item.selectedSize === size);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id && item.selectedSize === size
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...prev, { ...product, quantity: 1, selectedSize: size }];
    });
  };

  const removeFromCart = (productId: string, size: string) => {
    setCart((prev) => prev.filter((item) => !(item.id === productId && item.selectedSize === size)));
  };

  const updateQuantity = (productId: string, size: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === productId && item.selectedSize === size) {
          return { ...item, quantity: Math.max(1, item.quantity + delta) };
        }
        return item;
      })
    );
  };

  const toggleFavorite = (product: Product) => {
    setFavorites((prev) => {
      const exists = prev.some((item) => item.id === product.id);
      if (exists) {
        return prev.filter((item) => item.id !== product.id);
      }
      return [...prev, product];
    });
  };

  const isFavorite = (productId: string) => favorites.some((item) => item.id === productId);
  const clearCart = () => setCart([]);
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const placeOrder = async (shippingAddress: string) => {
    if (!authToken) {
      throw new Error('Для оформления заказа нужно войти в аккаунт.');
    }

    const response = await ordersAPI.create(authToken, { shipping_address: shippingAddress });
    skipNextSyncRef.current = true;
    setCart([]);
    return response.orderId;
  };

  return (
    <AppContext.Provider
      value={{
        cart,
        favorites,
        user,
        authToken,
        authLoading,
        addToCart,
        removeFromCart,
        updateQuantity,
        toggleFavorite,
        isFavorite,
        clearCart,
        setAuthSession,
        logout,
        placeOrder,
        cartTotal,
        cartCount,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
