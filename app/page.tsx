"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// 定義鑽取深度
type DrillLevel = 'YEAR_SUMMARY' | 'MONTH_SUMMARY' | 'DAY_DETAILS';

export default function AdvancedAccounting() {
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('YEAR_SUMMARY');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 核心數據抓取邏輯
  const fetchAdvancedData = async () => {
    setLoading(true);
    let query = supabase.from('sales_records').select('*').eq('is_deleted', false);

    // 根據當前層級篩選範圍
    const startDate = new Date(selectedYear, 0, 1);
    const endDate = new Date(selectedYear + 1, 0, 1);
    query = query.gte('created_at', startDate.toISOString()).lt('created_at', endDate.toISOString());

    const { data: rawData, error } = await query.order('created_at', { ascending: false });

    if (!error && rawData) {
      if (drillLevel === 'YEAR_SUMMARY') {
        // 邏輯：按月分組
        const monthly = Array.from({ length: 12 }, (_, i) => ({
          label: `${i + 1}月`,
          monthIndex: i,
          total: rawData.filter(item => new Date(item.created_at).getMonth() === i)
                       .reduce((sum, item) => sum + Number(item.amount), 0)
        })).filter(m => m.total > 0);
        setData(monthly);
      } 
      else if (drillLevel === 'MONTH_SUMMARY' && selectedMonth !== null) {
        // 邏輯：按日分組
        const monthData = rawData.filter(item => new Date(item.created_at).getMonth() === selectedMonth);
        const dailyMap: Record<string, number> = {};
        monthData.forEach(item => {
          const day = new Date(item.created_at).toLocaleDateString();
          dailyMap[day] = (dailyMap[day] || 0) + Number(item.amount);
        });
        setData(Object.entries(dailyMap).map(([day, total]) => ({ label: day, total, rawDate: day })));
      }
      else if (drillLevel === 'DAY_DETAILS' && selectedDay) {
        // 邏輯：顯示當日明細
        setData(rawData.filter(item => new Date(item.created_at).toLocaleDateString() === selectedDay));
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchAdvancedData(); }, [drillLevel, selectedYear, selectedMonth, selectedDay]);

  // 回退導覽邏輯
  const goBack = () => {
    if (drillLevel === 'DAY_DETAILS') setDrillLevel('MONTH_SUMMARY');
    else if (drillLevel === 'MONTH_SUMMARY') setDrillLevel('YEAR_SUMMARY');
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 flex flex-col items-center">
      <div className="w-full max-w-md">
        
        {/* 導覽標題 */}
        <div className="flex items-center mb-4">
          {drillLevel !== 'YEAR_SUMMARY' && (
            <button onClick={goBack} className="mr-2 text-blue-600 font-bold">← 返回</button>
          )}
          <h1 className="text-xl font-black text-slate-800">
            {selectedYear}年 {selectedMonth !== null && `${selectedMonth + 1}月`} 歷史交易
          </h1>
        </div>

        {/* 數據清單 */}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-slate-400">讀取數據中...</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {data.map((item, index) => (
                <div 
                  key={index} 
                  onClick={() => {
                    if (drillLevel === 'YEAR_SUMMARY') {
                      setSelectedMonth(item.monthIndex);
                      setDrillLevel('MONTH_SUMMARY');
                    } else if (drillLevel === 'MONTH_SUMMARY') {
                      setSelectedDay(item.rawDate);
                      setDrillLevel('DAY_DETAILS');
                    }
                  }}
                  className="p-4 flex justify-between items-center hover:bg-slate-50 cursor-pointer"
                >
                  <div>
                    <p className="font-bold text-slate-700">{item.label || `$${Number(item.amount).toLocaleString()}`}</p>
                    {item.created_at && <p className="text-[10px] text-slate-400">{new Date(item.created_at).toLocaleTimeString()}</p>}
                  </div>
                  <div className="flex items-center">
                    <span className="text-blue-600 font-mono font-bold">
                      ${(item.total || item.amount).toLocaleString()}
                    </span>
                    {drillLevel !== 'DAY_DETAILS' && <span className="ml-2 text-slate-300">›</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}