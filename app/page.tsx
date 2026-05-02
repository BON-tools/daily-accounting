"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type ViewMode = 'HISTORY' | 'TRASH';
type DrillLevel = 'YEAR_LIST' | 'MONTH_LIST' | 'DAY_DETAILS';

export default function TimeTravelAccountingApp() {
  const [amount, setAmount] = useState("0");
  const [source, setSource] = useState("百貨");
  const [customSource, setCustomSource] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  
  const [viewMode, setViewMode] = useState<ViewMode>('HISTORY');
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('YEAR_LIST');
  
  // 年/月/日 時間維度狀態
  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  
  const [displayTotal, setDisplayTotal] = useState(0);
  const [listData, setListData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const sources = ["百貨", "地攤", "市集", "蝦皮"];

  const refreshData = async () => {
    setLoading(true);
    const { data: rawData, error } = await supabase
      .from('sales_records')
      .select('*')
      .eq('is_deleted', viewMode === 'TRASH');

    if (!error && rawData) {
      // 1. 動態計算所有存在的年份 (提供給下拉選單)
      if (viewMode !== 'TRASH') {
        const yearsSet = new Set(rawData.map(item => new Date(item.created_at).getFullYear()));
        const yearsArray = Array.from(yearsSet).sort((a, b) => b - a); // 降冪排列 (最新年在上)
        if (yearsArray.length === 0) yearsArray.push(new Date().getFullYear());
        setAvailableYears(yearsArray);
        // 如果目前選的年份不在資料庫裡(例如剛刪光)，強制切回最新年
        if (!yearsArray.includes(selectedYear) && yearsArray.length > 0) {
          setSelectedYear(yearsArray[0]);
        }
      }

      const getSourceSummary = (filteredData: any[]) => {
        const summary: Record<string, number> = {};
        filteredData.forEach(item => { summary[item.source] = (summary[item.source] || 0) + Number(item.amount); });
        return Object.entries(summary).map(([name, total]) => ({ name, total })).filter(s => s.total > 0);
      };

      if (viewMode === 'TRASH') {
        setListData(rawData);
        setDisplayTotal(rawData.reduce((s, i) => s + Number(i.amount), 0));
      } 
      else if (drillLevel === 'YEAR_LIST') {
        // 第一層：列出 selectedYear 的 12 個月
        const monthly = Array.from({ length: 12 }, (_, i) => {
          const mData = rawData.filter(item => new Date(item.created_at).getMonth() === i && new Date(item.created_at).getFullYear() === selectedYear);
          return { label: `${i + 1}月`, monthIndex: i, total: mData.reduce((s, item) => s + Number(item.amount), 0), sourceSummary: getSourceSummary(mData) };
        }).filter(m => m.total > 0);
        setListData(monthly);
        setDisplayTotal(monthly.reduce((s, m) => s + m.total, 0));
      } 
      else if (drillLevel === 'MONTH_LIST') {
        // 第二層：列出 selectedYear 與 selectedMonth 的所有日期
        const monthItems = rawData.filter(item => new Date(item.created_at).getMonth() === selectedMonth && new Date(item.created_at).getFullYear() === selectedYear);
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
        // 第三層：列出該日所有明細
        const details = rawData.filter(item => new Date(item.created_at).toLocaleDateString('zh-TW') === selectedDay);
        setListData(details);
        setDisplayTotal(details.reduce((s, i) => s + Number(i.amount), 0));
      }
    }
    setLoading(false);
  };

  useEffect(() => { refreshData(); }, [viewMode, drillLevel, selectedYear, selectedMonth, selectedDay]);

  const submitData = async () => {
    const finalSource = isCustom ? customSource : source;
    const numericAmount = parseFloat(amount);
    if (numericAmount <= 0 || !finalSource) return;
    const { error } = await supabase.from('sales_records').insert([{ amount: numericAmount, source: finalSource, is_deleted: false }]);
    if (!error) { setAmount("0"); setCustomSource(""); refreshData(); }
  };

  const toggleDelete = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from('sales_records').update({ is_deleted: !currentStatus }).eq('id', id);
    if (!error) refreshData();
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-4 font-sans text-slate-900 pb-20">
      <div className="w-full max-w-md">
        
        {/* 模式切換 */}
        <div className="flex bg-white rounded-xl p-1 mb-4 shadow-sm border border-slate-200">
          <button onClick={() => { setViewMode('HISTORY'); setDrillLevel('YEAR_LIST'); }} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'HISTORY' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>歷史帳本</button>
          <button onClick={() => setViewMode('TRASH')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'TRASH' ? 'bg-red-500 text-white' : 'text-slate-400'}`}>回收站</button>
        </div>

        {/* 總額與年份切換看板 */}
        <div className="bg-white rounded-2xl p-6 mb-4 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-1">
            
            {/* 動態標題與年份選擇器 */}
            {viewMode === 'TRASH' ? (
              <p className="text-slate-400 text-xs font-bold">回收站總額</p>
            ) : drillLevel === 'YEAR_LIST' ? (
              <div className="flex items-center">
                <select 
                  value={selectedYear} 
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-slate-100 text-blue-600 text-xs font-bold py-1 px-2 rounded-md outline-none cursor-pointer border border-slate-200"
                >
                  {availableYears.map(y => <option key={y} value={y}>{y}年度</option>)}
                </select>
                <span className="text-slate-400 text-xs font-bold ml-2">總額</span>
              </div>
            ) : drillLevel === 'MONTH_LIST' ? (
              <p className="text-slate-400 text-xs font-bold">{selectedYear}年 {selectedMonth + 1}月統計</p>
            ) : (
              <p className="text-slate-400 text-xs font-bold">{selectedDay} 明細</p>
            )}

            {/* 返回按鈕 */}
            {viewMode === 'HISTORY' && drillLevel !== 'YEAR_LIST' && (
              <button onClick={() => drillLevel === 'DAY_DETAILS' ? setDrillLevel('MONTH_LIST') : setDrillLevel('YEAR_LIST')} className="text-blue-600 text-xs font-bold px-2 py-1 bg-blue-50 rounded-md">← 返回上層</button>
            )}
          </div>
          <span className="text-4xl font-black">${displayTotal.toLocaleString()}</span>
        </div>

        {/* 記帳看板 */}
        {viewMode === 'HISTORY' && drillLevel === 'YEAR_LIST' && (
          <div className="bg-slate-900 rounded-3xl p-6 mb-6 shadow-2xl">
            <h2 className="text-5xl font-mono font-bold text-green-400 text-right mb-4">${amount}</h2>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {sources.map(s => (
                <button key={s} onClick={() => {setSource(s); setIsCustom(false);}} className={`py-2 rounded-lg text-xs font-bold ${!isCustom && source === s ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'}`}>{s}</button>
              ))}
              <button onClick={() => setIsCustom(true)} className={`py-2 rounded-lg text-xs font-bold ${isCustom ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400'}`}>開放輸入</button>
            </div>
            {isCustom && <input type="text" value={customSource} onChange={(e) => setCustomSource(e.target.value)} placeholder="自定義來源..." className="w-full mb-4 p-2 rounded-lg bg-slate-800 text-white border border-slate-700 text-sm outline-none" />}
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0].map((num) => (
                <button key={num} onClick={() => num === "C" ? setAmount("0") : setAmount(prev => prev === "0" ? num.toString() : prev + num)} className="h-12 bg-slate-800 text-white rounded-xl font-bold active:bg-slate-700">{num}</button>
              ))}
              <button onClick={submitData} className="h-12 bg-blue-600 text-white rounded-xl font-bold active:bg-blue-500">送出</button>
            </div>
          </div>
        )}

        {/* 數據列表 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
            <span className="font-bold text-slate-500 text-sm">
              {viewMode === 'TRASH' ? '回收站' : drillLevel === 'YEAR_LIST' ? '各月業績統計' : drillLevel === 'MONTH_LIST' ? '每日業績統計' : '交易明細'}
            </span>
          </div>
          
          <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto">
            {listData.map((item, i) => (
              <div key={i} 
                onClick={() => drillLevel !== 'DAY_DETAILS' && viewMode !== 'TRASH' && (drillLevel === 'YEAR_LIST' ? (setSelectedMonth(item.monthIndex), setDrillLevel('MONTH_LIST')) : (setSelectedDay(item.dateKey), setDrillLevel('DAY_DETAILS')))}
                className={`p-4 hover:bg-slate-50 transition-all ${drillLevel !== 'DAY_DETAILS' && viewMode !== 'TRASH' ? 'cursor-pointer' : ''}`}>
                
                <div className="flex justify-between items-center mb-2">
                  <div className="flex flex-col">
                    <span className="font-black text-slate-700 text-lg">
                      {drillLevel === 'DAY_DETAILS' ? item.source : item.label}
                    </span>
                    {item.created_at && <span className="text-[10px] text-slate-400">{new Date(item.created_at).toLocaleTimeString()}</span>}
                  </div>
                  
                  <div className="flex items-center">
                    <span className={`font-mono font-bold ${viewMode === 'TRASH' ? 'text-red-400' : 'text-blue-600'}`}>
                      ${(item.total || item.amount).toLocaleString()}
                    </span>
                    
                    {(drillLevel === 'DAY_DETAILS' || viewMode === 'TRASH') && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleDelete(item.id, item.is_deleted); }}
                        className={`ml-4 text-[10px] px-3 py-1 rounded-full border ${viewMode === 'TRASH' ? 'border-green-200 text-green-600' : 'border-red-100 text-red-400'}`}
                      >
                        {viewMode === 'TRASH' ? '還原' : '刪除'}
                      </button>
                    )}
                    {viewMode === 'HISTORY' && drillLevel !== 'DAY_DETAILS' && <span className="ml-2 text-slate-300">›</span>}
                  </div>
                </div>

                {item.sourceSummary && drillLevel !== 'DAY_DETAILS' && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {item.sourceSummary.map((s: any) => (
                      <span key={s.name} className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md border">
                        {s.name}: <span className="text-slate-800 font-bold">${s.total.toLocaleString()}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {listData.length === 0 && !loading && (
              <div className="p-10 text-center text-slate-300 text-sm">無交易紀錄</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}