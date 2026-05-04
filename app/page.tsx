"use client";
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// 1. 嚴格型別定義 (TypeScript Interfaces)
type ViewMode = 'HISTORY' | 'TRASH';
type DrillLevel = 'YEAR_LIST' | 'MONTH_LIST' | 'DAY_DETAILS';

interface SalesRecord {
  id: string;
  amount: number;
  source: string;
  is_deleted: boolean;
  created_at: string;
}

interface UIListItem extends Partial<SalesRecord> {
  label?: string;
  total?: number;
  monthIndex?: number;
  dateKey?: string;
  sourceSummary?: { name: string; total: number }[];
}

// 2. Storage 安全封裝 (防護 Safari 無痕模式崩潰)
const safeStorage = {
  get: <T,>(key: string, fallback: T): T => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : fallback;
    } catch {
      return fallback;
    }
  },
  set: (key: string, value: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("Storage 容量已滿或被禁用", e);
    }
  }
};

export default function UltimateAccountingApp() {
  const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // 狀態管理
  const [amount, setAmount] = useState("0");
  const [source, setSource] = useState("百貨");
  const [customSource, setCustomSource] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [entryDate, setEntryDate] = useState(getTodayString());
  
  const [viewMode, setViewMode] = useState<ViewMode>('HISTORY');
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('YEAR_LIST');
  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  
  const [displayTotal, setDisplayTotal] = useState(0);
  const [listData, setListData] = useState<UIListItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 系統狀態
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [showSyncToast, setShowSyncToast] = useState(false); // 同步成功提示
  const [isMounted, setIsMounted] = useState(false);

  const sources = ["百貨", "地攤", "市集", "蝦皮"];

  // 3. 核心大腦：資料抓取與轉換 (修正 Race Condition)
  const refreshData = useCallback(async (signal?: { aborted: boolean }) => {
    setLoading(true);
    let rawData: SalesRecord[] = [];
    const cacheKey = `accounting_cache_${viewMode}`;

    if (navigator.onLine) {
      const { data, error } = await supabase
        .from('sales_records')
        .select('*')
        .eq('is_deleted', viewMode === 'TRASH')
        .order('created_at', { ascending: false });

      if (!error && data) {
        rawData = data as SalesRecord[];
        safeStorage.set(cacheKey, data);
      }
    } else {
      rawData = safeStorage.get<SalesRecord[]>(cacheKey, []);
    }

    if (signal?.aborted) return; // 防禦：如果使用者已經切換畫面，直接丟棄舊的非同步結果

    if (viewMode === 'HISTORY') {
      const queue = safeStorage.get<SalesRecord[]>('accounting_sync_queue', []);
      setPendingSyncCount(queue.length);
      rawData = [...queue, ...rawData].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    if (rawData.length > 0) {
      if (viewMode !== 'TRASH') {
        const yearsArray = Array.from(new Set(rawData.map(item => new Date(item.created_at).getFullYear()))).sort((a, b) => b - a); 
        if (yearsArray.length === 0) yearsArray.push(new Date().getFullYear());
        setAvailableYears(yearsArray);
        if (!yearsArray.includes(selectedYear) && yearsArray.length > 0) setSelectedYear(yearsArray[0]);
      }

      const getSourceSummary = (filteredData: SalesRecord[]) => {
        const summary: Record<string, number> = {};
        filteredData.forEach(item => { summary[item.source] = (summary[item.source] || 0) + Number(item.amount); });
        return Object.entries(summary).map(([name, total]) => ({ name, total })).filter(s => s.total > 0);
      };

      if (viewMode === 'TRASH') {
        setListData(rawData);
        setDisplayTotal(rawData.reduce((s, i) => s + Number(i.amount), 0));
      } 
      else if (drillLevel === 'YEAR_LIST') {
        const monthly = Array.from({ length: 12 }, (_, i) => {
          const mData = rawData.filter(item => new Date(item.created_at).getMonth() === i && new Date(item.created_at).getFullYear() === selectedYear);
          return { label: `${i + 1}月`, monthIndex: i, total: mData.reduce((s, item) => s + Number(item.amount), 0), sourceSummary: getSourceSummary(mData) };
        }).filter(m => m.total! > 0).reverse();
        setListData(monthly);
        setDisplayTotal(monthly.reduce((s, m) => s + m.total!, 0));
      } 
      else if (drillLevel === 'MONTH_LIST') {
        const monthItems = rawData.filter(item => new Date(item.created_at).getMonth() === selectedMonth && new Date(item.created_at).getFullYear() === selectedYear);
        const dailyMap: Record<string, { total: number, data: SalesRecord[] }> = {};
        monthItems.forEach(item => {
          const d = new Date(item.created_at).toLocaleDateString('zh-TW');
          if (!dailyMap[d]) dailyMap[d] = { total: 0, data: [] };
          dailyMap[d].total += Number(item.amount);
          dailyMap[d].data.push(item);
        });
        const summary = Object.entries(dailyMap).map(([date, obj]) => ({ 
          label: date, total: obj.total, dateKey: date, sourceSummary: getSourceSummary(obj.data) 
        })).sort((a, b) => new Date(b.dateKey).getTime() - new Date(a.dateKey).getTime());
        setListData(summary);
        setDisplayTotal(summary.reduce((s, d) => s + d.total, 0));
      }
      else if (drillLevel === 'DAY_DETAILS' && selectedDay) {
        const details = rawData.filter(item => new Date(item.created_at).toLocaleDateString('zh-TW') === selectedDay);
        setListData(details);
        setDisplayTotal(details.reduce((s, i) => s + Number(i.amount), 0));
      }
    } else {
      setListData([]);
      setDisplayTotal(0);
    }
    setLoading(false);
  }, [viewMode, drillLevel, selectedYear, selectedMonth, selectedDay]);

  // 4. 背景同步機制 (修正 useCallback 相依)
  const syncOfflineData = useCallback(async () => {
    const queue = safeStorage.get<SalesRecord[]>('accounting_sync_queue', []);
    if (queue.length === 0) return;

    let remainingQueue = [];
    let successCount = 0;
    
    for (const item of queue) {
      const { id, ...dbItem } = item; // 剝離本地 id，讓 Supabase 自行產生 UUID
      const { error } = await supabase.from('sales_records').insert([dbItem]);
      if (error) {
        remainingQueue.push(item);
      } else {
        successCount++;
      }
    }

    safeStorage.set('accounting_sync_queue', remainingQueue);
    setPendingSyncCount(remainingQueue.length);
    
    if (successCount > 0) {
      setShowSyncToast(true);
      setTimeout(() => setShowSyncToast(false), 3000);
      refreshData({ aborted: false });
    }
  }, [refreshData]);

  // 掛載與網路監聽
  useEffect(() => {
    setIsMounted(true);
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) syncOfflineData();
    };

    setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    if (navigator.onLine) syncOfflineData();

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, [syncOfflineData]);

  // 觸發資料刷新 (帶有 Race Condition 防護)
  useEffect(() => {
    const signal = { aborted: false };
    refreshData(signal);
    return () => { signal.aborted = true; }; // Cleanup: 標記為作廢
  }, [refreshData]);

  // 5. 數字鍵盤輸入 (加入長度保護)
  const handleInput = (val: string) => {
    if (val === "C") {
      setAmount("0");
      return;
    }
    setAmount(prev => {
      const newVal = prev === "0" ? val : prev + val;
      if (newVal.length > 8) return prev; // 防呆：限制最高 8 位數 (99,999,999)
      return newVal;
    });
  };

  const submitData = async () => {
    const finalSource = isCustom ? customSource : source;
    const numericAmount = parseFloat(amount);
    if (numericAmount <= 0 || !finalSource) return;

    const now = new Date();
    const timeString = now.toTimeString().split(' ')[0];
    const insertTimestamp = new Date(`${entryDate}T${timeString}`).toISOString();
    const newItem = { amount: numericAmount, source: finalSource, is_deleted: false, created_at: insertTimestamp };

    if (navigator.onLine) {
      const { error } = await supabase.from('sales_records').insert([newItem]);
      if (!error) { setAmount("0"); setCustomSource(""); refreshData(); }
    } else {
      const queue = safeStorage.get<any[]>('accounting_sync_queue', []);
      const localItem = { ...newItem, id: `local_${Date.now()}` };
      queue.push(localItem);
      safeStorage.set('accounting_sync_queue', queue);
      
      setAmount("0");
      setCustomSource("");
      refreshData();
    }
  };

  // 6. 樂觀更新 (Optimistic UI) 刪除操作
  const toggleDelete = async (id: string, currentStatus: boolean) => {
    if (!navigator.onLine) {
      alert("⚠️ 離線狀態下無法進行刪除或還原操作，請等待網路恢復。");
      return;
    }
    if (id.startsWith('local_')) {
      alert("⚠️ 這筆資料尚未同步到伺服器，同步後即可刪除。");
      return;
    }

    // [樂觀更新]：先從畫面上移除，讓使用者感覺瞬間完成
    setListData(prev => prev.filter(item => item.id !== id));

    // 背景執行真實資料庫更新
    const { error } = await supabase.from('sales_records').update({ is_deleted: !currentStatus }).eq('id', id);
    if (error) {
      alert("更新失敗，正在回復資料狀態");
      refreshData(); // 如果失敗，重新向伺服器拉回真實狀態
    }
  };

  if (!isMounted) return null;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-4 font-sans text-slate-900 pb-20 relative">
      
      {/* 浮動 Toast 提示 */}
      {showSyncToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 bg-green-500 text-white px-6 py-2 rounded-full shadow-lg font-bold text-sm z-50 animate-bounce">
          ✅ 離線資料已成功同步！
        </div>
      )}

      <div className="w-full max-w-md mt-2">
        {/* 離線狀態指示器 */}
        {!isOnline && (
          <div className="bg-orange-500 text-white text-xs font-bold text-center py-2 rounded-xl mb-4 shadow-md flex justify-between px-4 animate-pulse">
            <span>⚠️ 離線模式：目前無網路連接</span>
            {pendingSyncCount > 0 && <span>等待同步: {pendingSyncCount} 筆</span>}
          </div>
        )}

        {/* 模式切換 */}
        <div className="flex bg-white rounded-xl p-1 mb-4 shadow-sm border border-slate-200">
          <button onClick={() => { setViewMode('HISTORY'); setDrillLevel('YEAR_LIST'); }} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'HISTORY' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>歷史帳本</button>
          <button onClick={() => setViewMode('TRASH')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'TRASH' ? 'bg-red-500 text-white' : 'text-slate-400'}`}>回收站</button>
        </div>

        {/* 總額與年份切換看板 */}
        <div className="bg-white rounded-2xl p-6 mb-4 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-1">
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
            {viewMode === 'HISTORY' && drillLevel !== 'YEAR_LIST' && (
              <button onClick={() => drillLevel === 'DAY_DETAILS' ? setDrillLevel('MONTH_LIST') : setDrillLevel('YEAR_LIST')} className="text-blue-600 text-xs font-bold px-2 py-1 bg-blue-50 rounded-md">← 返回</button>
            )}
          </div>
          <span className="text-4xl font-black">${displayTotal.toLocaleString()}</span>
        </div>

        {/* 記帳看板 */}
        {viewMode === 'HISTORY' && drillLevel === 'YEAR_LIST' && (
          <div className="bg-slate-900 rounded-3xl p-6 mb-6 shadow-2xl relative overflow-hidden">
            {!isOnline && <div className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] px-3 py-1 font-bold rounded-bl-xl z-10">離線儲存中</div>}

            <div className="flex justify-between items-center mb-4 bg-slate-800 p-2 rounded-xl">
              <span className="text-slate-400 text-xs font-bold ml-2">入帳日期</span>
              <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} max={getTodayString()} className="bg-transparent text-white text-sm outline-none font-mono cursor-pointer" />
            </div>

            <h2 className="text-5xl font-mono font-bold text-green-400 text-right mb-4">${amount}</h2>
            
            <div className="grid grid-cols-3 gap-2 mb-4">
              {sources.map(s => (
                <button key={s} onClick={() => {setSource(s); setIsCustom(false);}} className={`py-2 rounded-lg text-xs font-bold transition-colors ${!isCustom && source === s ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'}`}>{s}</button>
              ))}
              <button onClick={() => setIsCustom(true)} className={`py-2 rounded-lg text-xs font-bold transition-colors ${isCustom ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400'}`}>開放輸入</button>
            </div>
            {isCustom && <input type="text" value={customSource} onChange={(e) => setCustomSource(e.target.value)} placeholder="自定義來源..." className="w-full mb-4 p-2 rounded-lg bg-slate-800 text-white border border-slate-700 text-sm outline-none" />}
            
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0].map((num) => (
                <button key={num} onClick={() => handleInput(num.toString())} className="h-12 bg-slate-800 text-white rounded-xl font-bold active:bg-slate-700 transition-colors">{num}</button>
              ))}
              <button onClick={submitData} className={`h-12 text-white rounded-xl font-bold transition-colors ${!isOnline ? 'bg-orange-500 active:bg-orange-600' : 'bg-blue-600 active:bg-blue-700'}`}>送出</button>
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
                onClick={() => drillLevel !== 'DAY_DETAILS' && viewMode !== 'TRASH' && (drillLevel === 'YEAR_LIST' ? (setSelectedMonth(item.monthIndex!), setDrillLevel('MONTH_LIST')) : (setSelectedDay(item.dateKey!), setDrillLevel('DAY_DETAILS')))}
                className={`p-4 hover:bg-slate-50 transition-all ${drillLevel !== 'DAY_DETAILS' && viewMode !== 'TRASH' ? 'cursor-pointer' : ''} ${item.id?.startsWith('local_') ? 'bg-orange-50/50' : ''}`}>
                
                <div className="flex justify-between items-center mb-2">
                  <div className="flex flex-col">
                    <span className="font-black text-slate-700 text-lg flex items-center gap-2">
                      {drillLevel === 'DAY_DETAILS' ? item.source : item.label}
                      {item.id?.startsWith('local_') && <span className="text-[8px] bg-orange-100 text-orange-600 px-1 py-0.5 rounded border border-orange-200">未同步</span>}
                    </span>
                    {item.created_at && <span className="text-[10px] text-slate-400">{new Date(item.created_at).toLocaleTimeString()}</span>}
                  </div>
                  
                  <div className="flex items-center">
                    <span className={`font-mono font-bold ${viewMode === 'TRASH' ? 'text-red-400' : 'text-blue-600'}`}>
                      ${(item.total || item.amount)?.toLocaleString()}
                    </span>
                    
                    {(drillLevel === 'DAY_DETAILS' || viewMode === 'TRASH') && item.id && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleDelete(item.id!, !!item.is_deleted); }}
                        className={`ml-4 text-[10px] px-3 py-1 rounded-full border transition-colors ${viewMode === 'TRASH' ? 'border-green-200 text-green-600 hover:bg-green-50' : 'border-red-100 text-red-400 hover:bg-red-50'} ${!isOnline ? 'opacity-30 cursor-not-allowed' : ''}`}
                      >
                        {viewMode === 'TRASH' ? '還原' : '刪除'}
                      </button>
                    )}
                    {viewMode === 'HISTORY' && drillLevel !== 'DAY_DETAILS' && <span className="ml-2 text-slate-300">›</span>}
                  </div>
                </div>

                {item.sourceSummary && drillLevel !== 'DAY_DETAILS' && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {item.sourceSummary.map((s) => (
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