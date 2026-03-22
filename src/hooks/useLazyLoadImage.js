import { useEffect, useRef, useState } from "react";

/**
 * Custom hook for lazy loading images using Intersection Observer
 * Loads images only when they come into view
 *
 * @returns {Object} { ref, isVisible, isLoaded, error }
 */
export function useLazyLoadImage() {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        rootMargin: "100px", // Start loading 100px before entering viewport
        threshold: 0.01,
      },
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, []);

  const handleLoad = () => setIsLoaded(true);
  const handleError = (err) => setError(err);

  return {
    ref,
    isVisible,
    isLoaded,
    error,
    onLoad: handleLoad,
    onError: handleError,
  };
}

/**
 * Lazy Loading Image Component
 * Shows placeholder while loading, swaps to actual image when loaded
 */
export function LazyImage({
  src,
  alt,
  placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23e0e0e0" width="100" height="100"/%3E%3C/svg%3E',
  className = "",
  ...props
}) {
  const { ref, isVisible, isLoaded, onLoad, onError } = useLazyLoadImage();

  return (
    <img
      ref={ref}
      src={isVisible ? src : placeholder}
      alt={alt}
      onLoad={onLoad}
      onError={onError}
      className={className}
      loading="lazy"
      decoding="async"
      {...props}
    />
  );
}
