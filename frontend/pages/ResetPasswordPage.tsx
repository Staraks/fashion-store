import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { authAPI } from '../services/api';
import { useAppContext } from '../store/AppContext';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { logout } = useAppContext();
  const [searchParams] = useSearchParams();
  const routeParams = useParams<{ uid?: string; token?: string }>();
  const hashParams = useMemo(() => {
    const queryStart = window.location.hash.indexOf('?');
    return queryStart === -1 ? new URLSearchParams() : new URLSearchParams(window.location.hash.slice(queryStart + 1));
  }, []);
  const uid = routeParams.uid || searchParams.get('uid') || hashParams.get('uid') || '';
  const token = routeParams.token || searchParams.get('token') || hashParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const hasToken = Boolean(uid && token);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (password !== passwordConfirm) {
      setError('Пароли не совпадают.');
      return;
    }

    setSubmitting(true);

    try {
      await authAPI.confirmPasswordReset({
        uid,
        token,
        password,
        password_confirm: passwordConfirm,
      });
      await logout();
      navigate('/auth', {
        replace: true,
        state: { message: 'Пароль изменен. Войдите с новым паролем.' },
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не удалось изменить пароль.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl items-center px-4 py-16">
      <section className="w-full border border-gray-200 p-8">
        <p className="text-sm uppercase tracking-[0.35em] opacity-50">Аккаунт</p>
        <h1 className="mt-4 font-playfair text-4xl font-bold uppercase tracking-tight">Смена пароля</h1>

        {!hasToken ? (
          <div className="mt-8 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            Ссылка для смены пароля некорректна или устарела.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-gray-500">Новый пароль</span>
              <input
                type="password"
                value={password}
                minLength={8}
                required
                onChange={(event) => setPassword(event.target.value)}
                className="w-full border border-gray-200 px-4 py-3 outline-none transition focus:border-black"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-gray-500">Повторите пароль</span>
              <input
                type="password"
                value={passwordConfirm}
                minLength={8}
                required
                onChange={(event) => setPasswordConfirm(event.target.value)}
                className="w-full border border-gray-200 px-4 py-3 outline-none transition focus:border-black"
              />
            </label>

            {error ? <div className="border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div> : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full border border-black bg-black px-8 py-4 text-sm font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Сохраняем...' : 'Сохранить пароль'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
