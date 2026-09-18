'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface KitchenOrderItem {
  id: string;
  quantity: number;
  product: { name: string } | { name: string }[] | null;
}

interface KitchenOrder {
  id: string;
  orderNumber: number;
  createdAt: string;
  status: 'pending' | 'ready';
  items: { name: string; quantity: number }[];
  waitingNumber?: number | null;
}

export default function KitchenPage() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    const [{ data: waitingData, error: waitingError }, { data, error }] = await Promise.all([
      supabase
        .from('waiting_cards')
        .select('order_id, waiting_number, status')
        .eq('status', 'assigned'),
      supabase
        .from('orders')
        .select(`id, order_number, created_at, status, order_items (id, quantity, product:products (name))`)
        .in('status', ['pending', 'ready'])
        .order('created_at', { ascending: true }),
    ]);

    if (waitingError) {
      console.error('待合番号の取得に失敗しました:', waitingError.message);
    }

    if (error) {
      console.error('厨房注文の取得に失敗しました:', error.message);
      setIsLoading(false);
      return;
    }

    const waitingNumberMap = new Map<string, number>();
    for (const card of waitingData ?? []) {
      if (card.order_id && card.waiting_number != null) {
        waitingNumberMap.set(String(card.order_id), Number(card.waiting_number));
      }
    }

    const nextOrders = (data ?? [])
      .filter((order) => ['pending', 'ready'].includes(String(order.status ?? '').toLowerCase()))
      .map((order) => ({
        id: order.id,
        orderNumber: order.order_number,
        createdAt: order.created_at,
        status: String(order.status).toLowerCase() === 'ready' ? 'ready' : 'pending',
        waitingNumber: waitingNumberMap.get(order.id) ?? null,
        items: (order.order_items ?? []).map((item: KitchenOrderItem) => ({
          name: Array.isArray(item.product) ? item.product[0]?.name || '商品' : item.product?.name || '商品',
          quantity: item.quantity,
        })),
      } satisfies KitchenOrder));

    setOrders(nextOrders);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchOrders();

    const pollingId = window.setInterval(() => {
      void fetchOrders();
    }, 5000);

    const channel = supabase
      .channel('kitchen-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waiting_cards' }, () => fetchOrders())
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Realtime fallback] kitchen channel unavailable, using polling.');
        }
      });

    return () => {
      window.clearInterval(pollingId);
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  const pendingOrders = useMemo(
    () => orders.filter((order) => order.status === 'pending'),
    [orders]
  );
  const readyOrders = useMemo(
    () => orders.filter((order) => order.status === 'ready'),
    [orders]
  );

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-neutral-800 font-sans">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-3 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:justify-between sm:items-center">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex flex-col leading-none">
              <span className="text-base sm:text-lg font-black tracking-tight text-neutral-900">つぐポス</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-neutral-400">kitchen</span>
            </div>
            <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              リアルタイム更新
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link href="/counter" className="text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium px-2.5 sm:px-3 py-1.5 rounded-lg transition">
              受け渡し画面
            </Link>
            <Link href="/" className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium px-2.5 sm:px-3.5 py-1.5 rounded-lg transition shadow-sm">
              レジ画面へ
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-6 space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <section className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-neutral-900">準備中</h2>
              <span className="bg-neutral-900 text-white text-xs font-bold px-2.5 py-1 rounded-full">{pendingOrders.length}件</span>
            </div>

            <div className="space-y-3">
              {isLoading ? (
                <div className="text-sm text-neutral-500 py-8 text-center">注文を読み込み中...</div>
              ) : pendingOrders.length === 0 ? (
                <div className="text-sm text-neutral-400 py-8 text-center">準備中の注文はありません</div>
              ) : (
                pendingOrders.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <div>
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-[0.2em]">注文番号</p>
                        <p className="text-2xl font-black text-neutral-900">No.{order.orderNumber}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-neutral-400">受付時間</p>
                        <p className="text-xs font-bold text-neutral-700">
                          {new Date(order.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-sm text-neutral-700">
                      {order.items.map((item, index) => (
                        <div key={`${order.id}-${item.name}-${index}`} className="flex justify-between gap-3">
                          <span>{item.name}</span>
                          <span className="font-bold">×{item.quantity}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 pt-3 border-t border-neutral-200 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-neutral-500">待合番号</span>
                      <span className="text-lg font-black text-amber-600">{order.waitingNumber ? `No.${order.waitingNumber}` : '未割当'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-neutral-900">呼び出し中</h2>
              <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">{readyOrders.length}件</span>
            </div>

            <div className="space-y-3">
              {readyOrders.length === 0 ? (
                <div className="text-sm text-neutral-400 py-8 text-center">呼び出し中の注文はありません</div>
              ) : (
                readyOrders.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <div>
                        <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-[0.2em]">注文番号</p>
                        <p className="text-2xl font-black text-neutral-900">No.{order.orderNumber}</p>
                      </div>
                      <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded-full">呼び出し中</span>
                    </div>

                    <div className="space-y-1.5 text-sm text-neutral-700">
                      {order.items.map((item, index) => (
                        <div key={`${order.id}-${item.name}-${index}`} className="flex justify-between gap-3">
                          <span>{item.name}</span>
                          <span className="font-bold">×{item.quantity}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 pt-3 border-t border-emerald-200 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-emerald-700">待合番号</span>
                      <span className="text-lg font-black text-emerald-700">{order.waitingNumber ? `No.${order.waitingNumber}` : '未割当'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
