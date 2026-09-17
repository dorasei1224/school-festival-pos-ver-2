'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, Suspense } from 'react';
import Link from 'next/link';

interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
}

interface ReceiptData {
  no: number;
  date: string;
  staff: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  received: number;
  change: number;
}

function ReceiptContent() {
  const searchParams = useSearchParams();

  // 短縮URLパラメータのパース
  const receipt = useMemo<ReceiptData | null>(() => {
    const no = searchParams.get('n');
    if (!no) return null;

    const itemsRaw = searchParams.get('i') || '';
    const items: ReceiptItem[] = itemsRaw ? itemsRaw.split(',').map((str) => {
      const [name, qty, price] = str.split('*');
      return {
        name: name || '商品',
        qty: Number(qty) || 1,
        price: Number(price) || 0,
      };
    }) : [];

    return {
      no: Number(no),
      total: Number(searchParams.get('t') || 0),
      received: Number(searchParams.get('r') || 0),
      change: Number(searchParams.get('c') || 0),
      subtotal: Number(searchParams.get('s') || 0),
      discount: Number(searchParams.get('d') || 0),
      date: searchParams.get('dt') || '',
      staff: searchParams.get('st') || 'スタッフ',
      items,
    };
  }, [searchParams]);

  // レシート共有機能
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `文化祭模擬店 電子レシート No.${receipt?.no}`,
          text: `文化祭模擬店でのご購入ありがとうございました！ (合計: ¥${receipt?.total.toLocaleString()})`,
          url: window.location.href,
        });
      } catch (err) {
        console.log('Share canceled', err);
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      alert('レシートのURLをコピーしました！');
    }
  };

  if (!receipt) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm text-center max-w-sm w-full">
          <p className="text-sm text-neutral-500 font-bold mb-4">レシート情報が見つからないか、URLが正しくありません。</p>
          <Link href="/" className="text-xs bg-neutral-900 text-white px-4 py-2 rounded-xl font-bold inline-block">
            レジ画面へ戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 py-8 px-4 flex flex-col justify-center items-center antialiased">
      {/* 印刷・PDF表示時の印刷用CSS設定 */}
      <style jsx global>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-area {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            max-width: 100% !important;
          }
        }
      `}</style>

      <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-xl border border-neutral-200/80 font-sans print-area">
        {/* ヘッダー */}
        <div className="text-center pb-4 border-b border-dashed border-neutral-300">
          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full no-print">
            電子レシート
          </span>
          <h1 className="text-xl font-extrabold text-neutral-900 mt-2">文化祭模擬店</h1>
          <p className="text-xs text-neutral-400 mt-1">ご利用ありがとうございます！</p>
        </div>

        {/* 注文情報 */}
        <div className="py-3 border-b border-neutral-100 flex justify-between text-xs text-neutral-500 font-medium">
          <span>注文番号: <strong className="text-neutral-900 font-bold">No.{receipt.no}</strong></span>
          <span>{receipt.date}</span>
        </div>

        {/* 購入商品リスト */}
        <div className="py-4 space-y-3 border-b border-neutral-100">
          {receipt.items.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center text-sm">
              <div>
                <p className="font-bold text-neutral-800">{item.name}</p>
                <p className="text-xs text-neutral-400">¥{item.price.toLocaleString()} × {item.qty}</p>
              </div>
              <span className="font-extrabold text-neutral-900">
                ¥{(item.price * item.qty).toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        {/* 金額計算 */}
        <div className="py-4 space-y-1.5 text-xs text-neutral-600 border-b border-neutral-100">
          <div className="flex justify-between">
            <span>小計</span>
            <span>¥{receipt.subtotal.toLocaleString()}</span>
          </div>
          {receipt.discount > 0 && (
            <div className="flex justify-between text-rose-600 font-bold">
              <span>割引</span>
              <span>-¥{receipt.discount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-base font-bold text-neutral-900 pt-2">
            <span>合計（税込）</span>
            <span className="text-xl font-black">¥{receipt.total.toLocaleString()}</span>
          </div>
        </div>

        {/* お預かり・お釣り */}
        <div className="py-3 text-xs text-neutral-500 space-y-1 border-b border-dashed border-neutral-300">
          <div className="flex justify-between">
            <span>お預かり</span>
            <span>¥{receipt.received.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-bold text-neutral-800">
            <span>お釣り</span>
            <span>¥{receipt.change.toLocaleString()}</span>
          </div>
        </div>

        {/* フッター */}
        <div className="pt-4 text-center">
          <p className="text-[11px] text-neutral-400">担当: {receipt.staff}</p>
        </div>

        {/* 保存・アクションボタン（印刷時は非表示） */}
        <div className="mt-6 pt-4 border-t border-neutral-100 space-y-2 no-print">
          <button
            onClick={() => {
              const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
                || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

              if (isIOS) {
                const printWindow = window.open('', '_blank', 'noopener,noreferrer');
                if (printWindow) {
                  printWindow.document.write(`<!doctype html><html><head><title>レシート</title><meta charset="utf-8" /><style>body{font-family:sans-serif;margin:24px;color:#111827}h1{font-size:24px;margin-bottom:8px}p{margin:8px 0}@media print{body{margin:0}}</style></head><body>${document.documentElement.outerHTML}</body></html>`);
                  printWindow.document.close();
                  printWindow.focus();
                  setTimeout(() => printWindow.print(), 300);
                  return;
                }
              }

              window.print();
            }}
            className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-2xl transition flex items-center justify-center gap-2 shadow-sm"
          >
            <span></span> レシートを保存する (PDF / 印刷)
          </button>
          
          <button
            onClick={handleShare}
            className="w-full py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold rounded-2xl transition flex items-center justify-center gap-2"
          >
            <span></span> レシートを共有・送信する
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReceiptPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-neutral-400">読み込み中...</div>}>
      <ReceiptContent />
    </Suspense>
  );
}