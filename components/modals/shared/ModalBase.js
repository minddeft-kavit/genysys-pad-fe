'use client';

import { X } from 'lucide-react';

/**
 * Base modal component with consistent styling
 */
export function ModalBase({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  maxWidth = 'max-w-md',
  showCloseButton = true 
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`bg-gray-800 rounded-lg ${maxWidth} w-full`}>
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            {title && <h2 className="text-2xl font-bold">{title}</h2>}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors ml-auto"
                aria-label="Close modal"
              >
                <X size={24} />
              </button>
            )}
          </div>
        )}
        
        {/* Content */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Modal section component
 */
export function ModalSection({ title, children, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {title && (
        <h3 className="text-sm font-medium text-gray-300">{title}</h3>
      )}
      {children}
    </div>
  );
}

/**
 * Modal info box component
 */
export function ModalInfoBox({ children, variant = 'info' }) {
  const variants = {
    info: 'bg-blue-900/20 border-blue-600/50 text-blue-400',
    warning: 'bg-yellow-900/20 border-yellow-600/50 text-yellow-400',
    error: 'bg-red-900/20 border-red-600/50 text-red-400',
    success: 'bg-green-900/20 border-green-600/50 text-green-400',
  };

  return (
    <div className={`rounded-lg border p-3 text-sm ${variants[variant]}`}>
      {children}
    </div>
  );
}

/**
 * Modal button group
 */
export function ModalButtonGroup({ children, className = '' }) {
  return (
    <div className={`flex space-x-3 pt-4 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Modal button
 */
export function ModalButton({ 
  children, 
  onClick, 
  disabled = false, 
  loading = false, 
  variant = 'primary',
  fullWidth = true,
  ...props 
}) {
  const variants = {
    primary: 'bg-purple-600 hover:bg-purple-700 text-white',
    secondary: 'bg-gray-700 hover:bg-gray-600 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
  };

  const baseClasses = 'px-4 py-2 font-semibold rounded-lg transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed';
  const variantClasses = variants[variant];
  const widthClasses = fullWidth ? 'flex-1' : '';

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses} ${widthClasses}`}
      {...props}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}