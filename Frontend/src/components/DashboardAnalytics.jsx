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
    background: #20242D;
    border: 1px solid rgba(255, 255, 255, 0.05);
    box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.25);
  }
  
  .custom-tooltip {
    background: #191B22;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 8px 12px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
  }

  .chart-title {
    color: #FFFFFF;
  }
`;

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        // The point carries the test it came from, so name it rather than
        // repeating the axis tick.
        const point = payload[0].payload || {};
        return (
            <div className="custom-tooltip">
                <p className="text-white text-xs mb-0.5 font-semibold">{point.fullName || label}</p>
                <p className="text-[#8E95A5] text-[11px] mb-1">{label}</p>
                <p className="text-[#00C4B4] font-bold text-sm">
                    {payload[0].value}%
                    {point.marks && <span className="text-[#8E95A5] font-medium ml-1.5">({point.marks})</span>}
                </p>
            </div>
        );
    }
    return null;
};

const DashboardAnalytics = ({ assignments = [] }) => {
    // Process data for charts
    const processPerformanceData = () => {
        // `score` is null on every completed assignment -- nothing populates it
        // -- so this filter used to match nothing and the chart fell through to
        // three hard-coded zeroes, drawing a flat line along the bottom that
        // looked like a student who had scored 0 on everything. `scorePercent`
        // is the graded percentage the server derives from the submission.
        const graded = assignments
            .filter(a => a.status === 'Completed' && a.scorePercent !== null && a.scorePercent !== undefined)
            // completedAt can be missing on older rows, so fall back rather than
            // sorting on Invalid Date and scrambling the order.
            .sort((a, b) => new Date(a.completedAt || a.startTime) - new Date(b.completedAt || b.startTime))
            .slice(-8);

        return graded.map((test) => {
            const when = test.completedAt || test.startTime;
            return {
                name: when
                    ? new Date(when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    : '',
                fullName: test.testId?.title || 'Unknown Test',
                score: test.scorePercent,
                marks: test.maxScore ? `${test.totalScore} / ${test.maxScore}` : null,
            };
        });
    };

    const processStatusData = () => {
        // effectiveStatus is what the card badge shows: a test past its
        // deadline reads Overdue even though it is stored as Assigned. Grouping
        // on raw status put those slices in the wrong colour.
        const statusCounts = assignments.reduce((acc, curr) => {
            const key = curr.effectiveStatus || curr.status;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const data = [
            { name: 'Completed', value: statusCounts['Completed'] || 0, color: '#34D399' }, // Mint
            { name: 'Assigned', value: statusCounts['Assigned'] || 0, color: '#00C4B4' },  // Cyan/Teal
            { name: 'In Progress', value: statusCounts['In Progress'] || 0, color: '#FB923C' }, // Orange
            { name: 'Overdue', value: statusCounts['Overdue'] || 0, color: '#F87171' },    // Rose
        ];

        // Filter out zero values to look cleaner
        return data.filter(item => item.value > 0);
    };

    const performanceData = processPerformanceData();
    const statusData = processStatusData();
    const hasData = performanceData.length > 0;
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

                <div className="flex-1 w-full min-h-0 relative">
                    {!hasData ? (
                        <div className="absolute inset-0 flex items-center justify-center flex-col text-slate-500 px-6 text-center">
                            <p className="text-sm">No graded tests yet</p>
                            <p className="text-xs mt-1 text-slate-600">Your scores will appear here once a test has been evaluated.</p>
                        </div>
                    ) : (
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
                                isAnimationActive={false}
                                type="monotone"
                                dataKey="score"
                                stroke="#00C4B4"
                                strokeWidth={3}
                                dot={{ r: 4, fill: '#191B22', stroke: '#00C4B4', strokeWidth: 2 }}
                                activeDot={{ r: 6, fill: '#00C4B4', stroke: '#fff', strokeWidth: 2 }}
                                animationDuration={1500}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                    )}
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
