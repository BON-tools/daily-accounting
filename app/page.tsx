"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// 定義鑽取深度與模式
type ViewMode = 'HISTORY' | 'TRASH';
type DrillLevel = 'YEAR_LIST' | 'MONTH_LIST' | 'DAY_DETAILS';

export default function CompleteAccountingApp() {
  // 記帳狀態
  const [amount, setAmount] = useState("0");
  const [viewMode, setViewMode] = useState<ViewMode>('HISTORY');
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('YEAR_LIST');
  
  // 數據狀態
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [displayTotal, setDisplayTotal] = useState(0);
  const [listData, setListData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const currentYear = new Date().getFullYear();

  // 1. 核心數據抓取與分析 (Drill-down 邏輯)
  const refreshData = async () => {
    setLoading(true);
    // 抓取所有資料（依據刪除狀態過濾）
    const { data: rawData, error } = await supabase
      .from('sales_records')
      .select('*')
      .eq('is_deleted', viewMode === 'TRASH');

    if (!error && rawData) {
      if (viewMode === 'TRASH') {
        setListData(rawData);
        setDisplayTotal(rawData.reduce((s, i) => s + Number(i.amount), 0));
      } 
      else if (drillLevel === 'YEAR_LIST') {
        const monthly = Array.from({ length: 12 }, (_, i) => {
          const total = rawData
            .filter(item => new Date(item.created_at).getMonth() === i && new Date(item.created_at).getFullYear() === currentYear)
            .reduce((sum, item) => sum + Number(item.amount), 0);
          return { label: `${i + 1}月`, monthIndex: i, total };
        }).filter(m => m.total > 0);
        setListData(monthly);
        setDisplayTotal(monthly.reduce((s, m) => s + m.total, 0));
      } 
      else if (drillLevel === 'MONTH_LIST' && selectedMonth !== null) {
        const monthItems = rawData.filter(item => new Date(item.created_at).getMonth() === selectedMonth);
        const dailyMap: Record<string, number> = {};
        monthItems.forEach(item => {
          const d = new Date(item.created_at).toLocaleDateString('zh-TW');
          dailyMap[d] = (dailyMap[d] || 0) + Number(item.amount);
        });
        const summary = Object.entries(dailyMap).map(([date, total]) => ({ label: date, total, dateKey: date }));
        setListData(summary);
        setDisplayTotal(summary.reduce((s, d) => s + d.total, 0));
      }
      else if (drillLevel === 'DAY_DETAILS' && selectedDay) {
        const details = rawData.filter(item => new Date(item.created_at).toLocaleDateString('zh-TW') === selectedDay);
        setListData(details);
        setDisplayTotal(details.reduce((s, i) => s + Number(i.amount), 0));
      }
    }
    setLoading(false);
  };

  useEffect(() => { refreshData(); }, [viewMode, drillLevel, selectedMonth, selectedDay]);

  // 2. 交互邏輯：記帳、刪除、鑽取
  const handleInput = (val: string) => {
    if (val === "C") setAmount("0");
    else setAmount(prev => (prev === "0" ? val : prev + val));
  };

  const submitData = async () => {
    const numericAmount = parseFloat(amount);
    if (numericAmount <= 0) return;
    const { error } = await supabase.from('sales_records').insert([{ 
      amount: numericAmount, 
      product_name: '一般商品', 
      is_deleted: false 
    }]);
    if (!error) {
      setAmount("0");
      refreshData();
    }
  };

  const toggleDelete = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from('sales_records').update({ is_deleted: !currentStatus }).eq('id', id);
    if (!error) refreshData();
  };

  const handleItemClick = (item: any) => {
    if (viewMode === 'TRASH') return;
    if (drillLevel === 'YEAR_LIST') {
      setSelectedMonth(item.monthIndex);
      setDrillLevel('MONTH_LIST');
    } else if (drillLevel === 'MONTH_LIST') {
      setSelectedDay(item.dateKey);
      setDrillLevel('DAY_DETAILS');
    }
  };

  const goBack = () => {
    if (drillLevel === 'DAY_DETAILS') setDrillLevel('MONTH_LIST');
    else if (drillLevel === 'MONTH_LIST') setDrillLevel('YEAR_LIST');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-4 font-sans text-slate-900 pb-10">
      <div className="w-full max-w-md">
        
        {/* 第一層：模式切換 (歷史 vs 回收站) */}
        <div className="flex bg-white rounded-xl p-1 mb-4 shadow-sm border border-slate-200">
          <button onClick={() => { setViewMode('HISTORY'); setDrillLevel('YEAR_LIST'); }} 
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'HISTORY' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>
            歷史帳本系統
          </button>
          <button onClick={() => setViewMode('TRASH')} 
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'TRASH' ? 'bg-red-500 text-white' : 'text-slate-400'}`}>
            回收站 (已刪除)
          </button>
        </div>

        {/* 第二層：數據看板 */}
        <div className="bg-white rounded-2xl p-6 mb-4 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-1">
            <p className="text-slate-400 text-xs font-bold">
              {viewMode === 'TRASH' ? '回收站總額' : 
               drillLevel === 'YEAR_LIST' ? `${currentYear}年度總額` : 
               drillLevel === 'MONTH_LIST' ? `${selectedMonth! + 1}月日結統計` : `${selectedDay} 交易細項`}
            </p>
            {viewMode === 'HISTORY' && drillLevel !== 'YEAR_LIST' && (
              <button onClick={goBack} className="text-blue-600 text-xs font-bold">← 返回上層</button>
            )}
          </div>
          <span className="text-4xl font-black">${displayTotal.toLocaleString()}</span>
        </div>

        {/* 第三層：記帳計算機 (僅在歷史模式的初始層級顯示) */}
        {viewMode === 'HISTORY' && drillLevel === 'YEAR_LIST' && (
          <div className="bg-slate-900 rounded-3xl p-6 mb-6 shadow-2xl">
            <h2 className="text-5xl font-mono font-bold text-green-400 text-right mb-4">${amount}</h2>
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0].map((num) => (
                <button key={num} onClick={() => handleInput(num.toString())} 
                  className={`h-14 text-xl font-bold rounded-2xl ${num === "C" ? "bg-red-500/10 text-red-500" : "bg-slate-800 text-white active:bg-slate-700"}`}>
                  {num}
                </button>
              ))}
              <button onClick={submitData} className="h-14 bg-blue-600 text-white rounded-2xl text-xl font-bold active:bg-blue-500">送出</button>
            </div>
          </div>
        )}

        {/* 第四層：動態歷史清單 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
            <span className="font-bold text-slate-500 text-sm">
              {viewMode === 'TRASH' ? '已刪除的紀錄' : 
               drillLevel === 'YEAR_LIST' ? '點擊月份展開' : 
               drillLevel === 'MONTH_LIST' ? '點擊日期展開' : '單筆交易明細'}
            </span>
            <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded-full text-slate-500">Count: {listData.length}</span>
          </div>
          
          <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-50">
            {loading ? <div className="p-10 text-center text-slate-400">Loading...</div> : 
             listData.map((item, i) => (
              <div key={i} onClick={() => handleItemClick(item)} 
                className={`p-4 flex justify-between items-center hover:bg-slate-50 ${viewMode !== 'TRASH' && drillLevel !== 'DAY_DETAILS' ? 'cursor-pointer' : ''}`}>
                <div>
                  <p className="font-bold text-slate-700">
                    {item.label || `$${Number(item.amount).toLocaleString()}`}
                  </p>
                  {item.created_at && (
                    <p className="text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString('zh-TW')}</p>
                  )}
                </div>
                <div className="flex items-center">
                  <span className={`${viewMode === 'TRASH' ? 'text-red-400' : 'text-blue-600'} font-mono font-bold`}>
                    ${(item.total || item.amount).toLocaleString()}
                  </span>
                  
                  {/* 功能按鈕：只有在最深層或回收站才顯示 */}
                  {(drillLevel === 'DAY_DETAILS' || viewMode === 'TRASH') && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleDelete(item.id, item.is_deleted); }}
                      className={`ml-4 text-[10px] px-3 py-1 rounded-full border ${viewMode === 'TRASH' ? 'border-green-200 text-green-600' : 'border-red-100 text-red-400'}`}
                    >
                      {viewMode === 'TRASH' ? '還原' : '刪除'}
                    </button>
                  )}
                  {viewMode === 'HISTORY' && drillLevel !== 'DAY_DETAILS' && (
                    <span className="ml-2 text-slate-300">›</span>
                  )}
                </div>
              </div>
            ))}
            {listData.length === 0 && !loading && (
              <div className="p-10 text-center text-slate-300 text-sm">尚無數據</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}