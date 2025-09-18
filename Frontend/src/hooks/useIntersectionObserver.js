import { useEffect, useRef, useState } from 'react';

export const useIntersectionObserver = ({
  threshold = 0,
  root = null,
  rootMargin = '0px',
  freezeOnceVisible = false
}) => {
  const [entry, setEntry] = useState();
  const nodeRef = useRef(null);

  const frozen = entry?.isIntersecting && freezeOnceVisible;

  const updateEntry = ([entry]) => {
    setEntry(entry);
  };

  useEffect(() => {
    const node = nodeRef?.current;
    const hasIOSupport = !!window.IntersectionObserver;

    if (!hasIOSupport || frozen || !node) return;

    const observerParams = { threshold, root, rootMargin };
    const observer = new IntersectionObserver(updateEntry, observerParams);

    observer.observe(node);

    return () => observer.disconnect();
  }, [nodeRef, threshold, root, rootMargin, frozen]);

  return [nodeRef, entry];
};

// Hook for lazy loading images
export const useLazyImage = (src, placeholder = '') => {
  const [imageSrc, setImageSrc] = useState(placeholder);
  const [imageRef, inView] = useIntersectionObserver({
    threshold: 0,
    rootMargin: '50px'
  });

  useEffect(() => {
    if (inView?.isIntersecting && src) {
      setImageSrc(src);
    }
  }, [inView, src]);

  return [imageRef, imageSrc];
};

// Hook for infinite scrolling
export const useInfiniteScroll = (callback, hasMore, threshold = 100) => {
  const [isLoading, setIsLoading] = useState(false);
  const [node, setNode] = useState(null);

  const observerCallback = useCallback(
    (entries) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore && !isLoading) {
        setIsLoading(true);
        callback().finally(() => setIsLoading(false));
      }
    },
    [callback, hasMore, isLoading]
  );

  const [ref] = useIntersectionObserver({
    threshold: 0,
    rootMargin: `${threshold}px`
  });

  useEffect(() => {
    if (ref.current) {
      setNode(ref.current);
    }
  }, [ref]);

  useEffect(() => {
    if (!node) return;

    const observer = new IntersectionObserver(observerCallback);
    observer.observe(node);

    return () => observer.disconnect();
  }, [node, observerCallback]);

  return [setNode, isLoading];
};
