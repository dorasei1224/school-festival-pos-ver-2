'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CartItem, Product } from '@/types/database';

export function useCart() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [hasCoupon, setHasCoupon] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // カート操作
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null)
    );
  };

  const clearCart = () => {
    setCart([]);
    setHasCoupon(false);
  };

  // 割引ロジックの計算
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce(
    (sum, item) => sum + item.product.current_price * item.quantity,
    0
  );

  // 2品目以降 100円引き (例: 8点購入なら (8-1)×100 = 700円引き)
  const setDiscount = totalItems > 1 ? (totalItems - 1) * 100 : 0;
  // クーポン適用時 100円引き
  const couponDiscount = hasCoupon ? 100 : 0;

  const totalDiscount = setDiscount + couponDiscount;
  const totalAmount = Math.max(0, subtotal - totalDiscount);

  // 会計処理
  const checkout = async (
    staffName: string,
    receivedAmount: number
  ): Promise<{ success: boolean; change?: number; orderNumber?: number; error?: string }> => {
    if (cart.length === 0) return { success: false, error: 'カートが空です' };
    if (receivedAmount < totalAmount)
      return { success: false, error: 'お預かり金額が不十分です' };

    setIsProcessing(true);

    const changeAmount = receivedAmount - totalAmount;
    const itemsPayload = cart.map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity,
      unit_price: item.product.current_price,
    }));

    try {
      const { data, error } = await supabase.rpc('process_checkout', {
        p_staff_name: staffName,
        p_total_amount: totalAmount,
        p_received_amount: receivedAmount,
        p_change_amount: changeAmount,
        p_items: itemsPayload,
      });

      if (error) {
        console.error('会計エラー:', error);
        return { success: false, error: error.message };
      }

      let orderNumber: number | undefined;
      if (data?.order_id) {
        const { data: orderData } = await supabase
          .from('orders')
          .select('order_number')
          .eq('id', data.order_id)
          .single();
        if (orderData) {
          orderNumber = orderData.order_number;
        }
      }

      return { success: true, change: changeAmount, orderNumber };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '通信エラーが発生しました';
      return { success: false, error: message };
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    cart,
    addToCart,
    updateQuantity,
    clearCart,
    hasCoupon,
    setHasCoupon,
    totalItems,
    subtotal,
    setDiscount,
    couponDiscount,
    totalDiscount,
    totalAmount,
    checkout,
    isProcessing,
  };
}