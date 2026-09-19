'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { cleanupStaleWaitingCards, ensureActiveWaitingCardAssignments, releaseWaitingCard } from '@/lib/waiting-cards';
import { HelpButton, TutorialModal, hasSeenTutorial, markTutorialSeen, type TutorialStep } from '@/components/TutorialModal';

interface OrderItem {
  name: string;
  quantity: number;
}

interface Order {
  id: string;
  orderNumber: number;
  time: string;
  items: OrderItem[];
  status: 'preparing' | 'completed';
  waitingNumber?: number | null;
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
  const [activeView, setActiveView] = useState<'board' | 'history'>('board');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);

  const demoTutorialOrders: Order[] = [
    {
      id: 'demo-order-0',
      orderNumber: 0,
      time: '12:30',
      items: [
        { name: 'チョコ', quantity: 2 },
        { name: 'ソーダ味', quantity: 1 },
      ],
      status: 'preparing',
    },
  ];

  const counterTutorialSteps: TutorialStep[] = [
    { id: 'counter-list', title: '注文一覧を確認', subtitle: '準備中の注文が並んでいます', description: '左側の一覧では、まだ受け渡しが完了していない注文が表示されます。ここを確認して次の作業に進めます。', targetId: 'counter-order-list', align: 'right' },
    { id: 'counter-select', title: '注文番号を選ぶ', subtitle: '該当の番号を押して受け渡し画面へ進みます', description: '注文番号をタップすると、右側の受け渡し操作パネルが開きます。この操作が受け渡しの中心です。', targetId: 'counter-select-target', align: 'left' },
    { id: 'counter-complete', title: '受け渡し完了', subtitle: '完了操作で状態を切り替えます', description: '完了ボタンを押すと、受け渡し状態が完了へ切り替わります。デモでは表示だけにして、保存は行わない構成です。', targetId: 'counter-complete-button', align: 'left' },
  ];

  useEffect(() => {
    if (!hasSeenTutorial()) {
      markTutorialSeen();
      setShowTutorial(true);
      setTutorialStepIndex(0);
    }
  }, []);

  useEffect(() => {
    if (!showTutorial) return;

    if (tutorialStepIndex === 0) {
      setActiveView('board');
      setSelectedOrderId(null);
      return;
    }

    if (tutorialStepIndex === 1) {
      setSelectedOrderId('demo-order-0');
      return;
    }

    if (tutorialStepIndex === 2) {
      setSelectedOrderId('demo-order-0');
    }
  }, [showTutorial, tutorialStepIndex]);

  const fetchOrders = useCallback(async () => {
    await cleanupStaleWaitingCards();
    await ensureActiveWaitingCardAssignments();

    const [{ data: waitingData, error: waitingError }, { data, error }] = await Promise.all([
      supabase
        .from('waiting_cards')
        .select('order_id, waiting_number, status')
        .eq('status', 'assigned'),
      supabase
        .from('orders')
        .select(`id, order_number, created_at, status, order_items (id, quantity, product:products (name))`)
        .order('created_at', { ascending: true }),
    ]);

    if (waitingError) {
      console.error('待合番号の取得に失敗しました:', waitingError.message);
    }

    if (error) {
      console.error('受け渡し注文の取得に失敗しました:', error.message);
      return;
    }

    const waitingNumberMap = new Map<string, number>();
    for (const card of waitingData ?? []) {
      if (card.order_id && card.waiting_number != null && card.status === 'assigned') {
        waitingNumberMap.set(String(card.order_id), Number(card.waiting_number));
      }
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
        status: order.status.toLowerCase() === 'completed' ? 'completed' : 'preparing',
        waitingNumber: waitingNumberMap.get(order.id) ?? null,
      } satisfies Order));

    setOrders(databaseOrders);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => fetchOrders());

    const pollingId = window.setInterval(() => {
      void fetchOrders();
    }, 3000);

    const channel = supabase
      .channel('counter-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waiting_cards' }, () => fetchOrders())
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Realtime fallback] counter channel unavailable, using polling.');
        }
      });

    return () => {
      window.clearInterval(pollingId);
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  // ステータス更新処理
  const updateStatus = async (orderId: string, newStatus: 'preparing' | 'completed') => {
    const databaseStatus = newStatus === 'preparing' ? 'pending' : 'completed';
    const { error } = await supabase.from('orders').update({ status: databaseStatus }).eq('id', orderId);
    if (error) {
      alert(`受け渡し状態の更新に失敗しました: ${error.message}`);
      return;
    }

    if (databaseStatus === 'completed') {
      await releaseWaitingCard(orderId);
    }

    await fetchOrders();
  };

  const tutorialOrders = showTutorial ? [demoTutorialOrders[0]] : orders;
  const currentOrders = tutorialOrders;
  const preparingOrders = currentOrders.filter((o) => o.status === 'preparing');
  const completedOrders = currentOrders.filter((o) => o.status === 'completed');
  const recentCompletedOrders = completedOrders.slice(-5).reverse();

  const getOrderWaitingNumber = (orderId: string) => {
    const match = orders.find((order) => order.id === orderId);
    return match?.waitingNumber ?? null;
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-neutral-800 font-sans flex flex-col antialiased">
      {/* ========================================================= */}
      {/* 管理画面・レジ画面と統一されたヘッダーUI */}
      {/* ========================================================= */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-3 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:justify-between sm:items-center">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex flex-col leading-none">
              <span className="text-base sm:text-lg font-black tracking-tight text-neutral-900">
                つぐポス
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-neutral-400">
                counter
              </span>
            </div>
            <span className="bg-emerald-50 text-emerald-600 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              オンライン
            </span>
            <span className="bg-neutral-100 text-neutral-600 text-xs font-semibold px-2 py-0.5 rounded-md border border-neutral-200">
              受け渡しカウンター
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <HelpButton onClick={() => setShowTutorial(true)} />
            <Link
              href="/"
              className="text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium px-2.5 sm:px-3 py-1.5 rounded-lg transition"
            >
              レジ画面へ
            </Link>
            <Link
              href="/kitchen"
              className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium px-2.5 sm:px-3 py-1.5 rounded-lg transition border border-amber-200"
            >
              厨房画面
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

      <TutorialModal open={showTutorial} onClose={() => setShowTutorial(false)} steps={counterTutorialSteps} stepIndex={tutorialStepIndex} onStepChange={setTutorialStepIndex} />

      <nav className="bg-white border-b border-neutral-200/80" aria-label="受け渡し画面の表示切替">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 flex gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveView('board')}
            className={`px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition ${
              activeView === 'board' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-700'
            }`}
          >
            受け渡し状況
          </button>
          <button
            type="button"
            onClick={() => setActiveView('history')}
            className={`px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition ${
              activeView === 'history' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-700'
            }`}
          >
            完了履歴 ({completedOrders.length}件)
          </button>
        </div>
      </nav>

      {/* ========================================================= */}
      {/* メインエリア：カウンター進行状況表示 */}
      {/* ========================================================= */}
      {activeView === 'board' ? (
      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-6 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* ① 準備中・調理中カラム */}
        <section id="counter-order-list" className="lg:col-span-5 bg-white rounded-3xl p-4 sm:p-5 border border-neutral-200/80 shadow-sm min-h-[420px] lg:min-h-[600px] flex flex-col">
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
              preparingOrders.map((order, index) => (
                <div
                  id={index === 0 ? 'counter-select-target' : undefined}
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200/80 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-2xl font-black text-neutral-900">
                        No. {order.waitingNumber ?? '—'}
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

                  <p className="w-full py-2.5 bg-amber-500 text-white text-center font-bold text-xs rounded-xl shadow-sm">注文番号をタップして完了操作へ</p>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ② 注文番号タップ後の完了操作 */}
        <section className="lg:col-span-4 bg-white rounded-3xl p-4 sm:p-5 border border-neutral-200/80 shadow-sm min-h-[420px] lg:min-h-[600px] flex flex-col">
          <div className="flex justify-between items-center pb-4 mb-4 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-neutral-900"></span>
              <h2 className="font-bold text-base text-neutral-900">受け渡し操作</h2>
            </div>
            <span className="text-xs text-neutral-400">番号をタップ</span>
          </div>

          {!selectedOrderId ? (
            <p className="text-xs text-neutral-400 text-center py-20">準備中の注文番号をタップしてください</p>
          ) : (() => {
            const selectedOrder = preparingOrders.find((order) => order.id === selectedOrderId);
            if (!selectedOrder) return <p className="text-xs text-neutral-400 text-center py-20">注文を選択してください</p>;
            const waitingNumber = selectedOrder.waitingNumber ?? null;
            return (
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-neutral-500 font-bold">選択中の注文</p>
                  <p className="text-xl font-bold text-neutral-500 mt-2">注文番号: No. {selectedOrder.orderNumber}</p>
                  <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">待合番号</p>
                    <p className="text-4xl font-black text-neutral-900">No. {waitingNumber ?? '—'}</p>
                  </div>
                  <div className="mt-5 space-y-2">
                    {selectedOrder.items.map((item, index) => (
                      <div key={index} className="flex justify-between text-sm font-bold text-neutral-700">
                        <span>{item.name}</span><span>× {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-8 space-y-3">
                  <button
                    id="counter-complete-button"
                    type="button"
                    onClick={() => void updateStatus(selectedOrder.id, 'completed')}
                    className="w-full py-3.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-sm rounded-2xl transition shadow-md"
                  >
                    受け渡しを完了する
                  </button>
                  <button type="button" onClick={() => setSelectedOrderId(null)} className="w-full text-xs text-neutral-500 hover:text-neutral-900 underline">選択を解除</button>
                </div>
              </div>
            );
          })()}
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
              recentCompletedOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-neutral-50 rounded-xl p-3 border border-neutral-100 flex justify-between items-center opacity-70"
                >
                  <div>
                    <span className="font-extrabold text-sm text-neutral-800 block">
                      待合 No. {order.waitingNumber ?? '—'}
                    </span>
                    <span className="text-[10px] text-neutral-400 block">
                      注文番号: {order.orderNumber}
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      {order.items.map((i) => i.name).join(', ')}
                    </span>
                  </div>
                  <button
                    onClick={() => updateStatus(order.id, 'preparing')}
                    className="text-[10px] text-neutral-500 hover:text-neutral-900 underline font-medium"
                  >
                    戻す
                  </button>
                </div>
              ))
            )}
          </div>
          {completedOrders.length > recentCompletedOrders.length && (
            <button
              type="button"
              onClick={() => setActiveView('history')}
              className="mt-4 w-full py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold rounded-xl transition"
            >
              すべての完了履歴を見る ({completedOrders.length}件)
            </button>
          )}
        </section>
      </main>
      ) : (
        <main className="max-w-[900px] mx-auto px-3 sm:px-6 py-4 sm:py-6 flex-1 w-full">
          <section className="bg-white rounded-3xl p-4 sm:p-6 border border-neutral-200/80 shadow-sm">
            <div className="flex justify-between items-center pb-4 mb-4 border-b border-neutral-100">
              <div>
                <h2 className="font-bold text-base text-neutral-900">受け渡し完了履歴</h2>
                <p className="text-xs text-neutral-400 mt-1">完了済みの注文をすべて表示しています</p>
              </div>
              <span className="text-xs text-neutral-500 font-bold">{completedOrders.length}件</span>
            </div>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {completedOrders.length === 0 ? (
                <p className="text-xs text-neutral-400 text-center py-20">完了済みの履歴はありません</p>
              ) : (
                [...completedOrders].reverse().map((order) => (
                  <div key={order.id} className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100 flex justify-between items-center gap-4">
                    <div className="min-w-0">
                      <span className="font-extrabold text-lg text-neutral-800 block">No. {order.orderNumber}</span>
                      <span className="text-xs text-neutral-500 block truncate">{order.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}</span>
                      <span className="text-[10px] text-neutral-400">{order.time}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateStatus(order.id, 'preparing')}
                      className="shrink-0 text-xs text-neutral-600 hover:text-neutral-900 underline font-bold"
                    >
                      呼び出し中に戻す
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}