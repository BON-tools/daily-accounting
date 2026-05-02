"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type ViewMode = 'HISTORY' | 'TRASH';
type DrillLevel = 'YEAR_LIST' | 'MONTH_LIST' | 'DAY_DETAILS';

export default function AdvancedSourceAccounting() {
  const [amount, setAmount] = useState("0");
  const [source, setSource] = useState("百貨");
  const [customSource, setCustomSource] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  
  const [viewMode, setViewMode] = useState<ViewMode>('HISTORY');
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('YEAR_LIST');
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  
  const [displayTotal, setDisplayTotal] = useState(0);
  const [listData, setListData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const sources = ["百貨", "網路", "市集", "蝦皮"];
  const currentYear = new Date().getFullYear();

  const refreshData = async () => {
    setLoading(true);
    const { data: rawData, error } = await supabase
      .from('sales_records')
      .select('*')
      .eq('is_deleted', viewMode === 'TRASH');

    if (!error && rawData) {
      // 處理統計邏輯：計算每個分類的總額
      const getSourceSummary = (filteredData: any[]) => {
        const summary: Record<string, number> = {};
        filteredData.forEach(item => {
          summary[item.source] = (summary[item.source] || 0) + Number(item.amount);
        });
        return Object.entries(summary)
          .map(([name, total]) => ({ name, total }))
          .filter(s => s.total > 0); // 隱藏 0 元項目
      };

      if (viewMode === 'TRASH') {
        setListData(rawData);
        setDisplayTotal(rawData.reduce((s, i) => s + Number(i.amount), 0));
      } 
      else if (drillLevel === 'YEAR_LIST') {
        const monthly = Array.from({ length: 12 }, (_, i) => {
          const mData = rawData.filter(item => new Date(item.created_at).getMonth() === i && new Date(item.created_at).getFullYear() === currentYear);
          return { label: `${i + 1}月`, monthIndex: i, total: mData.reduce((s, item) => s + Number(item.amount), 0), sourceSummary: getSourceSummary(mData) };
        }).filter(m => m.total > 0);
        setListData(monthly);
        setDisplayTotal(monthly.reduce((s, m) => s + m.total, 0));
      } 
      else if (drillLevel === 'MONTH_LIST' && selectedMonth !== null) {
        const monthItems = rawData.filter(item => new Date(item.created_at).getMonth() === selectedMonth);
        const dailyMap: Record<string, { total: number, data: any[] }> = {};
        monthItems.forEach(item => {
          const d = new Date(item.created_at).toLocaleDateString('zh-TW');
          if (!dailyMap[d]) dailyMap[d] = { total: 0, data: [] };
          dailyMap[d].total += Number(item.amount);
          dailyMap[d].data.push(item);
        });
        const summary = Object.entries(dailyMap).map(([date, obj]) => ({ label: date, total: obj.total, dateKey: date, sourceSummary: getSourceSummary(obj.data) }));
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

  const submitData = async () => {
    const finalSource = isCustom ? customSource : source;
    const numericAmount = parseFloat(amount);
    if (numericAmount <= 0 || !finalSource) return;
    const { error } = await supabase.from('sales_records').insert([{ 
      amount: numericAmount, 
      source: finalSource,
      is_deleted: false 
    }]);
    if (!error) { setAmount("0"); setCustomSource(""); refreshData(); }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-4 font-sans text-slate-900 pb-20">
      <div className="w-full max-w-md">
        
        {/* 模式切換 */}
        <div className="flex bg-white rounded-xl p-1 mb-4 shadow-sm border">
          <button onClick={() => { setViewMode('HISTORY'); setDrillLevel('YEAR_LIST'); }} className={`flex-1 py-2 text-xs font-bold rounded-lg ${viewMode === 'HISTORY' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>歷史系統</button>
          <button onClick={() => setViewMode('TRASH')} className={`flex-1 py-2 text-xs font-bold rounded-lg ${viewMode === 'TRASH' ? 'bg-red-500 text-white' : 'text-slate-400'}`}>回收站</button>
        </div>

        {/* 記帳區域 */}
        {viewMode === 'HISTORY' && drillLevel === 'YEAR_LIST' && (
          <div className="bg-slate-900 rounded-3xl p-6 mb-6 shadow-2xl">
            <h2 className="text-5xl font-mono font-bold text-green-400 text-right mb-4">${amount}</h2>
            
            {/* 來源選擇器 */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {sources.map(s => (
                <button key={s} onClick={() => {setSource(s); setIsCustom(false);}} className={`py-2 rounded-lg text-xs font-bold ${!isCustom && source === s ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'}`}>{s}</button>
              ))}
              <button onClick={() => setIsCustom(true)} className={`py-2 rounded-lg text-xs font-bold ${isCustom ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400'}`}>開放式輸入</button>
            </div>
            
            {isCustom && (
              <input type="text" value={customSource} onChange={(e) => setCustomSource(e.target.value)} placeholder="輸入來源名稱..." className="w-full mb-4 p-2 rounded-lg bg-slate-800 text-white border border-slate-700 text-sm" />
            )}

            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0].map((num) => (
                <button key={num} onClick={() => num === "C" ? setAmount("0") : setAmount(prev => prev === "0" ? num.toString() : prev + num)} className="h-12 bg-slate-800 text-white rounded-xl font-bold">{num}</button>
              ))}
              <button onClick={submitData} className="h-12 bg-blue-600 text-white rounded-xl font-bold">送出</button>
            </div>
          </div>
        )}

        {/* 顯示列表 */}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
            <span className="font-bold text-slate-500 text-sm">業績分類統計</span>
            {drillLevel !== 'YEAR_LIST' && <button onClick={() => drillLevel === 'DAY_DETAILS' ? setDrillLevel('MONTH_LIST') : setDrillLevel('YEAR_LIST')} className="text-blue-600 text-xs font-bold">← 返回</button>}
          </div>
          <div className="divide-y">
            {listData.map((item, i) => (
              <div key={i} onClick={() => drillLevel !== 'DAY_DETAILS' && viewMode !== 'TRASH' && (drillLevel === 'YEAR_LIST' ? (setSelectedMonth(item.monthIndex), setDrillLevel('MONTH_LIST')) : (setSelectedDay(item.dateKey), setDrillLevel('DAY_DETAILS')))} className="p-4 hover:bg-slate-50 cursor-pointer">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="font-black text-slate-700 text-lg">{item.label || `$${item.amount}`}</span>
                  <span className="text-blue-600 font-mono font-bold">${(item.total || item.amount).toLocaleString()}</span>
                </div>
                {/* 顯示該層級的所有來源總額 */}
                {item.sourceSummary && (
                  <div className="flex flex-wrap gap-2">
                    {item.sourceSummary.map((s: any) => (
                      <span key={s.name} className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md border">
                        {s.name}: <span className="text-slate-800 font-bold">${s.total.toLocaleString()}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}