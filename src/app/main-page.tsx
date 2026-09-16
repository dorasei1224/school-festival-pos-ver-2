'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useOfflineSync, OrderData } from '@/hooks/useOfflineSync';
import { useProducts } from '@/hooks/useProducts';
import StaffLoginPage from './login-page';
import { getCurrentStaff, getStaffById, setCurrentStaff, StaffAccount } from '@/lib/staff-auth';

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
}

const INITIAL_PRODUCTS: Product[] = [
  { id: '1', name: 'キャラメル', price: 400, category: 'WAFFLE', stock: 25 },
  { id: '2', name: 'ソーダ味', price: 400, category: 'DRINK', stock: 45 },
  { id: '3', name: 'チョコ', price: 400, category: 'WAFFLE', stock: 24 },
  { id: '4', name: 'プレーン', price: 400, category: 'WAFFLE', stock: 30 },
  { id: '5', name: 'メープル', price: 400, category: 'WAFFLE', stock: 11 },
];

interface CartItem {
  product: Product;
  quantity: number;
}

export default function RegisterPage() {
  const { isOnline, pendingOrdersCount, isSyncing, saveOrder, syncPendingOrders } = useOfflineSync();
  const { products: databaseProducts, loading: productsLoading } = useProducts();

  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [selectedCategory, setSelectedCategory] = useState<string>('すべて');
  const [currentStaff, setCurrentStaffState] = useState<StaffAccount | null>(null);
  const [authReady, setAuthReady] = useState(false);
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<'cart' | 'payment' | 'completed'>('cart');
  const [staffName, setStaffName] = useState<string>(() => getCurrentStaff()?.display_name ?? 'スタッフA');
  
  const [useCoupon, setUseCoupon] = useState<boolean>(false);
  const [receivedAmount, setReceivedAmount] = useState<number | null>(null);
  const [orderNumber, setOrderNumber] = useState<number>(8);

  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [customerName, setCustomerName] = useState<string>('上様');
  const [proviso, setProviso] = useState<string>('お品代として');
  const [completedAt, setCompletedAt] = useState<string>('');

  useEffect(() => {
    void (async () => {
      const stored = getCurrentStaff();
      const validStaff = stored ? await getStaffById(stored.id) : null;
      if (validStaff) {
        setCurrentStaffState(validStaff);
        setStaffName(validStaff.display_name);
        setCurrentStaff(validStaff);
      } else {
        setCurrentStaff(null);
      }
      setAuthReady(true);
    })();
  }, []);

  useEffect(() => {
    if (productsLoading) return;

    if (databaseProducts.length > 0) {
      void Promise.resolve().then(() => {
        setProducts(
          databaseProducts.map((product) => ({
            id: product.id,
            name: product.name,
            price: product.current_price,
            category: product.category,
            stock: product.stock,
          }))
        );
      });
    }
  }, [databaseProducts, productsLoading]);

  const categories = ['すべて', 'ワッフル', 'ドリンク'];

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'すべて') return products;
    if (selectedCategory === 'ワッフル') return products.filter((p) => p.category.toLowerCase() === 'waffle');
    if (selectedCategory === 'ドリンク') return products.filter((p) => p.category.toLowerCase() === 'drink');
    return products;
  }, [products, selectedCategory]);

  const totalItemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0), [cart]);
  const bundleDiscount = useMemo(() => (totalItemCount >= 2 ? (totalItemCount - 1) * 100 : 0), [totalItemCount]);
  const couponDiscount = useMemo(() => (useCoupon && cart.length > 0 ? 100 : 0), [useCoupon, cart.length]);
  const finalTotal = useMemo(() => Math.max(0, subtotal - bundleDiscount - couponDiscount), [subtotal, bundleDiscount, couponDiscount]);
  const changeAmount = useMemo(() => (receivedAmount === null ? 0 : Math.max(0, receivedAmount - finalTotal)), [receivedAmount, finalTotal]);

  // ★軽量化された超シンプルな電子レシートQRコードURLの生成
  const qrCodeUrl = useMemo(() => {
    if (!completedAt) return '';

    // 商品データを "商品名*数量*単価" の超短縮形式で圧縮
    const itemsStr = cart.map((c) => `${c.product.name}*${c.quantity}*${c.product.price}`).join(',');

    // URLパラメータを1文字キーに短縮して軽量化
    const params = new URLSearchParams({
      n: orderNumber.toString(),
      t: finalTotal.toString(),
      r: (receivedAmount || 0).toString(),
      c: changeAmount.toString(),
      s: subtotal.toString(),
      d: (bundleDiscount + couponDiscount).toString(),
      dt: completedAt,
      st: staffName,
      i: itemsStr,
    });

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const receiptPageUrl = `${origin}/receipt?${params.toString()}`;

    // ecc=L (誤り訂正レベル最小) を追加してマス目を限界まで大きく・粗く設定
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&ecc=L&data=${encodeURIComponent(receiptPageUrl)}`;
  }, [orderNumber, completedAt, staffName, cart, subtotal, bundleDiscount, couponDiscount, finalTotal, receivedAmount, changeAmount]);

  const addToCart = (product: Product) => {
    if (product.stock <= 0) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map((item) => (item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            if (newQty > product.stock) return item;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const clearCart = () => {
    setCart([]);
    setReceivedAmount(null);
  };

  const handleKeypadInput = (key: string) => {
    if (key === 'BS') {
      setReceivedAmount((prev) => {
        if (prev === null) return null;
        const str = prev.toString();
        if (str.length <= 1) return null;
        return Number(str.slice(0, -1));
      });
      return;
    }

    setReceivedAmount((prev) => {
      const currentStr = prev === null ? '' : prev.toString();
      if (currentStr === '' && (key === '0' || key === '00')) return null;

      const newStr = currentStr + key;
      if (newStr.length > 7) return prev;
      return Number(newStr);
    });
  };

  const handleCompleteOrder = async () => {
    const nowIso = new Date().toISOString();
    const nowFormatted = new Date().toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    setCompletedAt(nowFormatted);

    const newOrder: OrderData = {
      id: `order_${Date.now()}`,
      orderNumber,
      staffName,
      staffId: currentStaff?.id ?? 'unknown-staff',
      items: cart.map((c) => ({
        productId: c.product.id,
        name: c.product.name,
        price: c.product.price,
        quantity: c.quantity,
      })),
      subtotal,
      discount: bundleDiscount + couponDiscount,
      finalTotal,
      receivedAmount: receivedAmount || 0,
      changeAmount,
      createdAt: nowIso,
    };

    const saveResult = await saveOrder(newOrder);
    if (saveResult.synced && saveResult.orderNumber) {
      setOrderNumber(saveResult.orderNumber);
    }

    setProducts((prev) =>
      prev.map((prod) => {
        const itemInCart = cart.find((c) => c.product.id === prod.id);
        if (itemInCart) {
          return { ...prod, stock: Math.max(0, prod.stock - itemInCart.quantity) };
        }
        return prod;
      })
    );

    setStep('completed');
  };

  const handleResetForNext = () => {
    setOrderNumber((prev) => prev + 1);
    setShowReceiptModal(false);
    clearCart();
    setStep('cart');
  };

  const handleStaffLogin = (staff: StaffAccount) => {
    setCurrentStaffState(staff);
    setStaffName(staff.display_name);
    setAuthReady(true);
  };

  if (!authReady || !currentStaff) {
    return <StaffLoginPage onLogin={handleStaffLogin} />;
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-neutral-800 font-sans flex flex-col antialiased">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-20 shadow-sm print:hidden">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight text-neutral-900">文化祭POS</h1>

            {isOnline ? (
              <span className="bg-emerald-50 text-emerald-600 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                オンライン
              </span>
            ) : (
              <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                オフライン (未同期 {pendingOrdersCount}件)
              </span>
            )}

            {isOnline && pendingOrdersCount > 0 && (
              <button
                onClick={syncPendingOrders}
                disabled={isSyncing}
                className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full transition flex items-center gap-1"
              >
                {isSyncing ? '同期中...' : `未同期 ${pendingOrdersCount}件を送信`}
              </button>
            )}

            <span className="bg-neutral-100 text-neutral-600 text-xs font-semibold px-2 py-0.5 rounded-md border border-neutral-200">
              レジ画面
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1">
              <span className="text-xs text-neutral-400 font-medium">担当:</span>
              <span className="bg-transparent text-xs font-bold text-neutral-800 cursor-default">
                {staffName}
              </span>
              <button
                onClick={() => {
                  setCurrentStaffState(null);
                  setCurrentStaff(null);
                  setAuthReady(false);
                }}
                className="text-[10px] text-neutral-500 hover:text-neutral-800 underline underline-offset-2"
              >
                ログアウト
              </button>
            </div>
            <Link
              href="/counter"
              className="text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium px-3 py-1.5 rounded-lg transition"
            >
              受け渡し画面
            </Link>
            <Link
              href="/admin"
              className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg transition shadow-sm"
            >
              管理画面へ
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start print:hidden">
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="flex gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${
                  selectedCategory === cat
                    ? 'bg-neutral-900 text-white shadow'
                    : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200/60'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {filteredProducts.map((product) => {
              const cartItem = cart.find((c) => c.product.id === product.id);
              const countInCart = cartItem ? cartItem.quantity : 0;
              const isOutOfStock = product.stock <= 0;

              return (
                <button
                  key={product.id}
                  disabled={isOutOfStock}
                  onClick={() => addToCart(product)}
                  className={`relative p-5 rounded-2xl bg-white border border-neutral-200/70 shadow-sm text-left flex flex-col justify-between h-36 transition-all ${
                    isOutOfStock ? 'opacity-40 cursor-not-allowed' : 'hover:border-neutral-400 active:scale-[0.98]'
                  }`}
                >
                  {countInCart > 0 && (
                    <span className="absolute -top-2 -right-2 bg-neutral-900 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md">
                      {countInCart}
                    </span>
                  )}
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[10px] font-bold text-neutral-400 tracking-wider">{product.category}</span>
                    <span className="text-[11px] font-bold text-neutral-400">残 {product.stock}</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-neutral-900 mb-1">{product.name}</h3>
                    <p className="font-extrabold text-sm text-neutral-900">
                      {product.price} <span className="text-xs font-normal text-neutral-500">円</span>
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-neutral-200/80 shadow-sm min-h-[540px] flex flex-col justify-between">
          {step === 'cart' && (
            <div className="flex flex-col justify-between h-full">
              <div>
                <div className="flex justify-between items-center pb-4 mb-4 border-b border-neutral-100">
                  <h2 className="font-bold text-base text-neutral-900">注文内容</h2>
                  <button onClick={clearCart} className="text-xs text-neutral-400 hover:text-neutral-600 font-medium">
                    すべてクリア
                  </button>
                </div>

                <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1">
                  {cart.length === 0 ? (
                    <p className="text-xs text-neutral-400 text-center py-12">商品が選択されていません</p>
                  ) : (
                    cart.map((item) => (
                      <div key={item.product.id} className="flex justify-between items-center">
                        <div>
                          <p className="font-bold text-sm text-neutral-900">{item.product.name}</p>
                          <p className="text-xs text-neutral-400">{item.product.price}円 × {item.quantity}</p>
                        </div>
                        <div className="flex items-center gap-2 bg-neutral-50 rounded-xl p-1 border border-neutral-200/80">
                          <button onClick={() => updateQuantity(item.product.id, -1)} className="w-6 h-6 bg-white rounded-lg border border-neutral-200 text-neutral-600 font-bold text-xs flex items-center justify-center hover:bg-neutral-100">-</button>
                          <span className="w-4 text-center text-xs font-bold">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.product.id, 1)} className="w-6 h-6 bg-white rounded-lg border border-neutral-200 text-neutral-600 font-bold text-xs flex items-center justify-center hover:bg-neutral-100">+</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-6 p-3.5 bg-rose-50/70 rounded-2xl border border-rose-100 flex justify-between items-center">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-4 bg-rose-400/80 rounded-sm flex items-center justify-center text-[9px] text-white font-bold">券</div>
                    <div>
                      <p className="text-xs font-bold text-rose-900">100円引きクーポン</p>
                      <p className="text-[10px] text-rose-500">タップして割引を適用</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setUseCoupon(!useCoupon)}
                    className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${useCoupon ? 'bg-rose-500' : 'bg-neutral-300'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${useCoupon ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-neutral-100 space-y-2">
                <div className="flex justify-between text-xs text-neutral-500">
                  <span>小計 ({totalItemCount}点)</span>
                  <span>{subtotal} 円</span>
                </div>
                {bundleDiscount > 0 && (
                  <div className="flex justify-between text-xs font-bold">
                    <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded text-[11px]">まとめ割</span>
                    <span className="text-emerald-600">-{bundleDiscount} 円</span>
                  </div>
                )}
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-xs font-bold">
                    <span className="bg-rose-50 text-rose-600 px-2 py-0.5 rounded text-[11px]">クーポン割引</span>
                    <span className="text-rose-600">-{couponDiscount} 円</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm font-bold pt-2">
                  <span className="text-neutral-800">合計</span>
                  <span className="text-2xl font-black text-neutral-900">{finalTotal} <span className="text-sm font-bold">円</span></span>
                </div>

                <button
                  disabled={cart.length === 0}
                  onClick={() => setStep('payment')}
                  className="w-full mt-4 py-4 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-200 text-white font-bold text-sm rounded-2xl transition shadow-md"
                >
                  お会計へ進む
                </button>
              </div>
            </div>
          )}

          {step === 'payment' && (
            <div className="flex flex-col justify-between h-full">
              <div>
                <div className="flex justify-between items-center pb-3 mb-3 border-b border-neutral-100">
                  <button onClick={() => setStep('cart')} className="text-xs font-bold text-neutral-600 hover:text-neutral-900">← 注文内容に戻る</button>
                  <span className="text-xs text-neutral-400 font-medium">お支払い手続き</span>
                </div>

                <div className="bg-neutral-900 text-white rounded-2xl p-4 space-y-2 shadow-lg mb-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-neutral-400 font-medium">請求金額</span>
                    <span className="text-2xl font-black">{finalTotal.toLocaleString()} 円</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-neutral-800 pt-2">
                    <span className="text-xs text-neutral-400 font-medium">お預かり</span>
                    <span className="text-lg font-bold text-amber-400">{receivedAmount !== null ? `${receivedAmount.toLocaleString()} 円` : '-- 円'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-neutral-400 font-medium">お釣り</span>
                    <span className="text-lg font-bold text-rose-400">{receivedAmount !== null ? `${changeAmount.toLocaleString()} 円` : '-- 円'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button 
                    onClick={() => setReceivedAmount(finalTotal)} 
                    className="py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs rounded-xl transition"
                  >
                    ぴったり (¥{finalTotal.toLocaleString()})
                  </button>
                  <button 
                    onClick={() => setReceivedAmount(null)} 
                    className="py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 font-bold text-xs rounded-xl transition"
                  >
                    クリア
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '00'].map((key) => (
                    <button
                      key={key}
                      onClick={() => handleKeypadInput(key)}
                      className="py-3 bg-white hover:bg-neutral-100 border border-neutral-200 font-bold text-base rounded-xl text-neutral-800 transition active:scale-[0.97]"
                    >
                      {key}
                    </button>
                  ))}
                  <button
                    onClick={() => handleKeypadInput('BS')}
                    className="py-3 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 font-bold text-xs rounded-xl transition text-neutral-700 flex items-center justify-center"
                  >
                    BS
                  </button>
                </div>
              </div>

              <button
                disabled={receivedAmount === null || receivedAmount < finalTotal}
                onClick={handleCompleteOrder}
                className="w-full mt-4 py-3.5 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-200 text-white font-bold text-sm rounded-2xl transition shadow-md"
              >
                会計を確定する
              </button>
            </div>
          )}

          {step === 'completed' && (
            <div className="flex flex-col justify-between h-full space-y-4">
              <div>
                <div className="mb-2 flex justify-between items-center">
                  <span className="bg-emerald-50 text-emerald-600 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-100">お会計完了</span>
                  {!isOnline && (
                    <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      ※端末内に保存されました
                    </span>
                  )}
                </div>

                <div className="bg-neutral-900 text-white rounded-2xl p-4 text-center shadow-lg mb-3">
                  <p className="text-[10px] text-neutral-400 font-bold">待合・呼び出し番号</p>
                  <p className="text-4xl font-black text-amber-400 my-1 tracking-tight">No. {orderNumber}</p>
                  <p className="text-[10px] text-neutral-400">お釣り: <span className="text-white font-bold">{changeAmount.toLocaleString()}円</span></p>
                </div>

                <div className="bg-neutral-50 rounded-2xl p-3 border border-neutral-200/80 mb-3 text-center">
                  <p className="text-xs font-bold text-neutral-800 mb-0.5">電子レシート (QRコード)</p>
                  <p className="text-[10px] text-neutral-500 mb-2">スマホで読み取るとWeb明細を表示できます</p>
                  <div className="flex justify-center mb-2">
                    {qrCodeUrl && (
                      <img src={qrCodeUrl} alt="簡易レシートQRコード" className="w-32 h-32 border border-neutral-200 rounded-xl p-1 bg-white shadow-sm" />
                    )}
                  </div>
                  
                  <button
                    onClick={() => setShowReceiptModal(true)}
                    className="w-full py-2 bg-white hover:bg-neutral-100 border border-neutral-300 text-neutral-800 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span>🧾</span> 領収書を発行・印刷
                  </button>
                </div>
              </div>

              <button
                onClick={handleResetForNext}
                className="w-full py-3.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-2xl transition shadow-md"
              >
                確認してお釣りを渡した (次のお会計へ)
              </button>
            </div>
          )}
        </div>
      </main>

      {/* 領収書モーダル */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-neutral-200 print:shadow-none print:border-none print:w-full print:max-w-none">
            <div className="flex justify-between items-center pb-3 border-b border-neutral-200 print:hidden">
              <h3 className="font-bold text-base text-neutral-900">領収書の発行</h3>
              <button onClick={() => setShowReceiptModal(false)} className="text-neutral-400 hover:text-neutral-600 text-sm font-bold">✕</button>
            </div>

            <div className="py-3 space-y-3 print:hidden border-b border-neutral-100 mb-4">
              <div>
                <label className="text-[11px] font-bold text-neutral-500 block mb-1">宛名</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg text-xs font-bold text-neutral-800 focus:outline-none focus:border-neutral-900"
                  placeholder="上様"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-500 block mb-1">但し書き</label>
                <input
                  type="text"
                  value={proviso}
                  onChange={(e) => setProviso(e.target.value)}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg text-xs font-bold text-neutral-800 focus:outline-none focus:border-neutral-900"
                  placeholder="お品代として"
                />
              </div>
            </div>

            <div className="p-4 border border-neutral-300 rounded-2xl bg-white font-serif text-neutral-900 space-y-4">
              <div className="text-center border-b border-neutral-300 pb-2">
                <h2 className="text-xl font-bold tracking-widest">領 収 証</h2>
                <p className="text-[10px] text-neutral-500 font-sans mt-1">No. {orderNumber} | {completedAt}</p>
              </div>

              <div className="text-sm font-bold border-b border-neutral-200 pb-1">
                {customerName || '上様'} 殿
              </div>

              <div className="text-center py-2 bg-neutral-50 rounded-lg border border-neutral-200">
                <p className="text-[10px] text-neutral-500 font-sans">金額</p>
                <p className="text-2xl font-black font-sans">¥ {finalTotal.toLocaleString()} -</p>
              </div>

              <p className="text-xs text-neutral-700">
                但し、<span className="underline underline-offset-4">{proviso || 'お品代として'}</span> 上記正に領収いたしました。
              </p>

              <div className="text-right text-[10px] font-sans text-neutral-600 space-y-0.5 pt-2 border-t border-neutral-200">
                <p className="font-bold text-xs text-neutral-900">文化祭模擬店 POS</p>
                <p>担当者: {staffName}</p>
              </div>
            </div>

            <div className="mt-5 flex gap-2 print:hidden">
              <button
                onClick={() => window.print()}
                className="flex-1 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-xl transition shadow"
              >
              印刷する
              </button>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="px-4 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs rounded-xl transition"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}