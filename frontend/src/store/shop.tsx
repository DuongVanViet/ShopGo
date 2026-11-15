'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { api, messageOf } from '@/lib/api';
import type { Cart, Page, Store, User } from '@/types';

const STORE_SELECTION_KEY = 'shopgo-customer-store-v2';

interface ShopContext {
  stores: Store[];
  store: Store | null;
  setStore: (id: string) => void;
  refreshStores: () => Promise<void>;
  storesError: string;
  token: string | null;
  user: User | null;
  login: (token: string) => Promise<User>;
  updateUser: (user: User) => void;
  logout: () => Promise<void>;
  cart: Cart | null;
  cartError: unknown;
  refreshCart: () => Promise<Cart | null>;
  authOpen: boolean;
  openAuth: () => void;
  openDemoAuth: () => void;
  closeAuth: () => void;
  notice: (text: string, error?: boolean) => void;
  toast: { text: string; error: boolean } | null;
}
const Context = createContext<ShopContext | null>(null);
export function ShopProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]),
    [storeId, setStoreId] = useState(''),
    [storesError, setStoresError] = useState('');
  const [token, setToken] = useState<string | null>(null),
    [user, setUser] = useState<User | null>(null),
    [cart, setCart] = useState<Cart | null>(null);
  const [authOpen, setAuthOpen] = useState(false),
    [toast, setToast] = useState<ShopContext['toast']>(null);
  const [cartError, setCartError] = useState<unknown>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    generation = useRef(0);
  const currentToken = useRef<string | null>(null);
  const notice = useCallback((text: string, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  const refreshStores = useCallback(async () => {
    try {
      const result = await api<Page<Store>>('/stores?limit=100');
      setStores(result.items);
      setStoresError('');
      const persistedStoreId = localStorage.getItem(STORE_SELECTION_KEY);
      const persistedStore = result.items.find((store) => store.id === persistedStoreId);
      if (persistedStoreId && !persistedStore) localStorage.removeItem(STORE_SELECTION_KEY);
      setStoreId((current) =>
        result.items.some((s) => s.id === current) ? current : (persistedStore?.id ?? ''),
      );
    } catch (error) {
      setStoresError(messageOf(error));
    }
  }, []);
  useEffect(() => {
    void refreshStores();
    return () => clearTimeout(toastTimer.current);
  }, [refreshStores]);
  const refreshCart = useCallback(async () => {
    const sequence = ++generation.current;
    if (!token || !storeId) {
      setCart(null);
      setCartError(null);
      return null;
    }
    try {
      const result = await api<Cart>(`/cart?storeId=${storeId}`, { token });
      if (generation.current === sequence) {
        setCart(result);
        setCartError(null);
      }
      return result;
    } catch (error) {
      if (generation.current === sequence) setCartError(error);
      throw error;
    }
  }, [token, storeId]);
  useEffect(() => {
    setCart(null);
    void refreshCart().catch(() => {});
    return () => {
      generation.current++;
    };
  }, [refreshCart]);
  const clearSession = useCallback(() => {
    currentToken.current = null;
    setToken(null);
    setUser(null);
    setCart(null);
    setStoreId('');
    localStorage.removeItem(STORE_SELECTION_KEY);
    generation.current++;
  }, []);
  useEffect(() => {
    const expire = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== currentToken.current) return;
      clearSession();
      notice('Phiên đã hết hạn. Vui lòng đăng nhập lại.', true);
      setAuthOpen(false);
      router.push('/login');
    };
    window.addEventListener('shopgo:session-expired', expire);
    return () => window.removeEventListener('shopgo:session-expired', expire);
  }, [clearSession, notice, router]);
  async function login(accessToken: string) {
    const me = await api<User>('/me', { token: accessToken });
    currentToken.current = accessToken;
    generation.current++;
    setCart(null);
    setUser(me);
    setToken(accessToken);
    const owned = me.ownedStores ?? [];
    if (owned.length) {
      setStores((current) => [
        ...current.filter((store) => !owned.some((value) => value.id === store.id)),
        ...owned,
      ]);
    }
    const operationalStoreId = owned[0]?.id ?? me.memberships[0]?.storeId;
    if (operationalStoreId) {
      setStoreId(operationalStoreId);
      localStorage.setItem(STORE_SELECTION_KEY, operationalStoreId);
    }
    setAuthOpen(false);
    notice(`Xin chào, ${me.displayName}!`);
    return me;
  }
  async function logout() {
    try {
      if (token) await api('/auth/logout', { method: 'POST', token });
    } finally {
      clearSession();
    }
  }
  function updateUser(next: User) {
    setUser((current) =>
      current
        ? {
            ...current,
            ...next,
            ownedStores: next.ownedStores ?? current.ownedStores,
            memberships: next.memberships ?? current.memberships,
          }
        : next,
    );
  }
  function setStore(id: string) {
    if (!id) localStorage.removeItem(STORE_SELECTION_KEY);
    if (id === storeId) return;
    generation.current++;
    setCart(null);
    setStoreId(id);
    if (id) localStorage.setItem(STORE_SELECTION_KEY, id);
  }
  return (
    <Context.Provider
      value={{
        stores,
        store: stores.find((s) => s.id === storeId) ?? null,
        setStore,
        refreshStores,
        storesError,
        token,
        user,
        login,
        updateUser,
        logout,
        cart,
        cartError,
        refreshCart,
        authOpen,
        openAuth: () => {
          setAuthOpen(false);
          router.push('/login');
        },
        openDemoAuth: () => {
          if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'false') setAuthOpen(true);
        },
        closeAuth: () => setAuthOpen(false),
        notice,
        toast,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useShop() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing ShopProvider');
  return value;
}
