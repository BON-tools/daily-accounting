"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// 定義視角類型
type ViewMode = 'daily' | 'monthly' | 'yearly';

interface AggregatedData {
  period: string;
  total: number;
}

export default function DailyAccounting() {
  const [amount, setAmount] = useState("0");
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [displayTotal, setDisplayTotal] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 核心數據抓取與聚合邏輯
  const fetchData = async () => {
    setLoading(true);
    const now = new Date();
    let startDate = new Date();

    // 根據視角決定時間起點
    if (viewMode === 'daily') startDate.setHours(0, 0, 0, 0);
    else if (viewMode === 'monthly') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (viewMode === 'yearly') startDate = new Date(now.getFullYear(), 0, 1);

    const { data, error } = await supabase
      .from('sales_records')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (!error && data) {
      // 計算該區間總金額
      const total = data.reduce((sum, item) => sum + Number(item.amount), 0);
      setDisplayTotal(total);
      
      // 顯示邏輯：如果是日視角，顯示明細；月/年視角，顯示聚合後的日/月總計
      setHistory(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [viewMode]); // 當切換 每日/每月/每年 時自動刷新數據

  const handleInput = (val: string) => {
    if (val === "C") setAmount("0");
    else setAmount(prev => (prev === "0" ? val : prev + val));
  };

  const submitData = async () => {
    const numericAmount = parseFloat(amount);
    if (numericAmount <= 0) return;

    const { error } = await supabase
      .from('sales_records')
      .insert([{ amount: numericAmount, product_name: '一般商品' }]);

    if (!error) {
      setAmount("0");
      fetchData();
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-4 font-sans pb-20">
      <div className="w-full max-w-md mt-4">
        
        {/* 視角切換器 (PM 視角下的 User Interface 設計) */}
        <div className="flex bg-white rounded-xl p-1 mb-4 shadow-sm border border-slate-200">
          {(['daily', 'monthly', 'yearly'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                viewMode === mode ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {mode === 'daily' ? '每日' : mode === 'monthly' ? '每月' : '每年'}
            </button>
          ))}
        </div>

        {/* 動態看板 */}
        <div className="bg-white rounded-2xl p-6 mb-4 shadow-sm border border-slate-100 flex justify-between items-center">
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-tighter">
              {viewMode === 'daily' ? 'Today Total' : viewMode === 'monthly' ? 'Month Total' : 'Year Total'}
            </p>
            <span className="text-3xl font-black text-slate-800">${displayTotal.toLocaleString()}</span>
          </div>
          <div className="bg-blue-50 p-3 rounded-full">
            <div className="w-6 h-6 text-blue-600 font-bold">📊</div>
          </div>
        </div>

        {/* 數字鍵盤區 (保持一致性) */}
        <div className="bg-slate-900 rounded-3xl p-6 mb-4 shadow-2xl">
          <h2 className="text-5xl font-mono font-bold text-green-400 text-right">${amount}</h2>
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0].map((num) => (
              <button
                key={num}
                onClick={() => handleInput(num.toString())}
                className={`h-14 text-xl font-bold rounded-xl transition-all active:scale-95 ${
                  num === "C" ? "bg-red-500/10 text-red-500" : "bg-slate-800 text-white hover:bg-slate-700"
                }`}
              >
                {num}
              </button>
            ))}
            <button onClick={submitData} className="h-14 bg-blue-600 text-white rounded-xl text-xl font-bold active:bg-blue-700">
              送出
            </button>
          </div>
        </div>

        {/* 歷史紀錄明細 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-600 flex justify-between">
            <span>歷史紀錄</span>
            <span className="text-blue-600 text-xs">Total: {history.length} 筆</span>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
            {history.map((item) => (
              <div key={item.id} className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold text-slate-700">${Number(item.amount).toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400">
                    {new Date(item.created_at).toLocaleString('zh-TW')}
                  </p>
                </div>
                <div className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500 uppercase">
                  Confirmed
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}