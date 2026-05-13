import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { useAppContext } from '../store/AppContext';

export default function Checkout() {
  const { cart, cartTotal, placeOrder, user } = useAppContext();
  const [isOrdered, setIsOrdered] = useState(false);
  const [shippingAddress, setShippingAddress] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (cart.length === 0 && !isOrdered) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async () => {
    if (!shippingAddress.trim()) {
      setError('Укажите адрес доставки.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await placeOrder(shippingAddress.trim());
      setIsOrdered(true);
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : 'Не удалось оформить заказ.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isOrdered) {
    return (
      <main className="max-w-3xl mx-auto py-32 px-4 text-center space-y-8">
        <h1 className="text-6xl font-playfair font-bold uppercase tracking-tighter">Спасибо!</h1>
        <p className="text-2xl font-light opacity-80">
          Ваш заказ принят. Мы свяжемся с вами в ближайшее время.
        </p>
        <Link
          to="/"
          className="inline-block bg-black text-white px-12 py-5 font-bold uppercase tracking-widest"
        >
          На главную
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto py-16 px-4">
      <h1 className="text-5xl font-playfair font-bold uppercase tracking-tighter mb-16">
        Оформление заказа
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
        <div className="lg:col-span-7 space-y-12">
          <section className="space-y-6">
            <h2 className="text-xl font-bold uppercase tracking-widest pb-4 border-b">
              Контактные данные
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                value={user.username}
                readOnly
                className="w-full border-b border-gray-200 py-3 text-sm bg-transparent outline-none"
              />
              <input
                type="email"
                value={user.email}
                readOnly
                className="w-full border-b border-gray-200 py-3 text-sm bg-transparent outline-none"
              />
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-xl font-bold uppercase tracking-widest pb-4 border-b">
              Адрес доставки
            </h2>
            <textarea
              value={shippingAddress}
              onChange={(event) => setShippingAddress(event.target.value)}
              placeholder="Город, улица, дом, квартира, дополнительные детали"
              className="w-full min-h-40 border border-gray-200 p-4 text-sm outline-none focus:border-black resize-none"
              required
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </section>
        </div>

        <div className="lg:col-span-5 bg-gray-50 p-8 space-y-8 sticky top-32">
          <h2 className="text-2xl font-bold uppercase tracking-tight">Ваш заказ</h2>

          <div className="space-y-6 max-h-[400px] overflow-y-auto no-scrollbar pr-2">
            {cart.map((item) => (
              <div key={`${item.id}-${item.selectedSize}`} className="flex gap-4">
                <img src={item.images[0]} className="w-16 h-20 object-cover" alt={item.name} />
                <div className="flex-1 space-y-1">
                  <h4 className="text-sm font-bold uppercase leading-none">{item.name}</h4>
                  <p className="text-[10px] opacity-40 uppercase tracking-widest">
                    Размер: {item.selectedSize} / Кол-во: {item.quantity}
                  </p>
                  <p className="text-sm font-bold">{(item.price * item.quantity).toLocaleString()} ₽</p>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4 pt-8 border-t border-gray-200">
            <div className="flex justify-between text-sm uppercase tracking-widest opacity-60">
              <span>Доставка:</span>
              <span>Бесплатно</span>
            </div>
            <div className="flex justify-between text-2xl font-bold uppercase tracking-tighter">
              <span>Итого:</span>
              <span>{cartTotal.toLocaleString()} ₽</span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-black text-white py-6 text-sm font-bold uppercase tracking-[0.3em] hover:bg-zinc-800 transition-colors disabled:opacity-60"
            >
              {submitting ? 'Оформляем...' : 'Подтвердить заказ'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
