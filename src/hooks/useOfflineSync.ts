'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export interface OrderData {
  id: string;
  orderNumber: number;
  staffName: string;
  staffId?: string;
  items: { productId: string; name: string; price: number; quantity: number }[];
  subtotal: number;
  discount: number;
  finalTotal: number;
  receivedAmount: number;
  changeAmount: number;
  createdAt: string;
}

const PENDING_KEY = 'pos_un-synced_orders';
const COMPLETED_KEY = 'pos_completed_orders';

interface CheckoutResult {
  order_id?: string;
}

interface SaveOrderResult {
  success: boolean;
  synced: boolean;
  orderNumber?: number;
  orderId?: string;
}

export function useOfflineSync() {
  // SSRと初回クライアント描画を一致させ、hydration mismatchを防ぐ
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingOrders, setPendingOrders] = useState<OrderData[]>([]);
  const [completedOrders, setCompletedOrders] = useState<OrderData[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // 二重同期防止フラグ
  const isSyncingRef = useRef(false);

  // ローカルストレージからの読み込み
  const loadLocalData = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const pending = localStorage.getItem(PENDING_KEY);
      const completed = localStorage.getItem(COMPLETED_KEY);
      if (pending) setPendingOrders(JSON.parse(pending));
      if (completed) setCompletedOrders(JSON.parse(completed));
    } catch (e) {
      console.error('Storage parse error:', e);
    }
  }, []);

  // 同期完了データのローカル履歴への保存
  const saveCompletedLocal = useCallback((order: OrderData) => {
    try {
      const current = JSON.parse(localStorage.getItem(COMPLETED_KEY) || '[]');
      const updated = [order, ...current];
      localStorage.setItem(COMPLETED_KEY, JSON.stringify(updated));
      setCompletedOrders(updated);
    } catch (e) {
      console.error('Failed to save completed order:', e);
    }
  }, []);

  // オンライン時はSupabaseの会計RPCへ送信する
  const sendOrderToServer = useCallback(async (order: OrderData): Promise<{ success: boolean; orderNumber?: number; orderId?: string }> => {
    try {
      const { data, error } = await supabase.rpc('process_checkout', {
        p_staff_name: order.staffName,
        p_total_amount: order.finalTotal,
        p_received_amount: order.receivedAmount,
        p_change_amount: order.changeAmount,
        p_items: order.items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.price,
        })),
      });

      if (error) {
        console.error('Supabaseへの注文送信に失敗しました:', error.message);
        return { success: false };
      }

      const checkout = data as CheckoutResult | null;
      if (!checkout?.order_id) {
        console.error('会計RPCからorder_idが返されませんでした。');
        return { success: false };
      }

      const { data: savedOrder, error: orderError } = await supabase
        .from('orders')
        .select('id, order_number')
        .eq('id', checkout.order_id)
        .single();

      if (orderError || !savedOrder) {
        console.error('登録済み注文番号の取得に失敗しました:', orderError?.message);
        return { success: false };
      }

      return { success: true, orderId: savedOrder.id, orderNumber: savedOrder.order_number };
    } catch (error) {
      console.error('Supabaseへの注文送信中に例外が発生しました:', error);
      return { success: false };
    }
  }, []);

  // 1件ずつ安全にループ処理する同期関数
  const syncPendingOrders = useCallback(async () => {
    if (isSyncingRef.current || !navigator.onLine) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const saved = localStorage.getItem(PENDING_KEY);
      let currentQueue: OrderData[] = saved ? JSON.parse(saved) : [];

      // 1件ずつ送信し、成功するごとにストレージから削除（通信断絶対策）
      while (currentQueue.length > 0 && navigator.onLine) {
        const targetOrder = currentQueue[0];
        const result = await sendOrderToServer(targetOrder);

        if (result.success) {
          const syncedOrder = result.orderNumber
            ? { ...targetOrder, orderNumber: result.orderNumber }
            : targetOrder;
          currentQueue = currentQueue.slice(1);
          localStorage.setItem(PENDING_KEY, JSON.stringify(currentQueue));
          setPendingOrders(currentQueue);
          saveCompletedLocal(syncedOrder);
        } else {
          // 送信失敗時はループ中断
          break;
        }
      }
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [sendOrderToServer, saveCompletedLocal]);

  // イベント監視（オンライン復帰・画面フォーカス・別タブ更新）
  useEffect(() => {
    if (typeof window === 'undefined') return;

    void Promise.resolve().then(() => {
      setIsOnline(navigator.onLine);
      loadLocalData();
    });

    const handleOnline = () => {
      setIsOnline(true);
      syncPendingOrders();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleFocusOrStorage = () => {
      loadLocalData();
      if (navigator.onLine) {
        syncPendingOrders();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocusOrStorage);
    window.addEventListener('storage', handleFocusOrStorage);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocusOrStorage);
      window.removeEventListener('storage', handleFocusOrStorage);
    };
  }, [loadLocalData, syncPendingOrders]);

  // 新規注文保存
  const saveOrder = useCallback(async (order: OrderData): Promise<SaveOrderResult> => {
    if (navigator.onLine) {
      const result = await sendOrderToServer(order);
      if (result.success) {
        const syncedOrder = {
          ...order,
          id: result.orderId ?? order.id,
          orderNumber: result.orderNumber ?? order.orderNumber,
        };
        saveCompletedLocal(syncedOrder);
        return { success: true, synced: true, orderNumber: syncedOrder.orderNumber, orderId: syncedOrder.id };
      }
    }

    const saved = localStorage.getItem(PENDING_KEY);
    const currentQueue: OrderData[] = saved ? JSON.parse(saved) : [];
    const updated = [...currentQueue, order];
    localStorage.setItem(PENDING_KEY, JSON.stringify(updated));
    setPendingOrders(updated);
    return { success: true, synced: false, orderNumber: order.orderNumber, orderId: order.id };
  }, [sendOrderToServer, saveCompletedLocal]);

  return {
    isOnline,
    pendingOrders,
    completedOrders,
    pendingOrdersCount: pendingOrders.length,
    isSyncing,
    saveOrder,
    syncPendingOrders,
  };
}