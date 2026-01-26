import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend
} from 'recharts';

const styles = `
  .analytics-card {
    background: rgba(30, 41, 59, 0.5);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }
  
  .custom-tooltip {
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 8px 12px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
  }

  .chart-title {
    background: linear-gradient(to right, #e2e8f0, #94a3b8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="custom-tooltip">
                <p className="text-gray-300 text-xs mb-1">{label}</p>
                <p className="text-white font-bold text-sm" style={{ color: payload[0].color }}>
                    {`${payload[0].name}: ${payload[0].value}%`}
                </p>
            </div>
        );
    }
    return null;
};

const DashboardAnalytics = ({ assignments = [] }) => {
    // Process data for charts
    const processPerformanceData = () => {
        // Get completed tests sorted by completion date
        const completed = assignments
            .filter(a => a.status === 'Completed' && a.score !== null)
            .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt))
            .slice(-5); // Last 5 tests

        if (completed.length === 0) {
            // Return placeholder data if no tests completed
            return [
                { name: 'Test 1', score: 0 },
                { name: 'Test 2', score: 0 },
                { name: 'Test 3', score: 0 },
            ];
        }

        return completed.map((test, index) => ({
            name: `Test ${index + 1}`,
            fullName: test.testId?.title || 'Unknown Test',
            score: test.score || 0,
            date: new Date(test.completedAt).toLocaleDateString()
        }));
    };

    const processStatusData = () => {
        const statusCounts = assignments.reduce((acc, curr) => {
            acc[curr.status] = (acc[curr.status] || 0) + 1;
            return acc;
        }, {});

        const data = [
            { name: 'Completed', value: statusCounts['Completed'] || 0, color: '#10B981' }, // Emerald-500
            { name: 'Assigned', value: statusCounts['Assigned'] || 0, color: '#3B82F6' },  // Blue-500
            { name: 'In Progress', value: statusCounts['In Progress'] || 0, color: '#F59E0B' }, // Amber-500
            { name: 'Overdue', value: statusCounts['Overdue'] || 0, color: '#EF4444' },    // Red-500
        ];

        // Filter out zero values to look cleaner
        return data.filter(item => item.value > 0);
    };

    const performanceData = processPerformanceData();
    const statusData = processStatusData();
    const hasData = assignments.some(a => a.status === 'Completed' && a.score !== null);
    const hasStatusData = assignments.length > 0;

    return (
        <div className="dashboard-analytics grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <style>{styles}</style>

            {/* Performance Trend Chart */}
            <div className="analytics-card rounded-2xl p-6 flex flex-col h-[350px]">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="chart-title text-lg font-bold">Performance Trend</h3>
                    {!hasData && <span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-1 rounded">No Data Yet</span>}
                </div>

                <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={performanceData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis
                                dataKey="name"
                                stroke="#64748b"
                                tick={{ fill: '#64748b', fontSize: 12 }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#64748b"
                                tick={{ fill: '#64748b', fontSize: 12 }}
                                tickLine={false}
                                axisLine={false}
                                domain={[0, 100]}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }} />
                            <Line
                                type="monotone"
                                dataKey="score"
                                stroke="#8B5CF6"
                                strokeWidth={3}
                                dot={{ r: 4, fill: '#1e293b', stroke: '#8B5CF6', strokeWidth: 2 }}
                                activeDot={{ r: 6, fill: '#8B5CF6', stroke: '#fff', strokeWidth: 2 }}
                                animationDuration={1500}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Status Distribution Chart */}
            <div className="analytics-card rounded-2xl p-6 flex flex-col h-[350px]">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="chart-title text-lg font-bold">Test Status Distribution</h3>
                    {!hasStatusData && <span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-1 rounded">No Data Yet</span>}
                </div>

                <div className="flex-1 w-full min-h-0 relative">
                    {hasStatusData ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                    itemStyle={{ color: '#fff' }}
                                    formatter={(value, name) => [`${value} Tests`, name]}
                                />
                                <Legend
                                    verticalAlign="bottom"
                                    height={36}
                                    iconType="circle"
                                    formatter={(value) => <span className="text-slate-400 text-sm ml-1">{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center flex-col text-slate-500">
                            <div className="w-24 h-24 rounded-full border-4 border-slate-700/50 mb-4 border-t-slate-600 animate-spin-slow"></div>
                            <p className="text-sm">No assignments found</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardAnalytics;
