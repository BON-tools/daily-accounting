"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function DailyAccounting() {
  const [amount, setAmount] = useState("0");
  const [todayTotal, setTodayTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // 取得今日總額
  const fetchTodayTotal = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('sales_records')
      .select('amount')
      .gte('created_at', today.toISOString());

    if (!error && data) {
      const total = data.reduce((sum, item) => sum + Number(item.amount), 0);
      setTodayTotal(total);
    }
  };

  useEffect(() => {
    fetchTodayTotal();
  }, []);

  const handleInput = (val: string) => {
    if (val === "C") setAmount("0");
    else setAmount(prev => (prev === "0" ? val : prev + val));
  };

  const submitData = async () => {
    const numericAmount = parseFloat(amount);
    if (numericAmount <= 0) return;

    setLoading(true);
    const { error } = await supabase
      .from('sales_records')
      .insert([{ amount: numericAmount, product_name: '一般商品' }]);

    if (!error) {
      setAmount("0");
      await fetchTodayTotal(); // 更新今日總額
      alert("儲存成功！");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 font-sans">
      <div className="w-full max-w-md mt-6">
        {/* 今日業績看板 */}
        <div className="bg-white rounded-2xl p-6 mb-4 shadow-sm border border-slate-100 flex justify-between items-center">
          <span className="text-slate-500 font-medium">今日累計總額</span>
          <span className="text-2xl font-bold text-blue-600">${todayTotal.toLocaleString()}</span>
        </div>

        {/* 輸入螢幕 */}
        <div className="bg-slate-900 rounded-3xl p-8 mb-4 text-right shadow-2xl">
          <p className="text-slate-500 text-xs mb-1 tracking-widest">INPUT AMOUNT</p>
          <h2 className="text-5xl font-mono font-bold text-green-400">${amount}</h2>
        </div>

        {/* 鍵盤 */}
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0].map((num) => (
            <button
              key={num}
              onClick={() => handleInput(num.toString())}
              className={`h-16 text-xl font-semibold rounded-2xl shadow-sm active:scale-95 transition-all
                ${num === "C" ? "bg-red-50 text-red-500" : "bg-white text-slate-700"}`}
            >
              {num}
            </button>
          ))}
          <button
            onClick={submitData}
            disabled={loading}
            className="h-16 bg-blue-600 text-white rounded-2xl text-xl font-bold active:bg-blue-700 disabled:bg-slate-300"
          >
            {loading ? "..." : "送出"}
          </button>
        </div>
      </div>
    </div>
  );
}