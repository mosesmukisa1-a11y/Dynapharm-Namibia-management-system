import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

export function Card({ children, className, ...props }) {
  return (
    <div className={clsx('bg-white rounded-xl border border-gray-200 shadow-sm', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }) {
  return <div className={clsx('px-6 py-4 border-b border-gray-100', className)}>{children}</div>;
}

export function CardBody({ children, className }) {
  return <div className={clsx('p-6', className)}>{children}</div>;
}

export function Button({ children, variant = 'primary', size = 'md', className, disabled, ...props }) {
  const base = 'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-gradient-to-r from-primary to-primary-dark text-white hover:opacity-90 hover:-translate-y-0.5',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    success: 'bg-gradient-to-r from-accent-green to-emerald-700 text-white hover:opacity-90',
    danger: 'bg-gradient-to-r from-accent-red to-red-700 text-white hover:opacity-90',
    warning: 'bg-gradient-to-r from-accent-orange to-amber-600 text-white hover:opacity-90',
    outline: 'border-2 border-primary text-primary hover:bg-primary hover:text-white',
    ghost: 'text-gray-600 hover:bg-gray-100',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2',
  };
  return (
    <button className={clsx(base, variants[variant], sizes[size], className)} disabled={disabled} {...props}>
      {children}
    </button>
  );
}

export function Input({ label, error, className, ...props }) {
  return (
    <div className={clsx('space-y-1', className)}>
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
      <input
        className={clsx(
          'w-full px-3 py-2.5 rounded-lg border transition-colors text-sm',
          error ? 'border-red-400 bg-red-50 focus:ring-red-300' : 'border-gray-300 focus:border-primary focus:ring-primary/20',
          'focus:outline-none focus:ring-2'
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function Select({ label, options, error, className, ...props }) {
  return (
    <div className={clsx('space-y-1', className)}>
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
      <select
        className={clsx(
          'w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm',
          'focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20'
        )}
        {...props}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, className, ...props }) {
  return (
    <div className={clsx('space-y-1', className)}>
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
      <textarea
        className={clsx(
          'w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm',
          'focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20',
          'min-h-[80px] resize-y'
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function Badge({ children, variant = 'default', className }) {
  const variants = {
    default: 'bg-gray-100 text-gray-700',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  );
}

export function Modal({ open, onClose, title, children, size = 'md', className }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        ref={ref}
        className={clsx('relative bg-white rounded-xl shadow-2xl w-full overflow-hidden', sizes[size], className)}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
              <X size={20} className="text-gray-500" />
            </button>
          </div>
        )}
        <div className="max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange, className }) {
  return (
    <div className={clsx('flex gap-1 bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200 p-1 pb-0 overflow-x-auto scrollbar-thin', className)}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all relative whitespace-nowrap cursor-pointer',
            active === tab.id
              ? 'bg-white text-primary font-semibold shadow-sm after:absolute after:bottom-[-2px] after:left-0 after:right-0 after:h-[3px] after:bg-primary after:rounded-t'
              : 'text-gray-500 hover:text-primary hover:bg-primary/5'
          )}
        >
          {tab.icon && <span className="mr-1.5">{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ title, value, subtitle, icon, color = 'blue', className }) {
  const colors = {
    blue: 'from-blue-500 to-blue-700',
    red: 'from-red-500 to-red-700',
    green: 'from-emerald-500 to-emerald-700',
    orange: 'from-orange-500 to-orange-700',
    purple: 'from-purple-500 to-purple-700',
    teal: 'from-teal-500 to-teal-700',
    pink: 'from-pink-500 to-pink-700',
  };
  return (
    <div className={clsx('rounded-xl p-5 text-white bg-gradient-to-br', colors[color], className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm opacity-90">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subtitle && <p className="text-xs opacity-75 mt-1">{subtitle}</p>}
        </div>
        {icon && <div className="opacity-80">{icon}</div>}
      </div>
    </div>
  );
}

export function Table({ columns, data, emptyMessage = 'No data available', className }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {columns.map((col, i) => (
              <th key={i} className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">{emptyMessage}</td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr key={row.id || i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                {columns.map((col, j) => (
                  <td key={j} className="px-4 py-3 text-gray-700">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && <div className="text-gray-300 mb-4">{icon}</div>}
      <h3 className="text-lg font-semibold text-gray-600 mb-2">{title}</h3>
      {description && <p className="text-sm text-gray-400 mb-4 max-w-md">{description}</p>}
      {action}
    </div>
  );
}

export function LoadingSpinner({ size = 'md', className }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' };
  return (
    <div className={clsx('flex items-center justify-center py-8', className)}>
      <div className={clsx('animate-spin rounded-full border-2 border-primary border-t-transparent', sizes[size])} />
    </div>
  );
}

export function Alert({ type = 'info', children, className }) {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-700',
    success: 'bg-green-50 border-green-200 text-green-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    error: 'bg-red-50 border-red-200 text-red-700',
  };
  return (
    <div className={clsx('px-4 py-3 rounded-lg border text-sm', styles[type], className)}>
      {children}
    </div>
  );
}
