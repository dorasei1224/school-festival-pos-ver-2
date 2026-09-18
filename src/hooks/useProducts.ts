'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Product } from '@/types/database';

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');

      if (error) {
        console.error('商品データ取得エラー:', error);
      } else if (data) {
        setProducts(data);
      }
      setLoading(false);
    };

    void fetchProducts();

    const pollingId = window.setInterval(() => {
      void fetchProducts();
    }, 3000);

    const channel = supabase
      .channel('products-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setProducts((prev) =>
              prev.map((p) => (p.id === payload.new.id ? (payload.new as Product) : p))
            );
          } else if (payload.eventType === 'INSERT') {
            setProducts((prev) => [...prev, payload.new as Product]);
          } else if (payload.eventType === 'DELETE') {
            setProducts((prev) => prev.filter((p) => p.id === payload.old.id));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Realtime fallback] products channel unavailable, using polling.');
        }
      });

    return () => {
      window.clearInterval(pollingId);
      supabase.removeChannel(channel);
    };
  }, []);

  return { products, loading };
}