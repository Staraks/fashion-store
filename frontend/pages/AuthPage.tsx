import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { authAPI } from '../services/api';
import { useAppContext } from '../store/AppContext';

type AuthMode = 'login' | 'register';

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authLoading, setAuthSession, user } = useAppContext();
  const routeMessage =
    typeof location.state === 'object' &&
    location.state &&
    'message' in location.state &&
    typeof location.state.message === 'string'
      ? location.state.message
      : '';
  const [mode, setMode] = useState<AuthMode>('login');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loginForm, setLoginForm] = useState({ identifier: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    username: '',
    email: '',
    password: '',
    password_confirm: '',
  });

  if (!authLoading && user) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await authAPI.login(loginForm);
      await setAuthSession(response.token, response.user);
      navigate('/', { replace: true });
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Не удалось выполнить вход.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await authAPI.register(registerForm);
      await setAuthSession(response.token, response.user);
      navigate('/', { replace: true });
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Не удалось создать аккаунт.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-16 md:py-24">
      <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2">
        <section className="space-y-6">
          <p className="text-sm uppercase tracking-[0.35em] opacity-50">Аккаунт</p>
          <h1 className="font-playfair text-5xl font-bold uppercase leading-none tracking-tight md:text-6xl">
            Вход и регистрация
          </h1>
          <p className="max-w-md text-lg leading-relaxed opacity-70">
            Корзина и избранное, которые вы добавили как гость, будут привязаны к аккаунту сразу
            после входа.
          </p>
        </section>

        <section className="border border-gray-200 p-6 md:p-8">
          <div className="mb-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`border px-5 py-3 text-sm uppercase tracking-[0.25em] ${
                mode === 'login' ? 'border-black bg-black text-white' : 'border-gray-300'
              }`}
            >
              Вход
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`border px-5 py-3 text-sm uppercase tracking-[0.25em] ${
                mode === 'register' ? 'border-black bg-black text-white' : 'border-gray-300'
              }`}
            >
              Регистрация
            </button>
          </div>

          {error ? (
            <div className="mb-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {routeMessage && !error ? (
            <div className="mb-6 border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {routeMessage}
            </div>
          ) : null}

          {mode === 'login' ? (
            <form className="space-y-5" onSubmit={handleLogin}>
              <input
                type="text"
                placeholder="Электронная почта или имя пользователя"
                value={loginForm.identifier}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, identifier: event.target.value }))}
                className="w-full border-b border-gray-300 py-3 outline-none focus:border-black"
                required
              />
              <input
                type="password"
                placeholder="Пароль"
                value={loginForm.password}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                className="w-full border-b border-gray-300 py-3 outline-none focus:border-black"
                required
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-black py-4 text-sm uppercase tracking-[0.3em] text-white disabled:opacity-60"
              >
                {submitting ? 'Входим...' : 'Войти'}
              </button>
            </form>
          ) : (
            <form className="space-y-5" onSubmit={handleRegister}>
              <input
                type="text"
                placeholder="Имя пользователя"
                value={registerForm.username}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, username: event.target.value }))}
                className="w-full border-b border-gray-300 py-3 outline-none focus:border-black"
                required
              />
              <input
                type="email"
                placeholder="Электронная почта"
                value={registerForm.email}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
                className="w-full border-b border-gray-300 py-3 outline-none focus:border-black"
                required
              />
              <input
                type="password"
                placeholder="Пароль"
                value={registerForm.password}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                className="w-full border-b border-gray-300 py-3 outline-none focus:border-black"
                required
              />
              <input
                type="password"
                placeholder="Повторите пароль"
                value={registerForm.password_confirm}
                onChange={(event) =>
                  setRegisterForm((prev) => ({ ...prev, password_confirm: event.target.value }))
                }
                className="w-full border-b border-gray-300 py-3 outline-none focus:border-black"
                required
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-black py-4 text-sm uppercase tracking-[0.3em] text-white disabled:opacity-60"
              >
                {submitting ? 'Создаем аккаунт...' : 'Зарегистрироваться'}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
