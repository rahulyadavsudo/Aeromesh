import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Lock, Mail, ShieldCheck, UserPlus, LogIn } from 'lucide-react';
import type { AuthUser } from '../types/travel';

interface AuthViewProps {
  initialMode?: 'login' | 'signup';
  redirectNotice?: string;
  onAuthSuccess: (user: AuthUser, token: string) => void;
  onCancel?: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  initialMode = 'login',
  redirectNotice,
  onAuthSuccess,
  onCancel,
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const payload =
        mode === 'signup'
          ? { fullName: fullName.trim(), email: email.trim(), password }
          : { email: email.trim(), password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Authentication failed.');
        setSubmitting(false);
        return;
      }

      onAuthSuccess(data.user as AuthUser, data.token as string);
    } catch {
      setError('Unable to reach authentication service. Check connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      aria-labelledby="auth-heading"
      className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <h2 id="auth-heading" className="text-xl font-bold text-slate-900 dark:text-white">
            {mode === 'login' ? 'Sign in to AeroMesh' : 'Create Traveler Account'}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Authenticated session required to reserve seats and issue QR tickets.
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400"
          >
            Back
          </button>
        )}
      </div>

      {redirectNotice && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
          {redirectNotice}
        </div>
      )}

      {/* Segmented Mode Switch */}
      <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setError('');
          }}
          className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors ${
            mode === 'login'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Sign In</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('signup');
            setError('');
          }}
          className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors ${
            mode === 'signup'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Sign Up</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        {mode === 'signup' && (
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Full Legal Name
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Rahul Yadav"
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Email Address
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="traveler@aeromesh.io"
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Password {mode === 'signup' && '(min 8 characters)'}
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0B3A63] disabled:opacity-60 transition-colors"
        >
          <span>{submitting ? 'Verifying…' : mode === 'login' ? 'Sign In & Continue' : 'Create Account & Continue'}</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2 pt-2 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span>Passwords hashed with scrypt · Session tokens verified in memory</span>
        </div>
      </form>
    </motion.section>
  );
};
