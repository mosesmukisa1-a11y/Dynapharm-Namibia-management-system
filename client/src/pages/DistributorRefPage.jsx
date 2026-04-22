import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { COMPANY_INFO } from '../lib/constants';
import { ShoppingCart, Stethoscope, UserPlus, MapPin, Award, CheckCircle } from 'lucide-react';
import { LoadingSpinner } from '../components/ui';

export default function DistributorRefPage() {
  const { nbCode } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!nbCode) { setLoading(false); return; }
    const code = nbCode.toUpperCase();
    api.get(`/distributors?code=${encodeURIComponent(code)}`)
      .then(data => {
        if (data && data.distributor_code) {
          setProfile(data);
          localStorage.setItem('ref_nb', data.distributor_code);
          localStorage.setItem('ref_name', data.distributor_name || '');
        } else {
          localStorage.setItem('ref_nb', code);
          localStorage.setItem('ref_name', '');
        }
      })
      .catch(() => {
        localStorage.setItem('ref_nb', code);
        localStorage.setItem('ref_name', '');
      })
      .finally(() => setLoading(false));
  }, [nbCode]);

  const goTo = (path) => navigate(path);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0b1020] to-[#1a0a10]">
        <LoadingSpinner />
      </div>
    );
  }

  const initials = profile ? (profile.distributor_name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'DY';
  const branchLabel = profile ? (profile.branch || profile.location || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1020] via-[#1a0814] to-[#0b1020] flex flex-col items-center justify-center py-8 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src={COMPANY_INFO.logo} alt="Dynapharm Namibia" className="h-12 mx-auto drop-shadow-lg" onError={e => { e.target.style.display = 'none'; }} />
          <p className="text-white/50 text-xs mt-2 tracking-widest uppercase">Your Health Partner</p>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-3xl overflow-hidden shadow-2xl border border-white/10">
          <div className="bg-gradient-to-r from-[#c41e3a] to-[#8b0000] px-6 py-5 text-white text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute -top-8 -right-8 w-32 h-32 bg-white rounded-full" />
              <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-white rounded-full" />
            </div>
            <div className="relative">
              <div className="w-20 h-20 rounded-full mx-auto mb-3 border-4 border-white/40 overflow-hidden bg-white/20 flex items-center justify-center shadow-xl">
                {profile?.photo_url ? (
                  <img src={profile.photo_url} alt={profile.distributor_name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-2xl">{initials}</span>
                )}
              </div>
              {profile ? (
                <>
                  <h2 className="text-xl font-bold leading-tight">{profile.distributor_name}</h2>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <Award size={13} className="opacity-80" />
                    <span className="text-sm opacity-90 font-medium">{profile.position || 'Distributor'}</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 mt-1 text-xs opacity-70">
                    <span className="font-mono bg-white/15 px-2 py-0.5 rounded-full">{profile.distributor_code}</span>
                    {branchLabel && <><span>•</span><MapPin size={11} /><span>{branchLabel}</span></>}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold leading-tight">Dynapharm Namibia</h2>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <Award size={13} className="opacity-80" />
                    <span className="text-sm opacity-90 font-medium">Health & Wellness</span>
                  </div>
                  {nbCode && (
                    <div className="mt-1 text-xs opacity-70">
                      <span className="font-mono bg-white/15 px-2 py-0.5 rounded-full">{nbCode.toUpperCase()}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="px-6 py-5 text-white">
            <div className="flex items-center gap-2 text-green-300 text-xs mb-4 bg-green-500/10 rounded-xl px-3 py-2 border border-green-500/20">
              <CheckCircle size={14} />
              <span>
                {profile
                  ? `${profile.distributor_name?.split(' ')[0]} is your Dynapharm referral`
                  : 'Referral saved — you\'re ready to shop or book'}
              </span>
            </div>

            <p className="text-white/60 text-sm text-center mb-5 leading-relaxed">
              {profile
                ? 'Your personal health consultant invites you to explore Dynapharm\'s natural health products and services.'
                : 'Explore Dynapharm\'s natural health products or book a free health check-up at your nearest branch.'}
            </p>

            <div className="space-y-3">
              <button
                onClick={() => goTo('/shop')}
                className="w-full flex items-center gap-3 bg-gradient-to-r from-[#c41e3a] to-[#a01830] text-white font-bold py-4 px-5 rounded-2xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
              >
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <ShoppingCart size={18} />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold">Shop Products</div>
                  <div className="text-xs opacity-70">Natural health &amp; wellness products</div>
                </div>
              </button>

              <button
                onClick={() => goTo('/checkup')}
                className="w-full flex items-center gap-3 bg-white/10 border border-white/20 text-white font-bold py-4 px-5 rounded-2xl hover:bg-white/15 transition-all"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-500/30 flex items-center justify-center shrink-0">
                  <Stethoscope size={18} className="text-blue-300" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold">Free Body Check-up</div>
                  <div className="text-xs opacity-70">Full health assessment at any branch</div>
                </div>
              </button>

              <button
                onClick={() => goTo('/shop?tab=register')}
                className="w-full flex items-center gap-3 bg-white/10 border border-white/20 text-white font-bold py-4 px-5 rounded-2xl hover:bg-white/15 transition-all"
              >
                <div className="w-9 h-9 rounded-xl bg-green-500/30 flex items-center justify-center shrink-0">
                  <UserPlus size={18} className="text-green-300" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold">Join as Distributor</div>
                  <div className="text-xs opacity-70">Earn commissions &amp; build your network</div>
                </div>
              </button>
            </div>
          </div>

          <div className="border-t border-white/10 px-6 py-4 text-center">
            <p className="text-white/30 text-xs">Dynapharm International Namibia</p>
            <p className="text-white/20 text-xs mt-0.5">Where dreams come true through science &amp; knowledge</p>
          </div>
        </div>
      </div>
    </div>
  );
}
