import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoginModal } from '../components/LoginModal';
import { useState } from 'react';
import { Heart, Leaf, Globe, Users, ShieldCheck, Award, ChevronRight } from 'lucide-react';

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <section className="relative bg-gradient-to-br from-primary to-primary-dark text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-white rounded-full" />
          <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-white rounded-full" />
        </div>
        <div className="relative max-w-[1200px] mx-auto px-6 py-24 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 leading-tight">
            Welcome to the World of Dynapharm!
          </h1>
          <p className="text-xl md:text-2xl opacity-90 mb-3">A World of Health, Wealth & Freedom</p>
          <p className="text-base opacity-80 max-w-2xl mx-auto mb-10 leading-relaxed">
            Where dreams come true through science, knowledge, and new ideas. Dynapharm was established
            to help and share opportunities that improve the lives and health of individuals around the globe.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => navigate('/shop')}
              className="px-8 py-3.5 bg-white text-primary font-bold rounded-full hover:bg-gray-100 transition-all hover:scale-105 shadow-lg cursor-pointer"
            >
              Online Shop
            </button>
            <button
              onClick={() => navigate('/checkup')}
              className="px-8 py-3.5 bg-white/20 backdrop-blur text-white font-bold rounded-full border-2 border-white/40 hover:bg-white/30 transition-all cursor-pointer"
            >
              Full Body Check Up
            </button>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-secondary mb-12">What Drives Us</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Heart, title: 'Health First', desc: 'We pioneer healthcare and lifestyle products for families, entrepreneurs, and communities.' },
              { icon: Leaf, title: 'Natural Products', desc: 'Our products are developed from natural ingredients, backed by scientific research.' },
              { icon: Globe, title: 'Global Reach', desc: 'Operating across multiple countries, bringing health solutions to communities worldwide.' },
            ].map((item, i) => (
              <div key={i} className="text-center p-8 rounded-xl bg-gray-50 hover:bg-white hover:shadow-lg transition-all group">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <item.icon size={28} className="text-primary" />
                </div>
                <h3 className="text-xl font-bold text-secondary mb-3">{item.title}</h3>
                <p className="text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-secondary mb-12">Our Network</h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { icon: Users, value: '50,000+', label: 'Active Distributors' },
              { icon: Globe, value: '15+', label: 'Countries' },
              { icon: ShieldCheck, value: '95+', label: 'Products' },
              { icon: Award, value: '20+', label: 'Years of Excellence' },
            ].map((stat, i) => (
              <div key={i} className="text-center p-6 bg-white rounded-xl shadow-sm">
                <stat.icon size={32} className="text-primary mx-auto mb-3" />
                <div className="text-3xl font-bold text-secondary">{stat.value}</div>
                <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-br from-primary to-primary-dark text-white">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-lg opacity-90 mb-8 max-w-xl mx-auto">
            Join the Dynapharm family and discover products that transform lives.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => navigate('/shop')}
              className="px-8 py-3 bg-white text-primary font-bold rounded-full hover:bg-gray-100 transition-all flex items-center gap-2 cursor-pointer"
            >
              Browse Products <ChevronRight size={18} />
            </button>
            {!user && (
              <button
                onClick={() => setLoginOpen(true)}
                className="px-8 py-3 border-2 border-white text-white font-bold rounded-full hover:bg-white/10 transition-all cursor-pointer"
              >
                Staff Login
              </button>
            )}
          </div>
        </div>
      </section>

      <footer className="py-8 bg-secondary text-gray-400">
        <div className="max-w-[1200px] mx-auto px-6 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} Dynapharm International Namibia. All rights reserved.</p>
          <p className="mt-1 text-xs">Cloud Health Management System</p>
        </div>
      </footer>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
