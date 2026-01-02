import { useState, useRef, useEffect } from 'react';
import { ImageIcon } from 'lucide-react';

type LazyImageProps = {
  src: string;
  alt: string;
  className?: string;
  placeholder?: React.ReactNode;
  onLoad?: () => void;
  onError?: () => void;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'auto' | 'sync';
};

/**
 * LazyImage Component
 * 
 * Optimized image component with:
 * - Native lazy loading
 * - Intersection Observer for viewport detection
 * - Placeholder while loading
 * - Error handling with fallback
 * - Optimized decoding
 */
export const LazyImage = ({
  src,
  alt,
  className = '',
  placeholder,
  onLoad,
  onError,
  loading = 'lazy',
  decoding = 'async',
}: LazyImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Intersection Observer for viewport detection
  useEffect(() => {
    if (!imgRef.current || loading === 'eager') {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before entering viewport
      }
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, [loading]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // Show placeholder while loading or if error
  if (!isLoaded || hasError) {
    return (
      <div className={`relative ${className}`}>
        {placeholder || (
          <div className="w-full h-full bg-black/40 flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-white/30" />
          </div>
        )}
        {isInView && !hasError && (
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            className="absolute inset-0 w-full h-full object-cover opacity-0"
            loading={loading}
            decoding={decoding}
            onLoad={handleLoad}
            onError={handleError}
          />
        )}
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
};


