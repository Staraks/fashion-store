import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Heart, Minus, Plus, Star } from 'lucide-react';

import { productsAPI } from '../services/api';
import { useAppContext } from '../store/AppContext';
import { Product, ProductReviewSummary } from '../types';
import { getCategoryLabel } from '../utils/categoryLabels';

function formatReviewDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState('');
  const [activeImage, setActiveImage] = useState(0);
  const [openSection, setOpenSection] = useState<string | null>('description');
  const [reviewSummary, setReviewSummary] = useState<ProductReviewSummary>({
    averageRating: null,
    reviewsCount: 0,
    reviews: [],
  });
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const reviewsSectionRef = useRef<HTMLElement | null>(null);

  const { addToCart, toggleFavorite, isFavorite, user, authToken } = useAppContext();

  useEffect(() => {
    if (!id) {
      setProduct(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    productsAPI
      .getById(id)
      .then((result) => setProduct(result ?? null))
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) {
      setReviewsLoading(false);
      return;
    }

    setReviewsLoading(true);
    productsAPI
      .getReviews(id)
      .then((summary) => setReviewSummary(summary))
      .catch(() =>
        setReviewSummary({
          averageRating: null,
          reviewsCount: 0,
          reviews: [],
        })
      )
      .finally(() => setReviewsLoading(false));
  }, [id]);

  const currentUserReview = useMemo(
    () => reviewSummary.reviews.find((review) => review.username === user?.username),
    [reviewSummary.reviews, user?.username]
  );

  useEffect(() => {
    if (currentUserReview) {
      setReviewRating(currentUserReview.rating);
      setReviewComment(currentUserReview.comment);
      return;
    }

    setReviewRating(0);
    setReviewComment('');
  }, [currentUserReview]);

  if (loading) return <div className="py-40 text-center">Загрузка...</div>;
  if (!product) return <div className="py-40 text-center">Товар не найден.</div>;

  const handleAddToCart = () => {
    if (!selectedSize) {
      alert('Пожалуйста, выберите размер');
      return;
    }

    addToCart(product, selectedSize);
  };

  const handleSubmitReview = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!id || !authToken) {
      setReviewError('Чтобы оставить отзыв, нужно войти в аккаунт.');
      return;
    }

    if (!reviewRating) {
      setReviewError('Поставьте оценку от 1 до 5 звезд.');
      return;
    }

    setReviewSubmitting(true);
    setReviewError('');
    setReviewSuccess('');

    try {
      await productsAPI.createReview(authToken, id, {
        rating: reviewRating,
        comment: reviewComment.trim(),
      });

      const summary = await productsAPI.getReviews(id);
      setReviewSummary(summary);
      setReviewSuccess('Отзыв отправлен на модерацию и появится после одобрения.');
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Не удалось сохранить отзыв.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const scrollToReviews = () => {
    reviewsSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const Accordion = ({
    title,
    id: sectionId,
    children,
  }: {
    title: string;
    id: string;
    children?: React.ReactNode;
  }) => (
    <div className="border-b border-gray-200 py-4">
      <button
        className="flex w-full items-center justify-between text-sm font-bold tracking-wide"
        onClick={() => setOpenSection(openSection === sectionId ? null : sectionId)}
      >
        {title}
        {openSection === sectionId ? <Minus size={16} /> : <Plus size={16} />}
      </button>
      {openSection === sectionId ? (
        <div className="mt-4 text-sm leading-relaxed opacity-70">{children}</div>
      ) : null}
    </div>
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 md:py-16">
      <nav className="mb-12 flex gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40 md:text-xs">
        <Link to="/catalog">Каталог</Link> /
        <Link to={`/catalog?category=${product.category}`}>{getCategoryLabel(product.category)}</Link> /
        <span className="text-black">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.72fr)]">
        <div className="lg:hidden">
          <h1 className="mb-4 font-playfair text-3xl font-semibold uppercase leading-tight tracking-tight text-black">
            {product.name}
          </h1>
        </div>

        <div className="lg:max-w-[720px]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {product.images.length > 1 ? (
              <div className="order-2 grid grid-cols-4 gap-3 sm:order-1 sm:w-24 sm:grid-cols-1">
                {product.images.map((img, idx) => (
                  <button
                    key={idx}
                    className={`aspect-[4/5] overflow-hidden border transition ${
                      activeImage === idx ? 'border-black' : 'border-gray-200 hover:border-black'
                    }`}
                    onClick={() => setActiveImage(idx)}
                  >
                    <img src={img} alt="" className="h-full w-full object-contain bg-white" />
                  </button>
                ))}
              </div>
            ) : null}

            <div className="order-1 flex-1 overflow-hidden bg-white sm:order-2">
              <img
                src={product.images[activeImage]}
                alt={product.name}
                className="aspect-[4/5] max-h-[72vh] w-full object-contain object-center"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-28">
          <div className="hidden lg:block">
            <h1 className="mb-3 font-playfair text-4xl font-semibold uppercase leading-tight tracking-tight text-black xl:text-5xl">
              {product.name}
            </h1>
          </div>

          <div className="flex items-end gap-4">
            <span className="text-3xl font-bold">{product.price.toLocaleString()} ₽</span>
            {product.oldPrice ? (
              <span className="mb-1 text-lg text-gray-400 line-through">
                {product.oldPrice.toLocaleString()} ₽
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 border-y border-gray-100 py-5 text-sm text-gray-700 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gray-400">Бренд</p>
              <p className="mt-2 font-medium text-black">{product.brand || 'Не указан'}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gray-400">Цвет</p>
              <p className="mt-2 font-medium text-black">{product.color || 'Не указан'}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={scrollToReviews}
            className="rounded-2xl border border-gray-200 px-5 py-4 text-left transition hover:border-black"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={18}
                    className={
                      reviewSummary.averageRating && reviewSummary.averageRating >= star
                        ? 'fill-black text-black'
                        : 'text-gray-300'
                    }
                  />
                ))}
              </div>
              <span className="text-lg font-semibold">
                {reviewSummary.averageRating ? reviewSummary.averageRating.toFixed(1) : 'Нет оценок'}
              </span>
              <span className="text-sm text-gray-500">({reviewSummary.reviewsCount} отзывов)</span>
            </div>
          </button>

          <div className="space-y-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
              Размер: <span className="opacity-40">{selectedSize || 'выберите размер'}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((size) => (
                <button
                  key={size}
                  className={`border px-6 py-2 text-sm font-medium transition-all ${
                    selectedSize === size ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-black'
                  }`}
                  onClick={() => setSelectedSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              className="flex-1 bg-black py-5 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-zinc-800"
              onClick={handleAddToCart}
            >
              В корзину
            </button>
            <button
              className={`border p-5 transition-colors ${
                isFavorite(product.id) ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-black'
              }`}
              onClick={() => toggleFavorite(product)}
            >
              <Heart size={20} fill={isFavorite(product.id) ? 'currentColor' : 'none'} />
            </button>
          </div>

          <div className="mt-8">
            <Accordion title="Описание" id="description">
              {product.description}
            </Accordion>
            {product.material ? (
              <Accordion title="Материал" id="material">
                {product.material}
              </Accordion>
            ) : null}
            <Accordion title="Доставка" id="delivery">
              Осуществляем доставку по всей России и миру. Срок доставки от 3 до 7 рабочих дней.
            </Accordion>
            <Accordion title="Возврат" id="returns">
              Вы можете вернуть товар в течение 14 дней с момента получения при условии сохранения товарного вида.
            </Accordion>
          </div>
        </div>
      </div>

      <section
        ref={reviewsSectionRef}
        className="mt-20 grid scroll-mt-24 grid-cols-1 gap-10 border-t border-gray-100 pt-12 lg:grid-cols-[0.95fr_1.05fr]"
      >
        <div className="space-y-6">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] opacity-50">Отзывы</p>
            <h2 className="mt-3 font-playfair text-4xl font-bold uppercase tracking-tight">
              Оценка и мнение
            </h2>
          </div>

          {user ? (
            <form className="space-y-5 border border-gray-200 p-6" onSubmit={handleSubmitReview}>
              <div>
                <p className="mb-3 text-xs uppercase tracking-[0.25em] text-gray-500">Ваша оценка</p>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      className="transition-transform hover:scale-110"
                    >
                      <Star
                        size={24}
                        className={reviewRating >= star ? 'fill-black text-black' : 'text-gray-300'}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs uppercase tracking-[0.25em] text-gray-500">
                  {currentUserReview ? 'Обновить отзыв' : 'Ваш отзыв'}
                </p>
                <textarea
                  value={reviewComment}
                  onChange={(event) => setReviewComment(event.target.value)}
                  placeholder="Поделитесь впечатлением о товаре"
                  className="min-h-36 w-full resize-none border border-gray-200 p-4 text-sm outline-none focus:border-black"
                />
              </div>

              {reviewError ? <p className="text-sm text-red-600">{reviewError}</p> : null}
              {reviewSuccess ? <p className="text-sm text-emerald-700">{reviewSuccess}</p> : null}

              <button
                type="submit"
                disabled={reviewSubmitting}
                className="bg-black px-8 py-4 text-sm font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-zinc-800 disabled:opacity-60"
              >
                {reviewSubmitting ? 'Сохраняем...' : currentUserReview ? 'Обновить отзыв' : 'Оставить отзыв'}
              </button>
            </form>
          ) : (
            <div className="border border-gray-200 p-6 text-sm leading-7 text-gray-600">
              Чтобы оставить отзыв и поставить оценку,{' '}
              <Link to="/auth" className="font-semibold text-black underline">
                войдите в аккаунт
              </Link>
              .
            </div>
          )}
        </div>

        <div className="space-y-5">
          {reviewsLoading ? (
            <div className="flex h-48 items-center justify-center border border-gray-100 bg-gray-50 text-lg italic text-gray-500">
              Загружаем отзывы...
            </div>
          ) : reviewSummary.reviews.length === 0 ? (
            <div className="border border-gray-100 bg-gray-50 px-6 py-10 text-center text-gray-600">
              У этого товара пока нет отзывов.
            </div>
          ) : (
            reviewSummary.reviews.map((review) => (
              <article key={review.id} className="border border-gray-200 p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100">
                    {review.avatarUrl ? (
                      <img src={review.avatarUrl} alt={review.username} className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-semibold uppercase text-gray-500">{review.username.slice(0, 1)}</span>
                    )}
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-lg font-semibold">{review.username}</p>
                        <p className="text-sm text-gray-500">{formatReviewDate(review.updated_at)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={16}
                            className={review.rating >= star ? 'fill-black text-black' : 'text-gray-300'}
                          />
                        ))}
                      </div>
                    </div>

                    {review.comment ? (
                      <p className="text-sm leading-7 text-gray-700">{review.comment}</p>
                    ) : (
                      <p className="text-sm italic text-gray-400">Пользователь оставил только оценку.</p>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
