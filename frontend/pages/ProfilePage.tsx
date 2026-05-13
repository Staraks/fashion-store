import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { authAPI, ordersAPI } from '../services/api';
import { useAppContext } from '../store/AppContext';
import { UserOrder } from '../types';

const STATUS_LABELS: Record<string, string> = {
  new: 'Новый',
  processing: 'В обработке',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  cancelled: 'Отменен',
};

function formatOrderDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default function ProfilePage() {
  const { user, authToken, authLoading, setCurrentUser } = useAppContext();
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [passwordEmailSending, setPasswordEmailSending] = useState(false);
  const [error, setError] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (!authToken) {
      setLoadingOrders(false);
      return;
    }

    setLoadingOrders(true);
    setError('');

    ordersAPI
      .list(authToken)
      .then((loadedOrders) => setOrders(loadedOrders))
      .catch((ordersError) => {
        setOrders([]);
        setError(ordersError instanceof Error ? ordersError.message : 'Не удалось загрузить заказы.');
      })
      .finally(() => setLoadingOrders(false));
  }, [authToken]);

  if (!authLoading && !user) {
    return <Navigate to="/auth" replace />;
  }

  if (!user) {
    return null;
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file || !authToken) {
      return;
    }

    setAvatarUploading(true);
    setAvatarError('');

    try {
      const updatedUser = await authAPI.updateAvatar(authToken, file);
      setCurrentUser(updatedUser);
    } catch (uploadError) {
      setAvatarError(uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить аватар.');
    } finally {
      setAvatarUploading(false);
      event.target.value = '';
    }
  };

  const handlePasswordResetRequest = async () => {
    if (!authToken) {
      return;
    }

    setPasswordEmailSending(true);
    setPasswordMessage('');
    setPasswordError('');

    try {
      await authAPI.requestPasswordReset(authToken, user.email);
      setPasswordMessage('Письмо со ссылкой для смены пароля отправлено на вашу почту.');
    } catch (requestError) {
      setPasswordError(requestError instanceof Error ? requestError.message : 'Не удалось отправить письмо.');
    } finally {
      setPasswordEmailSending(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-16">
      <section className="mb-14 grid grid-cols-1 gap-10 border-b border-gray-100 pb-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-5">
          <p className="text-sm uppercase tracking-[0.35em] opacity-50">Профиль</p>
          <h1 className="font-playfair text-5xl font-bold uppercase tracking-tight">Личный кабинет</h1>
          <p className="max-w-xl text-base leading-7 text-gray-600">
            Здесь собраны данные вашего аккаунта, аватар и история оформленных заказов.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
          <div className="space-y-4">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-full bg-gray-100">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.username} className="h-full w-full object-cover" />
              ) : (
                <span className="text-5xl font-playfair uppercase text-gray-400">
                  {user.username.slice(0, 1)}
                </span>
              )}
            </div>

            <label className="block cursor-pointer border border-black px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-black hover:text-white">
              {avatarUploading ? 'Загружаем...' : 'Загрузить аватар'}
              <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </label>

            {avatarError ? <p className="text-sm text-red-600">{avatarError}</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="border border-gray-200 p-5">
              <p className="mb-2 text-xs uppercase tracking-[0.25em] text-gray-400">Имя пользователя</p>
              <p className="text-lg font-medium">{user.username}</p>
            </div>
            <div className="border border-gray-200 p-5">
              <p className="mb-2 text-xs uppercase tracking-[0.25em] text-gray-400">Электронная почта</p>
              <p className="break-all text-lg font-medium">{user.email}</p>
            </div>
            <div className="border border-gray-200 p-5 md:col-span-2">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.25em] text-gray-400">Пароль</p>
                  <p className="text-sm leading-6 text-gray-600">
                    Ссылка для смены пароля придет на email вашего аккаунта.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePasswordResetRequest}
                  disabled={passwordEmailSending}
                  className="border border-black px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {passwordEmailSending ? 'Отправляем...' : 'Сменить пароль'}
                </button>
              </div>
              {passwordMessage ? <p className="mt-4 text-sm text-green-700">{passwordMessage}</p> : null}
              {passwordError ? <p className="mt-4 text-sm text-red-600">{passwordError}</p> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-8">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] opacity-50">Заказы</p>
            <h2 className="mt-3 text-3xl font-playfair font-bold uppercase tracking-tight">
              История покупок
            </h2>
          </div>
          <p className="text-sm uppercase tracking-[0.22em] text-gray-400">Всего заказов: {orders.length}</p>
        </div>

        {loadingOrders ? (
          <div className="flex h-48 items-center justify-center border border-gray-100 bg-gray-50 text-lg italic text-gray-500">
            Загружаем заказы...
          </div>
        ) : error ? (
          <div className="border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
        ) : orders.length === 0 ? (
          <div className="border border-gray-100 bg-gray-50 px-6 py-10 text-center">
            <p className="text-xl font-light text-gray-600">У вас пока нет оформленных заказов.</p>
            <Link
              to="/catalog"
              className="mt-6 inline-block border border-black px-8 py-3 text-sm font-semibold uppercase tracking-[0.25em] text-black transition hover:bg-black hover:text-white"
            >
              Перейти в каталог
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {orders.map((order) => (
              <article key={order.id} className="border border-gray-200 p-6 md:p-8">
                <div className="mb-8 flex flex-col gap-5 border-b border-gray-100 pb-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Заказ #{order.id}</p>
                    <h3 className="text-2xl font-playfair font-bold uppercase tracking-tight">
                      {STATUS_LABELS[order.status] || order.status}
                    </h3>
                    <p className="text-sm text-gray-500">{formatOrderDate(order.createdAt)}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
                    <div>
                      <p className="mb-1 uppercase tracking-[0.2em] text-gray-400">Позиции</p>
                      <p className="font-semibold">{order.itemsCount}</p>
                    </div>
                    <div>
                      <p className="mb-1 uppercase tracking-[0.2em] text-gray-400">Сумма</p>
                      <p className="font-semibold">{order.totalAmount.toLocaleString()} ₽</p>
                    </div>
                    <div>
                      <p className="mb-1 uppercase tracking-[0.2em] text-gray-400">Доставка</p>
                      <p className="max-w-xs font-semibold text-gray-700">{order.shippingAddress}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex gap-4 border-b border-gray-100 pb-4 last:border-b-0 last:pb-0">
                      <Link to={`/product/${item.productId}`} className="block h-24 w-20 shrink-0 overflow-hidden bg-gray-50">
                        {item.image ? (
                          <img src={item.image} alt={item.productName} className="h-full w-full object-cover" />
                        ) : null}
                      </Link>
                      <div className="flex flex-1 flex-col justify-between gap-3 md:flex-row md:items-start">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">{item.brand}</p>
                          <Link to={`/product/${item.productId}`} className="mt-1 block text-lg font-medium hover:opacity-70">
                            {item.productName}
                          </Link>
                          <p className="mt-2 text-sm text-gray-500">
                            Размер: {item.size} · Кол-во: {item.quantity}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-400">{item.price.toLocaleString()} ₽ за штуку</p>
                          <p className="mt-1 text-lg font-semibold">{item.lineTotal.toLocaleString()} ₽</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
