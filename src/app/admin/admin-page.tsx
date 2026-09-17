'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getCurrentStaff, getStaffById, StaffAccount } from '@/lib/staff-auth';
import { Product } from '@/types/database';

type AdminTab = 'dashboard' | 'orders' | 'history' | 'drawer' | 'inventory';

interface OrderItemWithProduct {
  id: string;
  quantity: number;
  unit_price: number;
  product_id: string;
  product: {
    name: string;
    category: string;
  };
}

interface OrderDetail {
  id: string;
  order_number: number;
  total_amount: number;
  received_amount: number;
  change_amount: number;
  status: 'pending' | 'ready' | 'completed' | 'cancelled';
  created_at: string;
  staff_id?: string;
  staff_name: string;
  order_items: OrderItemWithProduct[];
}

type SupabaseOrderItemRow = Omit<OrderItemWithProduct, 'product'> & {
  product: OrderItemWithProduct['product'] | OrderItemWithProduct['product'][] | null;
};

type SupabaseOrderRow = Omit<OrderDetail, 'order_items'> & {
  order_items: SupabaseOrderItemRow[] | null;
};

// 注文カードコンポーネント
function OrderCard({
  order,
  onStatusChange,
}: {
  order: OrderDetail;
  onStatusChange: (id: string, status: OrderDetail['status']) => void;
}) {
  return (
    <div className="bg-white p-4 rounded-xl border border-neutral-200/80 shadow-sm space-y-3">
      <div className="flex justify-between items-center border-b border-neutral-100 pb-2">
        <div>
          <span className="text-[10px] font-bold text-neutral-400">注文番号</span>
          <p className="text-lg font-extrabold text-neutral-900">#{order.order_number}</p>
        </div>
        <span className="text-xs text-neutral-400">
          {new Date(order.created_at).toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      <div className="space-y-1 text-xs">
        {order.order_items.map((item) => (
          <div key={item.id} className="flex justify-between text-neutral-700">
            <span>{item.product?.name || '商品'}</span>
            <span className="font-bold">×{item.quantity}</span>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-neutral-100 flex justify-between items-center text-xs gap-2">
        <span className="text-neutral-400 truncate">
          担当: {order.staff_name}
          {order.staff_id ? ` / ${order.staff_id.slice(0, 8)}` : ''}
        </span>
        <span className="font-bold text-neutral-900">¥{order.total_amount.toLocaleString()}</span>
      </div>

      <div className="pt-2 flex gap-1">
        {order.status === 'pending' && (
          <button
            onClick={() => onStatusChange(order.id, 'ready')}
            className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition"
          >
            呼び出し中にする
          </button>
        )}
        {order.status === 'ready' && (
          <button
            onClick={() => onStatusChange(order.id, 'completed')}
            className="w-full py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-lg transition"
          >
            受け渡し完了にする
          </button>
        )}
        {order.status === 'completed' && (
          <button
            onClick={() => onStatusChange(order.id, 'ready')}
            className="w-full py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs rounded-lg transition"
          >
            呼び出し中に戻す
          </button>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [currentStaff, setCurrentStaff] = useState<StaffAccount | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [reportStartDate, setReportStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportEndDate, setReportEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportStartHour, setReportStartHour] = useState(8);
  const [reportEndHour, setReportEndHour] = useState(19);
  const [hoveredChartPoint, setHoveredChartPoint] = useState<{
    hour: string;
    sales: number;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  // ドロアー点検用ステート
  const [initialCash, setInitialCash] = useState<number>(10000);
  const [cashCounts, setCashCounts] = useState<{ [key: number]: number }>({
    10000: 0, 5000: 0, 2000: 0, 1000: 0, 500: 0, 100: 0, 50: 0, 10: 0, 5: 0, 1: 0,
  });
  const [inventoryDrafts, setInventoryDrafts] = useState<Record<string, string>>({});

  const isAdminAccess = Boolean(currentStaff && currentStaff.role === 'admin');

  useEffect(() => {
    void (async () => {
      const stored = getCurrentStaff();
      const validStaff = stored ? await getStaffById(stored.id) : null;
      setCurrentStaff(validStaff);
      setAuthReady(true);
    })();
  }, []);

  // データ一括取得関数
  const fetchData = useCallback(async () => {
    try {
      // 1. 商品マスター取得
      const { data: productsData, error: prodError } = await supabase
        .from('products')
        .select('*')
        .order('category', { ascending: true });

      if (prodError) {
        console.error('商品データ取得エラー:', prodError.message);
      } else if (productsData) {
        setProducts(productsData);
      }

      // 2. 注文＆注文詳細取得
      const { data: ordersData, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            id,
            quantity,
            unit_price,
            product_id,
            product:products (
              name,
              category
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (orderError) {
        console.error('注文データ取得エラー:', orderError.message);
      } else if (ordersData) {
        const formattedOrders: OrderDetail[] = ordersData.map((o: SupabaseOrderRow) => ({
          ...o,
          order_items: (o.order_items || []).map((item) => {
            const product = Array.isArray(item.product) ? item.product[0] : item.product;
            return {
              ...item,
              product: product || { name: '商品', category: '' },
            };
          }),
        }));
        setOrders(formattedOrders);
      }
    } catch (error) {
      console.error('予期せぬ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // リアルタイムリスナーの設定（複数テーブル対応）
  useEffect(() => {
    void Promise.resolve().then(() => fetchData());

    const channel = supabase
      .channel('admin-realtime-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('[Realtime] orders変更検知:', payload);
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload) => {
          console.log('[Realtime] products変更検知:', payload);
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        (payload) => {
          console.log('[Realtime] order_items変更検知:', payload);
          fetchData();
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] 接続ステータス:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // 注文ステータス更新
  const updateOrderStatus = async (
    orderId: string,
    newStatus: OrderDetail['status']
  ) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (error) {
      alert(`ステータス更新に失敗しました: ${error.message}`);
      console.error(error);
    } else {
      await fetchData(); // 成功したら即時再取得
    }
  };

  // 注文キャンセル処理（在庫の自動返却含む）
  const handleCancelOrder = async (order: OrderDetail) => {
    if (order.status === 'cancelled') return;
    if (!confirm(`注文番号 #${order.order_number} をキャンセルしますか？\n（在庫は自動的に戻されます）`)) return;

    try {
      // 1. 各商品の在庫を復元
      for (const item of order.order_items) {
        const product = products.find((p) => p.id === item.product_id);
        if (product) {
          const restoredStock = product.stock + item.quantity;
          const { error: stockErr } = await supabase
            .from('products')
            .update({ stock: restoredStock })
            .eq('id', item.product_id);

          if (stockErr) throw stockErr;
        }
      }

      // 2. 注文ステータスを cancelled に更新
      const { error: orderErr } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', order.id);

      if (orderErr) throw orderErr;

      alert(`注文 #${order.order_number} をキャンセルしました。`);
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '不明なエラー';
      alert(`キャンセル処理に失敗しました: ${message}`);
      console.error(err);
    }
  };

  // 在庫数の手動更新
  const updateStock = async (productId: string, delta: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const newStock = Math.max(0, product.stock + delta);
    const { error } = await supabase.from('products').update({ stock: newStock }).eq('id', productId);

    if (error) {
      alert(`在庫数の更新に失敗しました: ${error.message}`);
      console.error(error);
    } else {
      setProducts((currentProducts) => currentProducts.map((item) => (
        item.id === productId ? { ...item, stock: newStock } : item
      )));
      setInventoryDrafts((drafts) => ({ ...drafts, [productId]: String(newStock) }));
    }
  };

  const updateStockValue = async (productId: string, rawValue: string) => {
    const newStock = Math.max(0, Number.parseInt(rawValue, 10) || 0);
    const product = products.find((item) => item.id === productId);
    if (!product || newStock === product.stock) {
      setInventoryDrafts((drafts) => ({ ...drafts, [productId]: String(product?.stock ?? newStock) }));
      return;
    }

    const { error } = await supabase.from('products').update({ stock: newStock }).eq('id', productId);
    if (error) {
      alert(`在庫数の更新に失敗しました: ${error.message}`);
      setInventoryDrafts((drafts) => ({ ...drafts, [productId]: String(product.stock) }));
      return;
    }

    setProducts((currentProducts) => currentProducts.map((item) => (
      item.id === productId ? { ...item, stock: newStock } : item
    )));
    setInventoryDrafts((drafts) => ({ ...drafts, [productId]: String(newStock) }));
  };

  const handlePrintPDF = () => {
    window.print();
  };

  // 集計ロジック
  const validOrders = useMemo(() => {
    const start = new Date(`${reportStartDate}T00:00:00`);
    const end = new Date(`${reportEndDate}T23:59:59.999`);
    return orders.filter((order) => {
      const createdAt = new Date(order.created_at);
      return order.status.toLowerCase() !== 'cancelled' && createdAt >= start && createdAt <= end;
    });
  }, [orders, reportStartDate, reportEndDate]);
  const totalSales = useMemo(() => validOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0), [validOrders]);
  const totalOrdersCount = validOrders.length;
  const averageCustomerSpend = totalOrdersCount > 0 ? Math.round(totalSales / totalOrdersCount) : 0;

  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: reportEndHour - reportStartHour + 1 }, (_, i) => i + reportStartHour);
    const map: { [key: number]: { sales: number; count: number } } = {};
    hours.forEach((h) => (map[h] = { sales: 0, count: 0 }));

    validOrders.forEach((o) => {
      const date = new Date(o.created_at);
      const hour = date.getHours();
      if (map[hour] !== undefined) {
        map[hour].sales += Number(o.total_amount || 0);
        map[hour].count += 1;
      }
    });

    return hours.map((h) => ({
      hour: `${h}:00`,
      sales: map[h].sales,
      count: map[h].count,
    }));
  }, [validOrders, reportStartHour, reportEndHour]);

  const maxHourlySales = useMemo(() => Math.max(...hourlyData.map((d) => d.sales), 1), [hourlyData]);
  const chartMinWidth = Math.max(hourlyData.length * 48, 560);
  const chartWidth = Math.max(hourlyData.length * 64, 720);
  const chartHeight = 240;
  const chartPadding = { top: 20, right: 24, bottom: 36, left: 16 };
  const chartInnerWidth = chartWidth - chartPadding.left - chartPadding.right;
  const chartInnerHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const chartPoints = hourlyData.map((data, index) => {
    const x = chartPadding.left + (hourlyData.length === 1 ? chartInnerWidth / 2 : (index / (hourlyData.length - 1)) * chartInnerWidth);
    const y = chartPadding.top + chartInnerHeight - (data.sales / maxHourlySales) * chartInnerHeight;
    return { ...data, x, y };
  });
  const chartPolyline = chartPoints.map((point) => `${point.x},${point.y}`).join(' ');

  const productSalesMap = useMemo(() => {
    const map: Record<string, { name: string; category: string; quantity: number; total: number }> = {};
    validOrders.forEach((order) => {
      order.order_items.forEach((item) => {
        const name = item.product?.name || '未登録商品';
        const category = item.product?.category || 'その他';
        if (!map[name]) map[name] = { name, category, quantity: 0, total: 0 };
        map[name].quantity += item.quantity;
        map[name].total += item.unit_price * item.quantity;
      });
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [validOrders]);

  const actualCashTotal = useMemo(() => {
    return Object.entries(cashCounts).reduce(
      (sum, [denom, count]) => sum + Number(denom) * count,
      0
    );
  }, [cashCounts]);

  const theoreticalCash = initialCash + totalSales;
  const cashDifference = actualCashTotal - theoreticalCash;

  const filteredOrdersHistory = useMemo(() => {
    if (!searchTerm) return orders;
    return orders.filter(
      (o) =>
        o.order_number.toString().includes(searchTerm) ||
        o.staff_name.includes(searchTerm)
    );
  }, [orders, searchTerm]);

  if (!authReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F4F4F5] text-neutral-500 font-medium text-sm">
        権限を確認中...
      </div>
    );
  }

  if (!isAdminAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F4F5] px-6">
        <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-8 max-w-md w-full text-center">
          <p className="text-[10px] font-bold text-neutral-500 tracking-[0.2em] uppercase">Access denied</p>
          <h1 className="mt-3 text-2xl font-black text-neutral-900">管理者権限が必要です</h1>
          <p className="mt-3 text-sm text-neutral-600">
            管理者アカウントでログインしてから、管理画面を開いてください。
          </p>
          <Link href="/" className="mt-6 inline-block bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition">
            レジ画面へ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F4F4F5] text-neutral-500 font-medium text-sm">
        Supabaseからデータを読み込み中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F4F5] text-neutral-800 antialiased font-sans pb-16">
      <div className="print:hidden">
        {/* ヘッダー */}
        <header className="bg-white border-b border-neutral-200/80 sticky top-0 z-10 shadow-sm">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3.5 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:justify-between sm:items-center">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex flex-col leading-none">
                <span className="text-base sm:text-lg font-black tracking-tight text-neutral-900">
                  つぐポス
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-neutral-400">
                  admin
                </span>
              </div>
              <span className="bg-neutral-100 text-neutral-600 text-xs font-semibold px-2.5 py-0.5 rounded-md border border-neutral-200">
                管理画面
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handlePrintPDF}
                className="bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs px-2.5 sm:px-3.5 py-1.5 rounded-lg transition"
              >
                日計レポート(PDF)を出力
              </button>
              <button
                onClick={fetchData}
                className="text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium px-3 py-1.5 rounded-lg transition"
              >
                手動更新
              </button>
              <Link
                href="/"
                className="bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-medium px-3.5 py-1.5 rounded-lg transition"
              >
                レジ画面へ戻る
              </Link>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-3 sm:px-6 flex gap-1 border-t border-neutral-100 pt-1 overflow-x-auto">
            {[
              { id: 'dashboard', label: '売上・時間帯分析' },
              { id: 'orders', label: '調理・呼び出し管理' },
              { id: 'history', label: '注文履歴・キャンセル' },
              { id: 'drawer', label: 'レジ締め・ドロアー点検' },
              { id: 'inventory', label: '商品・在庫管理' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`px-4 py-2.5 font-bold text-xs border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-neutral-900 text-neutral-900'
                    : 'border-transparent text-neutral-400 hover:text-neutral-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {/* メインビュー */}
        <main className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-3 sm:p-4 border border-neutral-200/80 shadow-sm">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-xs font-bold text-neutral-600">
                    集計開始日
                    <input
                      type="date"
                      value={reportStartDate}
                      onChange={(event) => setReportStartDate(event.target.value)}
                      className="mt-1 block border border-neutral-200 rounded-lg px-2 py-1.5 text-xs font-normal"
                    />
                  </label>
                  <label className="text-xs font-bold text-neutral-600">
                    集計終了日
                    <input
                      type="date"
                      value={reportEndDate}
                      min={reportStartDate}
                      onChange={(event) => setReportEndDate(event.target.value)}
                      className="mt-1 block border border-neutral-200 rounded-lg px-2 py-1.5 text-xs font-normal"
                    />
                  </label>
                  <label className="text-xs font-bold text-neutral-600">
                    開始時刻
                    <select
                      value={reportStartHour}
                      onChange={(event) => setReportStartHour(Math.min(Number(event.target.value), reportEndHour))}
                      className="mt-1 block border border-neutral-200 rounded-lg px-2 py-1.5 text-xs font-normal"
                    >
                      {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{hour}:00</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold text-neutral-600">
                    終了時刻
                    <select
                      value={reportEndHour}
                      onChange={(event) => setReportEndHour(Math.max(Number(event.target.value), reportStartHour))}
                      className="mt-1 block border border-neutral-200 rounded-lg px-2 py-1.5 text-xs font-normal"
                    >
                      {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{hour}:00</option>)}
                    </select>
                  </label>
                  <span className="text-[11px] text-neutral-400 pb-1">表示範囲に合わせてグラフとランキングを再集計します</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-sm">
                  <span className="text-xs font-medium text-neutral-400">総売上額</span>
                  <p className="text-3xl font-extrabold text-neutral-900 mt-1">¥{totalSales.toLocaleString()}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-sm">
                  <span className="text-xs font-medium text-neutral-400">客数（注文件数）</span>
                  <p className="text-3xl font-extrabold text-neutral-900 mt-1">{totalOrdersCount} <span className="text-xs font-normal text-neutral-500">件</span></p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-sm">
                  <span className="text-xs font-medium text-neutral-400">平均客単価</span>
                  <p className="text-3xl font-extrabold text-neutral-900 mt-1">¥{averageCustomerSpend.toLocaleString()}</p>
                </div>
              </div>

              {/* 時間帯グラフ */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 border border-neutral-200/80 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="font-bold text-sm text-neutral-900">時間帯別売上推移</h2>
                    <p className="text-xs text-neutral-400">営業時間中の時間帯ごとの売上傾向</p>
                  </div>
                  <span className="text-xs font-medium text-neutral-500">単位: 円</span>
                </div>
                <div className="pt-4 pb-2 overflow-x-auto">
                  <div style={{ minWidth: `${chartMinWidth}px` }}>
                    <svg
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                      width="100%"
                      height="240"
                      role="img"
                      aria-label="時間帯別売上推移"
                      className="block min-w-full overflow-visible"
                    >
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const y = chartPadding.top + chartInnerHeight * (1 - ratio);
                        return (
                          <line
                            key={ratio}
                            x1={chartPadding.left}
                            x2={chartWidth - chartPadding.right}
                            y1={y}
                            y2={y}
                            stroke="#E5E7EB"
                            strokeWidth="1"
                          />
                        );
                      })}
                      <polyline
                        points={chartPolyline}
                        fill="none"
                        stroke="#111827"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {chartPoints.map((point) => (
                        <g
                          key={point.hour}
                          onMouseEnter={() => setHoveredChartPoint(point)}
                          onMouseLeave={() => setHoveredChartPoint(null)}
                          onClick={() => setHoveredChartPoint(point)}
                          className="cursor-pointer"
                        >
                          <circle cx={point.x} cy={point.y} r="5" fill="#111827" />
                          <circle cx={point.x} cy={point.y} r="14" fill="transparent" />
                          <text x={point.x} y={chartHeight - 10} textAnchor="middle" fontSize="11" fill="#6B7280">
                            {point.hour}
                          </text>
                          <title>{`${point.hour}: ¥${point.sales.toLocaleString()} (${point.count}件)`}</title>
                        </g>
                      ))}
                      {hoveredChartPoint && (
                        <g pointerEvents="none">
                          <rect
                            x={Math.min(Math.max(hoveredChartPoint.x - 70, 4), chartWidth - 144)}
                            y={Math.max(hoveredChartPoint.y - 58, 4)}
                            width="140"
                            height="38"
                            rx="6"
                            fill="#111827"
                          />
                          <text
                            x={Math.min(Math.max(hoveredChartPoint.x, 74), chartWidth - 74)}
                            y={Math.max(hoveredChartPoint.y - 36, 26)}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="700"
                            fill="white"
                          >
                            {`${hoveredChartPoint.hour}  ¥${hoveredChartPoint.sales.toLocaleString()}`}
                          </text>
                          <text
                            x={Math.min(Math.max(hoveredChartPoint.x, 74), chartWidth - 74)}
                            y={Math.max(hoveredChartPoint.y - 21, 41)}
                            textAnchor="middle"
                            fontSize="10"
                            fill="#D1D5DB"
                          >
                            {`${hoveredChartPoint.count}件`}
                          </text>
                        </g>
                      )}
                    </svg>
                    {validOrders.length > 0 && hourlyData.every((data) => data.sales === 0) && (
                      <p className="text-center text-xs text-neutral-400 -mt-8 pb-4">
                        選択した時間帯には売上データがありません
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* ランキング */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 border border-neutral-200/80 shadow-sm space-y-4">
                <h2 className="font-bold text-sm text-neutral-900">商品別販売実績ランキング</h2>
                <div className="divide-y divide-neutral-100">
                  {productSalesMap.length === 0 ? (
                    <p className="text-xs text-neutral-400 py-4 text-center">売上データがありません</p>
                  ) : (
                    productSalesMap.map((item, index) => (
                      <div key={item.name} className="py-3 flex justify-between items-center text-xs">
                        <div className="flex items-center gap-3">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                            index === 0 ? 'bg-neutral-900 text-white' : index === 1 ? 'bg-neutral-600 text-white' : index === 2 ? 'bg-neutral-400 text-white' : 'bg-neutral-100 text-neutral-500'
                          }`}>
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-bold text-neutral-800">{item.name}</p>
                            <p className="text-neutral-400 text-[11px]">{item.quantity} 個販売</p>
                          </div>
                        </div>
                        <p className="font-bold text-sm text-neutral-900">¥{item.total.toLocaleString()}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 各タブのコンテンツ */}
          {activeTab === 'orders' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-neutral-200/60 p-3 rounded-xl border border-neutral-300/50">
                  <h2 className="font-bold text-xs text-neutral-700 uppercase tracking-wider">調理中 / 準備中</h2>
                  <span className="bg-neutral-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {orders.filter((o) => o.status === 'pending').length} 件
                  </span>
                </div>
                <div className="space-y-3">
                  {orders.filter((o) => o.status === 'pending').map((order) => (
                    <OrderCard key={order.id} order={order} onStatusChange={updateOrderStatus} />
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between bg-emerald-50 p-3 rounded-xl border border-emerald-200/60">
                  <h2 className="font-bold text-xs text-emerald-800 uppercase tracking-wider">呼び出し中（お渡し可能）</h2>
                  <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {orders.filter((o) => o.status === 'ready').length} 件
                  </span>
                </div>
                <div className="space-y-3">
                  {orders.filter((o) => o.status === 'ready').map((order) => (
                    <OrderCard key={order.id} order={order} onStatusChange={updateOrderStatus} />
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between bg-neutral-100 p-3 rounded-xl border border-neutral-200">
                  <h2 className="font-bold text-xs text-neutral-500 uppercase tracking-wider">受け渡し完了</h2>
                  <span className="bg-neutral-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {orders.filter((o) => o.status === 'completed').length} 件
                  </span>
                </div>
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                  {orders.filter((o) => o.status === 'completed').map((order) => (
                    <OrderCard key={order.id} order={order} onStatusChange={updateOrderStatus} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="bg-white rounded-2xl p-4 sm:p-6 border border-neutral-200/80 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="font-bold text-sm text-neutral-900">注文履歴一覧</h2>
                  <p className="text-xs text-neutral-400">すべての注文の確認およびキャンセル処理</p>
                </div>
                <input
                  type="text"
                  placeholder="注文番号・担当者名で検索"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border border-neutral-200 rounded-lg px-3 py-1.5 text-xs bg-neutral-50 focus:outline-none focus:border-neutral-900 w-full sm:w-64"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 text-neutral-400 bg-neutral-50/50">
                      <th className="py-2.5 px-3 font-semibold">注文番号</th>
                      <th className="py-2.5 px-3 font-semibold">日時</th>
                      <th className="py-2.5 px-3 font-semibold">購入内容</th>
                      <th className="py-2.5 px-3 font-semibold">金額</th>
                      <th className="py-2.5 px-3 font-semibold">担当</th>
                      <th className="py-2.5 px-3 font-semibold">staff_id</th>
                      <th className="py-2.5 px-3 font-semibold">状態</th>
                      <th className="py-2.5 px-3 font-semibold text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {filteredOrdersHistory.map((order) => {
                      const isCancelled = order.status === 'cancelled';
                      return (
                        <tr key={order.id} className={isCancelled ? 'bg-neutral-50 opacity-60' : ''}>
                          <td className="py-3 px-3 font-bold text-neutral-900">#{order.order_number}</td>
                          <td className="py-3 px-3 text-neutral-500 whitespace-nowrap">
                            {new Date(order.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-3 px-3 text-neutral-800 max-w-xs">
                            {order.order_items.map((i) => `${i.product?.name || '商品'} ×${i.quantity}`).join(', ')}
                          </td>
                          <td className="py-3 px-3 font-bold text-neutral-900">¥{order.total_amount.toLocaleString()}</td>
                          <td className="py-3 px-3 text-neutral-500">{order.staff_name}</td>
                          <td className="py-3 px-3 text-neutral-500 font-mono">{order.staff_id ? order.staff_id.slice(0, 8) : '—'}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isCancelled ? 'bg-rose-100 text-rose-700' : order.status === 'completed' ? 'bg-neutral-100 text-neutral-600' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {isCancelled ? 'キャンセル済' : order.status === 'completed' ? '完了' : order.status === 'ready' ? '呼び出し中' : '準備中'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            {!isCancelled && (
                              <button onClick={() => handleCancelOrder(order)} className="text-rose-600 hover:text-rose-800 font-bold text-[11px] hover:underline">
                                キャンセル
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'drawer' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-neutral-200/80 shadow-sm space-y-6">
                <div>
                  <h2 className="font-bold text-sm text-neutral-900">ドロアー内現金実査</h2>
                  <p className="text-xs text-neutral-400">金庫内の各紙幣・硬貨の枚数を入力してください</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[10000, 5000, 2000, 1000, 500, 100, 50, 10, 5, 1].map((denom) => (
                    <div key={denom} className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-200/60">
                      <label className="text-[10px] font-bold text-neutral-400 block mb-1">
                        {denom.toLocaleString()}円札・硬貨
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={cashCounts[denom] || ''}
                        onChange={(e) =>
                          setCashCounts({
                            ...cashCounts,
                            [denom]: Math.max(0, parseInt(e.target.value) || 0),
                          })
                        }
                        className="w-full text-right font-bold text-sm bg-white border border-neutral-200 rounded-lg p-1 focus:outline-none focus:border-neutral-900"
                      />
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-neutral-100 flex justify-between items-center">
                  <span className="text-xs font-medium text-neutral-500">実査現金合計</span>
                  <span className="text-2xl font-black text-neutral-900">
                    ¥{actualCashTotal.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-neutral-200/80 shadow-sm space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="font-bold text-sm text-neutral-900">日計レポート・差異判定</h2>
                  <button onClick={handlePrintPDF} className="bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition">
                    日計PDF出力
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-neutral-100">
                    <span className="text-neutral-500">釣銭準備金（開始金額）</span>
                    <input
                      type="number"
                      value={initialCash}
                      onChange={(e) => setInitialCash(Number(e.target.value))}
                      className="w-28 text-right font-bold border border-neutral-200 rounded p-1 bg-neutral-50"
                    />
                  </div>

                  <div className="flex justify-between items-center py-1">
                    <span className="text-neutral-500">本日の総現金売上</span>
                    <span className="font-bold text-neutral-800">¥{totalSales.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-t border-b border-neutral-100 font-bold">
                    <span className="text-neutral-700">理論ドロアー残高</span>
                    <span className="text-base text-neutral-900">¥{theoreticalCash.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between items-center py-1">
                    <span className="text-neutral-500">実査ドロアー残高</span>
                    <span className="font-bold text-neutral-800">¥{actualCashTotal.toLocaleString()}</span>
                  </div>
                </div>

                <div
                  className={`p-4 rounded-xl border text-center space-y-1 ${
                    cashDifference === 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : cashDifference > 0
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  <span className="text-xs font-bold block uppercase tracking-wider">現金過不足（差異）</span>
                  <p className="text-3xl font-black">
                    {cashDifference > 0 ? `+¥${cashDifference.toLocaleString()}` : `¥${cashDifference.toLocaleString()}`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'inventory' && (
            <div className="bg-white rounded-2xl p-6 border border-neutral-200/80 shadow-sm space-y-4">
              <h2 className="font-bold text-sm text-neutral-900">商品在庫数の一括調整</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {products.map((product) => (
                  <div key={product.id} className="p-4 rounded-xl border border-neutral-200/80 bg-neutral-50/50 flex justify-between items-center min-w-0">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-neutral-400">{product.category}</span>
                      <h3 className="font-bold text-sm text-neutral-900">{product.name}</h3>
                      <p className="text-xs text-neutral-500">価格: {product.current_price}円</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] font-medium text-neutral-400 block">現在の在庫</span>
                        <input
                          type="number"
                          min="0"
                          aria-label={`${product.name}の在庫数`}
                          value={inventoryDrafts[product.id] ?? String(product.stock)}
                          onChange={(event) => setInventoryDrafts((drafts) => ({ ...drafts, [product.id]: event.target.value }))}
                          onBlur={(event) => void updateStockValue(product.id, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.currentTarget.blur();
                            }
                          }}
                          className={`w-16 text-right text-lg font-black bg-transparent border-b border-neutral-300 focus:outline-none focus:border-neutral-900 ${product.stock <= 5 ? 'text-rose-600' : 'text-neutral-900'}`}
                        />
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => updateStock(product.id, -1)} className="px-2 py-1 bg-white border border-neutral-200 text-neutral-700 font-bold rounded text-xs hover:bg-neutral-100">-1</button>
                        <button onClick={() => updateStock(product.id, 1)} className="px-2 py-1 bg-white border border-neutral-200 text-neutral-700 font-bold rounded text-xs hover:bg-neutral-100">+1</button>
                        <button onClick={() => updateStock(product.id, 5)} className="px-2 py-1 bg-neutral-900 text-white font-bold rounded text-xs hover:bg-neutral-800">+5</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* 印刷用レイアウト */}
      <div className="hidden print:block p-8 bg-white text-black font-sans leading-relaxed text-xs">
        <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-black text-black">文化祭POS 日計報告書（レジ締めシート）</h1>
            <p className="text-xs text-neutral-600 mt-1">出力日時: {new Date().toLocaleString('ja-JP')}</p>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-sm font-bold border-l-4 border-black pl-2 mb-3">1. レジ締め・現金点検報告</h2>
          <table className="w-full border-collapse border border-black text-center text-xs">
            <thead>
              <tr className="bg-neutral-100 border-b border-black font-bold">
                <th className="border-r border-black py-2">釣銭準備金</th>
                <th className="border-r border-black py-2">総売上高 (現金)</th>
                <th className="border-r border-black py-2">理論ドロアー残高</th>
                <th className="border-r border-black py-2">実査ドロアー残高</th>
                <th className="py-2">現金過不足</th>
              </tr>
            </thead>
            <tbody>
              <tr className="font-bold text-sm">
                <td className="border-r border-black py-2.5">¥{initialCash.toLocaleString()}</td>
                <td className="border-r border-black py-2.5">¥{totalSales.toLocaleString()}</td>
                <td className="border-r border-black py-2.5">¥{theoreticalCash.toLocaleString()}</td>
                <td className="border-r border-black py-2.5">¥{actualCashTotal.toLocaleString()}</td>
                <td className="py-2.5">
                  {cashDifference > 0 ? `+¥${cashDifference.toLocaleString()}` : `¥${cashDifference.toLocaleString()}`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="text-sm font-bold border-l-4 border-black pl-2 mb-3">2. 商品別売上実績</h2>
          <table className="w-full border-collapse border border-black text-left text-xs">
            <thead>
              <tr className="bg-neutral-100 border-b border-black font-bold">
                <th className="border-r border-black p-2">商品名</th>
                <th className="border-r border-black p-2">カテゴリー</th>
                <th className="border-r border-black p-2 text-right">販売数</th>
                <th className="p-2 text-right">売上小計</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black">
              {productSalesMap.map((item) => (
                <tr key={item.name}>
                  <td className="border-r border-black p-2 font-bold">{item.name}</td>
                  <td className="border-r border-black p-2">{item.category}</td>
                  <td className="border-r border-black p-2 text-right">{item.quantity} 個</td>
                  <td className="p-2 text-right font-bold">¥{item.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}