import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { Shield, Sparkles, Building2, Store, ArrowRight, CheckCircle2 } from 'lucide-react';
import { AuthIdentity, getAuthErrorMessage } from '../auth/authPolicy';

interface AuthViewProps {
  sessionError?: string;
  demoLoginEnabled: boolean;
  onDemoSignIn: (user: AuthIdentity) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  sessionError,
  demoLoginEnabled,
  onDemoSignIn,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      console.warn('Google authentication failed:', err);
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSignIn = (email: string) => {
    if (!demoLoginEnabled) return;
    const uid = 'usr_' + btoa(email).replace(/=/g, '');
    onDemoSignIn({ uid, email });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 md:p-8">
      
      {/* Floating Auth Card */}
      <div className="w-full max-w-md sm:max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden space-y-6">
        
        {/* Header with High Density Theme Accent */}
        <div className="bg-[#333333] text-white p-6 sm:p-8 text-center border-b-4 border-[#FF6B00]">
          <div className="w-12 h-12 bg-[#FF6B00] text-white rounded-lg flex items-center justify-center font-bold text-xl mx-auto shadow-md mb-3">
            iT
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            iTred <span className="text-[#FF6B00]">POS</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-300 mt-1 font-medium">
            Multi-Tenant Point of Sale & Inventory Platform
          </p>
        </div>

        {/* Card Content - White Background */}
        <div className="p-6 sm:p-8 space-y-6 bg-white">
          
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold text-slate-900">Vendor Sign In & Registration</h2>
            <p className="text-xs text-slate-500">
              Authenticate using your Google Workspace email account to access your POS terminal.
            </p>
          </div>

          {(error || sessionError) && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl text-center font-medium">
              {error || sessionError}
            </div>
          )}

          {/* Primary Google Sign In Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3.5 px-6 bg-[#333333] hover:bg-black text-white font-bold rounded-lg shadow-md flex items-center justify-center gap-3 transition-all cursor-pointer border border-transparent hover:border-[#FF6B00] active:scale-[0.99] text-sm"
          >
            {/* Google Icon SVG */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.37 7.37 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.99 0 12s.45 3.85 1.24 5.42l4.04-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 2.63 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>{loading ? 'Authenticating Google Email...' : 'Continue with Google Account'}</span>
          </button>

          {demoLoginEnabled && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">
                Development Test Persona Sign-In
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleDemoSignIn('new.vendor@itredcommerce.com')}
                  className="p-3 bg-orange-50 hover:bg-orange-100/80 text-orange-950 border border-orange-200 rounded-xl text-xs font-bold text-left transition-colors flex items-center justify-between group cursor-pointer"
                >
                  <div>
                    <p className="text-slate-900 font-bold">New Vendor</p>
                    <p className="text-[10px] text-slate-600">Triggers Onboarding</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#FF6600] group-hover:translate-x-0.5 transition-transform" />
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoSignIn('seigendc@gmail.com')}
                  className="p-3 bg-slate-50 hover:bg-slate-100 text-slate-900 border border-slate-200 rounded-xl text-xs font-bold text-left transition-colors flex items-center justify-between group cursor-pointer"
                >
                  <div>
                    <p className="text-slate-900 font-bold">Returning Vendor</p>
                    <p className="text-[10px] text-slate-600">Uses Local Development Data</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#1F242D] group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Security Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center text-[11px] text-slate-500 font-medium flex items-center justify-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-slate-400" />
          <span>Connected to Google Cloud & Firebase Firestore Engine</span>
        </div>

      </div>

    </div>
  );
};
