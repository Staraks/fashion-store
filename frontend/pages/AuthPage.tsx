import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { authAPI } from '../services/api';
import { useAppContext } from '../store/AppContext';

type AuthMode = 'login' | 'register';

export default function AuthPage() {
  const navigate = useNavigate();
  const { authLoading, setAuthSession, user } = useAppContext();
  const [mode, setMode] = useState<AuthMode>('login');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loginForm, setLoginForm] = useState({ identifier: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    name: '',
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
    <main className="max-w-5xl mx-auto px-4 py-16 md:py-24">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        <section className="space-y-6">
          <p className="text-sm uppercase tracking-[0.35em] opacity-50">Аккаунт</p>
          <h1 className="text-5xl md:text-6xl font-playfair font-bold uppercase tracking-tight leading-none">
            Вход и регистрация
          </h1>
          <p className="text-lg leading-relaxed opacity-70 max-w-md">
            Корзина и избранное, которые вы добавили как гость, будут привязаны к аккаунту сразу после входа.
          </p>
        </section>

        <section className="border border-gray-200 p-6 md:p-8">
          <div className="flex gap-3 mb-8">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`px-5 py-3 text-sm uppercase tracking-[0.25em] border ${
                mode === 'login' ? 'bg-black text-white border-black' : 'border-gray-300'
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
              className={`px-5 py-3 text-sm uppercase tracking-[0.25em] border ${
                mode === 'register' ? 'bg-black text-white border-black' : 'border-gray-300'
              }`}
            >
              Регистрация
            </button>
          </div>

          {error ? (
            <div className="mb-6 border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              {error}
            </div>
          ) : null}

          {mode === 'login' ? (
            <form className="space-y-5" onSubmit={handleLogin}>
              <input
                type="text"
                placeholder="Email или username"
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
                className="w-full bg-black text-white py-4 text-sm uppercase tracking-[0.3em] disabled:opacity-60"
              >
                {submitting ? 'Входим...' : 'Войти'}
              </button>
            </form>
          ) : (
            <form className="space-y-5" onSubmit={handleRegister}>
              <input
                type="text"
                placeholder="Имя"
                value={registerForm.name}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full border-b border-gray-300 py-3 outline-none focus:border-black"
                required
              />
              <input
                type="email"
                placeholder="Email"
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
                className="w-full bg-black text-white py-4 text-sm uppercase tracking-[0.3em] disabled:opacity-60"
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
