import React, { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

import { useAppContext } from "../store/AppContext";

const SUCCESS_TEST_CARD = "4242424242424242";
const DECLINED_TEST_CARD = "4242424242424040";
const SUCCESS_TEST_EXPIRY = "1230";
const SUCCESS_TEST_CVV = "123";
const SUCCESS_TEST_HOLDER = "EGOR AKSYONOV";

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCardNumber(value: string) {
  return onlyDigits(value)
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatCardExpiry(value: string) {
  const digits = onlyDigits(value).slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function waitForMockPayment() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 1500);
  });
}

export default function Checkout() {
  const { cart, cartTotal, placeOrder, user } = useAppContext();
  const [isOrdered, setIsOrdered] = useState(false);
  const [shippingAddress, setShippingAddress] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [showCvv, setShowCvv] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (cart.length === 0 && !isOrdered) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async () => {
    if (!shippingAddress.trim()) {
      setError("Укажите адрес доставки.");
      return;
    }

    const normalizedCardNumber = onlyDigits(cardNumber);
    const normalizedExpiry = onlyDigits(cardExpiry);
    const normalizedCvv = onlyDigits(cardCvv);

    if (!cardHolder.trim()) {
      setError("Укажите имя владельца карты.");
      return;
    }

    if (normalizedCardNumber.length !== 16) {
      setError("Введите 16 цифр номера карты.");
      return;
    }

    if (normalizedExpiry !== SUCCESS_TEST_EXPIRY) {
      setError("Неверный срок действия карты.");
      return;
    }

    if (normalizedCvv !== SUCCESS_TEST_CVV) {
      setError("Неверный CVV.");
      return;
    }

    if (cardHolder.trim().toUpperCase() !== SUCCESS_TEST_HOLDER) {
      setError("Неверное имя владельца карты.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await waitForMockPayment();

      if (normalizedCardNumber === DECLINED_TEST_CARD) {
        throw new Error("Запрос отклонен: на карте недостаточно средств.");
      }

      if (normalizedCardNumber !== SUCCESS_TEST_CARD) {
        throw new Error(
          "Для имитации оплаты используйте тестовую карту 4242 4242 4242 4242.",
        );
      }

      await placeOrder(shippingAddress.trim());
      setIsOrdered(true);
    } catch (orderError) {
      setError(
        orderError instanceof Error
          ? orderError.message
          : "Не удалось оформить заказ.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (isOrdered) {
    return (
      <main className="max-w-3xl mx-auto py-32 px-4 text-center space-y-8">
        <h1 className="text-6xl font-playfair font-bold uppercase tracking-tighter">
          Спасибо!
        </h1>
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

          <section className="space-y-6">
            <div className="flex flex-col gap-2 border-b pb-4 md:flex-row md:items-end md:justify-between">
              <h2 className="text-xl font-bold uppercase tracking-widest">
                Оплата
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-gray-500">
                  Номер карты
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  value={cardNumber}
                  onChange={(event) =>
                    setCardNumber(formatCardNumber(event.target.value))
                  }
                  placeholder="4242 4242 4242 4242"
                  className="w-full border border-gray-200 p-4 text-sm outline-none focus:border-black"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-gray-500">
                  Срок
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  value={cardExpiry}
                  onChange={(event) =>
                    setCardExpiry(formatCardExpiry(event.target.value))
                  }
                  placeholder="12/30"
                  className="w-full border border-gray-200 p-4 text-sm outline-none focus:border-black"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-gray-500">
                  CVV
                </span>
                <div className="relative">
                  <input
                    type={showCvv ? "text" : "password"}
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    value={cardCvv}
                    onChange={(event) =>
                      setCardCvv(onlyDigits(event.target.value).slice(0, 3))
                    }
                    placeholder="123"
                    className="w-full border border-gray-200 p-4 pr-12 text-sm outline-none focus:border-black"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCvv((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 transition hover:text-black"
                    aria-label={showCvv ? "Скрыть CVV" : "Показать CVV"}
                    title={showCvv ? "Скрыть CVV" : "Показать CVV"}
                  >
                    {showCvv ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-gray-500">
                  Имя на карте
                </span>
                <input
                  type="text"
                  autoComplete="cc-name"
                  value={cardHolder}
                  onChange={(event) =>
                    setCardHolder(event.target.value.toUpperCase())
                  }
                  placeholder="IVAN IVANOV"
                  className="w-full border border-gray-200 p-4 text-sm uppercase outline-none focus:border-black"
                />
              </label>
            </div>

            <div className="border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-600">
              <p>
                Успешная оплата: 4242 4242 4242 4242, срок 12/30, CVV 123, EGOR
                AKSYONOV
              </p>
              <p>Недостаточно средств: 4242 4242 4242 4040 с теми же данными</p>
            </div>
          </section>
        </div>

        <div className="lg:col-span-5 bg-gray-50 p-8 space-y-8 sticky top-32">
          <h2 className="text-2xl font-bold uppercase tracking-tight">
            Ваш заказ
          </h2>

          <div className="space-y-6 max-h-[400px] overflow-y-auto no-scrollbar pr-2">
            {cart.map((item) => (
              <div
                key={`${item.id}-${item.selectedSize}`}
                className="flex gap-4"
              >
                <img
                  src={item.images[0]}
                  className="w-16 h-20 object-cover"
                  alt={item.name}
                />
                <div className="flex-1 space-y-1">
                  <h4 className="text-sm font-bold uppercase leading-none">
                    {item.name}
                  </h4>
                  <p className="text-[10px] opacity-40 uppercase tracking-widest">
                    Размер: {item.selectedSize} / Кол-во: {item.quantity}
                  </p>
                  <p className="text-sm font-bold">
                    {(item.price * item.quantity).toLocaleString()} ₽
                  </p>
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
              {submitting
                ? "Обрабатываем оплату..."
                : "Оплатить и оформить заказ"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
