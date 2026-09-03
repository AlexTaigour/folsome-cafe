import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { Calendar, Loader2 } from 'lucide-react';
import { analytics } from '../../api/client';
import CountUp from '../../components/reactbits/CountUp';

const RANGES = {
  Today: () => new Date(new Date().setHours(0, 0, 0, 0)),
  Week: () => new Date(Date.now() - 7 * 864e5),
  Month: () => new Date(Date.now() - 30 * 864e5),
  '6 Months': () => new Date(Date.now() - 182 * 864e5),
  Year: () => new Date(Date.now() - 365 * 864e5),
  'All Time': () => null,
};

function StatCard({ label, value, prefix = '', suffix = '', accent = 'text-chiya' }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">{label}</p>
      <CountUp value={value} prefix={prefix} suffix={suffix} className={`text-3xl font-black ${accent}`} />
    </div>
  );
}

export default function AnalyticsTab() {
  const [range, setRange] = useState('Month');
  const [data, setData] = useState(null);

  const from = useMemo(() => {
    const d = RANGES[range]();
    return d ? d.toISOString() : undefined;
  }, [range]);

  useEffect(() => {
    let live = true;
    setData(null);
    Promise.all([
      analytics.summary(from),
      analytics.salesByDay(from),
      analytics.topItems(from),
      analytics.peakHours(from),
      analytics.prepTimes(from),
    ]).then(([summary, salesByDay, topItems, peakHours, prepTimes]) => {
      if (live) setData({ summary, salesByDay, topItems, peakHours, prepTimes });
    }).catch(() => live && setData({ error: true }));
    return () => { live = false; };
  }, [from]);

  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-espresso" size={40} />
      </div>
    );
  }
  if (data.error) return <p className="text-red-500 font-bold">Failed to load analytics.</p>;

  const { summary, salesByDay, topItems, peakHours, prepTimes } = data;
  const hourData = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h}:00`,
    orders: peakHours.find((p) => p.hour === h)?.orders || 0,
  }));

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
        <h2 className="text-3xl font-black text-bean tracking-tight">Analytics</h2>
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm">
          <Calendar size={18} className="text-gray-500" />
          <select value={range} onChange={(e) => setRange(e.target.value)} className="bg-white text-sm font-bold outline-none">
            {Object.keys(RANGES).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="Revenue" value={summary.revenue} prefix="Rs. " />
        <StatCard label="Orders" value={summary.orderCount} accent="text-espresso" />
        <StatCard label="Avg Order" value={summary.avgOrderValue} prefix="Rs. " accent="text-espresso" />
        <StatCard label="Cancelled" value={summary.cancelledCount} accent="text-red-400" />
        <StatCard
          label="Avg Prep Time"
          value={prepTimes?.avgPrepMinutes ?? 0}
          suffix=" min"
          accent="text-purple-500"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-black text-bean mb-4">Daily Sales</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={salesByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`Rs. ${v}`, 'Revenue']} />
              <Bar dataKey="revenue" fill="#c76b2a" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-black text-bean mb-4">Peak Hours</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={hourData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Area dataKey="orders" stroke="#6f4e37" fill="#d9b382" fillOpacity={0.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 lg:col-span-2">
          <h3 className="text-lg font-black text-bean mb-4">Top Items</h3>
          {topItems.length === 0 ? (
            <p className="text-gray-400 text-sm">No sales in this range.</p>
          ) : (
            <div className="space-y-3">
              {topItems.map((item, i) => {
                const max = topItems[0].qty || 1;
                return (
                  <div key={item.name} className="flex items-center gap-4">
                    <span className="w-6 text-right font-black text-gray-300">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm font-bold mb-1">
                        <span className="truncate text-bean">{item.name}</span>
                        <span className="text-gray-400 shrink-0 ml-2">{item.qty} sold · Rs. {item.revenue}</span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-chiya rounded-full" style={{ width: `${(item.qty / max) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
