import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Coffee, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { useAuth, HOME_BY_ROLE } from '../context/AuthContext';
import BlurText from '../components/reactbits/BlurText';
import ShinyButton from '../components/reactbits/ShinyButton';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const user = await login(username, password);
      navigate(HOME_BY_ROLE[user.role] || '/');
    } catch (err) {
      setError(err.status === 429 ? err.message : 'Invalid username or password');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-bean relative overflow-hidden">
      <div className="absolute top-0 right-0 p-20 opacity-5 rotate-12 pointer-events-none">
        <Coffee size={400} />
      </div>
      <div className="absolute bottom-0 left-0 p-20 opacity-5 -rotate-12 pointer-events-none">
        <Coffee size={300} />
      </div>

      <div className={`bg-white p-10 rounded-[3rem] shadow-2xl max-w-sm w-full border-t-[12px] border-chiya relative z-10 ${error ? 'animate-shake' : ''}`}>
        <div className="flex flex-col items-center gap-4 mb-10">
          <div className="bg-cream p-5 rounded-3xl shadow-sm">
            <Coffee size={40} className="text-espresso" />
          </div>
          <div className="text-center">
            <BlurText as="h1" text="HCP Login" className="text-3xl font-bold text-bean handwritten block" />
            <p className="text-[10px] uppercase font-black text-gray-400 tracking-[0.2em] mt-1">
              Staff · Kitchen · Owner
            </p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="relative group">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-chiya transition-colors" size={20} />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-12 pr-6 p-4 rounded-2xl border-2 outline-none transition-all font-bold border-gray-50 bg-gray-50 focus:bg-white focus:border-chiya"
              placeholder="Username"
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div className="relative group">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-chiya transition-colors" size={20} />
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-12 pr-12 p-4 rounded-2xl border-2 outline-none transition-all font-bold border-gray-50 bg-gray-50 focus:bg-white focus:border-chiya"
              placeholder="Password"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              tabIndex={-1}
              title={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-300 hover:text-chiya transition-colors"
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <p className="text-center text-red-500 font-black text-xs">{error}</p>
          )}

          <ShinyButton
            type="submit"
            disabled={busy}
            className="w-full bg-espresso text-white py-4 rounded-[1.5rem] font-black text-lg hover:bg-bean transition-colors shadow-xl disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign In'} <ChevronRight size={20} />
          </ShinyButton>
        </form>
      </div>
    </div>
  );
}
