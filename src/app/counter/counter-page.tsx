'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface OrderItem {
  name: string;
  quantity: number;
}

interface Order {
  id: string;
  orderNumber: number;
  time: string;
  items: OrderItem[];
  status: 'preparing' | 'calling' | 'completed';
}

interface DatabaseOrder {
  id: string;
  order_number: number;
  created_at: string;
  status: string;
  order_items: {
    id: string;
    quantity: number;
    product: { name: string } | { name: string }[] | null;
  }[] | null;
}

export default function CounterPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select(`id, order_number, created_at, status, order_items (id, quantity, product:products (name))`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('受け渡し注文の取得に失敗しました:', error.message);
      return;
    }

    const databaseOrders = (data as DatabaseOrder[])
      .filter((order) => ['pending', 'ready', 'completed'].includes(order.status.toLowerCase()))
      .map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      time: new Date(order.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      items: (order.order_items || []).map((item) => ({
        name: Array.isArray(item.product) ? item.product[0]?.name || '商品' : item.product?.name || '商品',
        quantity: item.quantity,
      })),
      status: order.status.toLowerCase() === 'pending' ? 'preparing' : order.status.toLowerCase() === 'ready' ? 'calling' : 'completed',
    } satisfies Order));
    setOrders(databaseOrders);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => fetchOrders());
    const channel = supabase
      .channel('counter-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchOrders())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  // ステータス更新処理
  const updateStatus = async (orderId: string, newStatus: 'preparing' | 'calling' | 'completed') => {
    const databaseStatus = newStatus === 'preparing' ? 'pending' : newStatus === 'calling' ? 'ready' : 'completed';
    const { error } = await supabase.from('orders').update({ status: databaseStatus }).eq('id', orderId);
    if (error) {
      alert(`受け渡し状態の更新に失敗しました: ${error.message}`);
      return;
    }
    await fetchOrders();
  };

  const preparingOrders = orders.filter((o) => o.status === 'preparing');
  const callingOrders = orders.filter((o) => o.status === 'calling');
  const completedOrders = orders.filter((o) => o.status === 'completed');

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-neutral-800 font-sans flex flex-col antialiased">
      {/* ========================================================= */}
      {/* 管理画面・レジ画面と統一されたヘッダーUI */}
      {/* ========================================================= */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-3 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:justify-between sm:items-center">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-neutral-900">
              文化祭POS
            </h1>
            <span className="bg-emerald-50 text-emerald-600 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              オンライン
            </span>
            <span className="bg-neutral-100 text-neutral-600 text-xs font-semibold px-2 py-0.5 rounded-md border border-neutral-200">
              受け渡しカウンター
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className="text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium px-2.5 sm:px-3 py-1.5 rounded-lg transition"
            >
              レジ画面へ
            </Link>
            <Link
              href="/admin"
              className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium px-2.5 sm:px-3.5 py-1.5 rounded-lg transition shadow-sm"
            >
              管理画面へ
            </Link>
          </div>
        </div>
      </header>

      {/* ========================================================= */}
      {/* メインエリア：カウンター進行状況表示 */}
      {/* ========================================================= */}
      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-6 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* ① 準備中・調理中カラム */}
        <section className="lg:col-span-5 bg-white rounded-3xl p-4 sm:p-5 border border-neutral-200/80 shadow-sm min-h-[420px] lg:min-h-[600px] flex flex-col">
          <div className="flex justify-between items-center pb-4 mb-4 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <h2 className="font-bold text-base text-neutral-900">準備中・調理中</h2>
            </div>
            <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-200">
              {preparingOrders.length}件
            </span>
          </div>

          <div className="space-y-4 flex-1 overflow-y-auto pr-1">
            {preparingOrders.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-20">現在準備中の注文はありません</p>
            ) : (
              preparingOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200/80 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-2xl font-black text-neutral-900">
                        No. {order.orderNumber}
                      </span>
                      <span className="text-xs text-neutral-400 font-medium">{order.time}</span>
                    </div>

                    <div className="space-y-1 mb-4">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs font-bold text-neutral-700">
                          <span>{item.name}</span>
                          <span className="text-neutral-500">× {item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => updateStatus(order.id, 'calling')}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition shadow-sm"
                  >
                    準備完了 (呼び出しへ)
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ② 呼び出し中・受け渡し待ちカラム */}
        <section className="lg:col-span-4 bg-white rounded-3xl p-4 sm:p-5 border border-neutral-200/80 shadow-sm min-h-[420px] lg:min-h-[600px] flex flex-col">
          <div className="flex justify-between items-center pb-4 mb-4 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <h2 className="font-bold text-base text-neutral-900">呼び出し中 (受け渡し可)</h2>
            </div>
            <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
              {callingOrders.length}件
            </span>
          </div>

          <div className="space-y-4 flex-1 overflow-y-auto pr-1">
            {callingOrders.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-20">呼び出し中の注文はありません</p>
            ) : (
              callingOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-200/80 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-3xl font-black text-emerald-600">
                        No. {order.orderNumber}
                      </span>
                      <span className="text-xs text-neutral-400 font-medium">{order.time}</span>
                    </div>

                    <div className="space-y-1 mb-4">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs font-bold text-neutral-800">
                          <span>{item.name}</span>
                          <span className="text-neutral-500">× {item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => updateStatus(order.id, 'completed')}
                    className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-xl transition shadow-md"
                  >
                    商品を渡して完了
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ③ 完了履歴カラム */}
        <section className="lg:col-span-3 bg-white rounded-3xl p-4 sm:p-5 border border-neutral-200/80 shadow-sm min-h-[360px] lg:min-h-[600px] flex flex-col">
          <div className="flex justify-between items-center pb-4 mb-4 border-b border-neutral-100">
            <h2 className="font-bold text-base text-neutral-900">受け渡し完了</h2>
            <span className="text-xs text-neutral-400 font-medium">直近の履歴</span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto pr-1">
            {completedOrders.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-20">完了済みの履歴はありません</p>
            ) : (
              completedOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-neutral-50 rounded-xl p-3 border border-neutral-100 flex justify-between items-center opacity-70"
                >
                  <div>
                    <span className="font-extrabold text-sm text-neutral-800 block">
                      No. {order.orderNumber}
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      {order.items.map((i) => i.name).join(', ')}
                    </span>
                  </div>
                  <button
                    onClick={() => updateStatus(order.id, 'calling')}
                    className="text-[10px] text-neutral-500 hover:text-neutral-900 underline font-medium"
                  >
                    戻す
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}