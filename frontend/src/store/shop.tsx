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
import { api, ApiError, messageOf } from '@/lib/api';
import { isCustomerUser } from '@/lib/access';
import type { Cart, Page, Store, User } from '@/types';

const STORE_SELECTION_KEY = 'shopgo-customer-store-v2';
const RECENT_STORE_KEY = 'shopgo-recent-store';

interface ShopContext {
  stores: Store[];
  store: Store | null;
  recentStore: Store | null;
  setStore: (store: Store | null) => void;
  openStore: (id: string) => Promise<boolean>;
  refreshStores: () => Promise<void>;
  storesError: string;
  token: string | null;
  user: User | null;
  login: (token: string) => Promise<User>;
  updateUser: (user: User) => void;
  logout: () => Promise<void>;
  cart: Cart | null;
  voucherCode: string;
  setVoucherCode: (code: string) => void;
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
    [store, setSelectedStore] = useState<Store | null>(null),
    [recentStore, setRecentStore] = useState<Store | null>(null),
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
  const storeSelection = useRef(0);
  const currentStoreId = useRef<string | undefined>(undefined);
  const storeId = store?.id;
  const voucherIdentity = `${user?.id}:${storeId}`;
  const [voucher, setVoucher] = useState({ identity: '', code: '' });
  const notice = useCallback((text: string, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  const refreshStores = useCallback(async () => {
    const token = currentToken.current;
    if (!token) return;
    try {
      const result = await api<Page<Store>>('/stores?limit=100');
      if (currentToken.current !== token) return;
      setStores(result.items);
      setStoresError('');
    } catch (error) {
      if (currentToken.current === token) setStoresError(messageOf(error));
    }
  }, []);
  const commitStore = useCallback((nextStore: Store | null) => {
    if (currentStoreId.current !== nextStore?.id) {
      setVoucher({ identity: '', code: '' });
      currentStoreId.current = nextStore?.id;
      generation.current++;
      setCart(null);
      setCartError(null);
    }
    setSelectedStore(nextStore);
  }, []);
  useEffect(() => {
    const activeId = localStorage.getItem(STORE_SELECTION_KEY);
    const recentId = localStorage.getItem(RECENT_STORE_KEY) ?? activeId;
    const selection = storeSelection.current;
    const controller = new AbortController();
    for (const id of new Set([activeId, recentId])) {
      if (!id) continue;
      void api<Store>(`/stores/${encodeURIComponent(id)}`, { signal: controller.signal })
        .then((restored) => {
          if (controller.signal.aborted) return;
          if (id === activeId && storeSelection.current === selection) commitStore(restored);
          if (id === recentId && (localStorage.getItem(RECENT_STORE_KEY) ?? activeId) === id) {
            setRecentStore(restored);
            localStorage.setItem(RECENT_STORE_KEY, id);
          }
        })
        .catch((error) => {
          if (controller.signal.aborted || !(error instanceof ApiError) || error.status !== 404)
            return;
          for (const key of [STORE_SELECTION_KEY, RECENT_STORE_KEY]) {
            if (localStorage.getItem(key) === id) localStorage.removeItem(key);
          }
        });
    }
    return () => {
      controller.abort();
      clearTimeout(toastTimer.current);
    };
  }, [commitStore]);
  const refreshCart = useCallback(async () => {
    if (currentStoreId.current !== storeId || currentToken.current !== token) return null;
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
      return currentStoreId.current === storeId && currentToken.current === token ? result : null;
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
  useEffect(() => {
    if (!isCustomerUser(user) || !storeId) return;
    const refreshVisibleCart = () => {
      if (document.visibilityState === 'visible') void refreshCart().catch(() => {});
    };
    const timer = setInterval(refreshVisibleCart, 30000);
    document.addEventListener('visibilitychange', refreshVisibleCart);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshVisibleCart);
    };
  }, [user, storeId, refreshCart]);
  const clearSession = useCallback(() => {
    storeSelection.current++;
    currentToken.current = null;
    setVoucher({ identity: '', code: '' });
    setToken(null);
    setUser(null);
    setStores([]);
    setStoresError('');
    commitStore(null);
    localStorage.removeItem(STORE_SELECTION_KEY);
    generation.current++;
  }, [commitStore]);
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
    if (!isCustomerUser(me)) {
      const selection = ++storeSelection.current;
      setStores(owned);
      commitStore(owned[0] ?? null);
      if (me.isAdmin) void refreshStores();
      const membershipIds = [...new Set(me.memberships.map(({ storeId }) => storeId))];
      if (membershipIds.length) {
        void Promise.all(
          membershipIds.map((id) =>
            api<Store>(`/stores/${id}`).catch(() => owned.find((store) => store.id === id)),
          ),
        ).then((results) => {
          if (currentToken.current !== accessToken) return;
          const assigned = results.filter((result): result is Store => !!result);
          setStores((current) => [
            ...current.filter((store) => !assigned.some((value) => value.id === store.id)),
            ...assigned,
          ]);
          if (storeSelection.current === selection && assigned[0]) {
            commitStore(
              assigned.find((store) => store.id === owned[0]?.id) ?? owned[0] ?? assigned[0],
            );
          }
        });
      }
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
  function setStore(nextStore: Store | null) {
    storeSelection.current++;
    commitStore(nextStore);
    if (user && !isCustomerUser(user)) return;
    if (nextStore) {
      localStorage.setItem(STORE_SELECTION_KEY, nextStore.id);
      localStorage.setItem(RECENT_STORE_KEY, nextStore.id);
      setRecentStore(nextStore);
    } else {
      localStorage.removeItem(STORE_SELECTION_KEY);
    }
  }
  async function openStore(id: string) {
    const selection = ++storeSelection.current;
    try {
      const found = await api<Store>(`/stores/${encodeURIComponent(id)}`);
      if (storeSelection.current !== selection) return false;
      setStore(found);
      return true;
    } catch (error) {
      if (storeSelection.current === selection) notice(messageOf(error), true);
      return false;
    }
  }
  return (
    <Context.Provider
      value={{
        stores,
        store,
        recentStore,
        setStore,
        openStore,
        refreshStores,
        storesError,
        token,
        user,
        login,
        updateUser,
        logout,
        cart,
        voucherCode: voucher.identity === voucherIdentity ? voucher.code : '',
        setVoucherCode: (code) =>
          setVoucher({ identity: voucherIdentity, code: code.trim().toUpperCase() }),
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
