"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type ViewMode = 'daily' | 'monthly' | 'yearly' | 'trash'; // 新增 trash 模式

export default function DailyAccounting() {
  const [amount, setAmount] = useState("0");
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [displayTotal, setDisplayTotal] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const now = new Date();
    let query = supabase.from('sales_records').select('*');

    if (viewMode === 'trash') {
      // 顯示已刪除的資料
      query = query.eq('is_deleted', true);
    } else {
      // 顯示正常的資料
      query = query.eq('is_deleted', false);
      let startDate = new Date();
      if (viewMode === 'daily') startDate.setHours(0, 0, 0, 0);
      else if (viewMode === 'monthly') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      else if (viewMode === 'yearly') startDate = new Date(now.getFullYear(), 0, 1);
      query = query.gte('created_at', startDate.toISOString());
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (!error && data) {
      const total = data.reduce((sum, item) => sum + Number(item.amount), 0);
      setDisplayTotal(total);
      setHistory(data);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [viewMode]);

  const submitData = async () => {
    const numericAmount = parseFloat(amount);
    if (numericAmount <= 0) return;
    const { error } = await supabase.from('sales_records').insert([{ amount: numericAmount, product_name: '一般商品', is_deleted: false }]);
    if (!error) { setAmount("0"); fetchData(); }
  };

  // 刪除/還原功能
  const toggleDelete = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('sales_records')
      .update({ is_deleted: !currentStatus })
      .eq('id', id);
    
    if (!error) fetchData();
    else alert("操作失敗");
  };

  const handleInput = (val: string) => {
    if (val === "C") setAmount("0");
    else setAmount(prev => (prev === "0" ? val : prev + val));
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-4 font-sans pb-20">
      <div className="w-full max-w-md mt-4">
        
        {/* 視角切換器 */}
        <div className="flex bg-white rounded-xl p-1 mb-4 shadow-sm border border-slate-200">
          {(['daily', 'monthly', 'yearly', 'trash'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                viewMode === mode 
                ? (mode === 'trash' ? 'bg-red-500 text-white' : 'bg-blue-600 text-white') 
                : 'text-slate-400'
              }`}
            >
              {mode === 'daily' ? '每日' : mode === 'monthly' ? '每月' : mode === 'yearly' ? '每年' : '回收站'}
            </button>
          ))}
        </div>

        {/* 看板 */}
        <div className={`${viewMode === 'trash' ? 'bg-red-50' : 'bg-white'} rounded-2xl p-6 mb-4 shadow-sm border border-slate-100 flex justify-between items-center`}>
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase">{viewMode} Total</p>
            <span className={`text-3xl font-black ${viewMode === 'trash' ? 'text-red-600' : 'text-slate-800'}`}>${displayTotal.toLocaleString()}</span>
          </div>
          <div className="text-2xl">{viewMode === 'trash' ? '🗑️' : '📊'}</div>
        </div>

        {/* 鍵盤區 (回收站模式下隱藏) */}
        {viewMode !== 'trash' && (
          <div className="bg-slate-900 rounded-3xl p-6 mb-4 shadow-2xl transition-all">
            <h2 className="text-5xl font-mono font-bold text-green-400 text-right">${amount}</h2>
            <div className="grid grid-cols-3 gap-3 mt-6">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0].map((num) => (
                <button key={num} onClick={() => handleInput(num.toString())} className={`h-12 text-xl font-bold rounded-xl ${num === "C" ? "bg-red-500/10 text-red-500" : "bg-slate-800 text-white"}`}>{num}</button>
              ))}
              <button onClick={submitData} className="h-12 bg-blue-600 text-white rounded-xl text-xl font-bold">送出</button>
            </div>
          </div>
        )}

        {/* 歷史紀錄明細 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-slate-800">
          <div className="p-4 bg-slate-50 border-b font-bold flex justify-between">
            <span>{viewMode === 'trash' ? '已刪除的交易' : '歷史紀錄'}</span>
            <span className="text-xs">Count: {history.length}</span>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {history.map((item) => (
              <div key={item.id} className="p-4 flex justify-between items-center hover:bg-slate-50">
                <div>
                  <p className={`text-sm font-bold ${viewMode === 'trash' ? 'line-through text-slate-400' : 'text-slate-700'}`}>${Number(item.amount).toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString('zh-TW')}</p>
                </div>
                <button 
                  onClick={() => toggleDelete(item.id, item.is_deleted)}
                  className={`text-xs px-3 py-1 rounded-full border transition-all ${
                    viewMode === 'trash' 
                    ? 'border-green-500 text-green-600 hover:bg-green-50' 
                    : 'border-red-100 text-red-400 hover:bg-red-50'
                  }`}
                >
                  {viewMode === 'trash' ? '還原' : '刪除'}
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}