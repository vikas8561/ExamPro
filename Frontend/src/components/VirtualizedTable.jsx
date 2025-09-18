import React, { useMemo, useState, useCallback } from 'react';

const VirtualizedTable = ({ 
  data, 
  columns, 
  height = 400, 
  itemHeight = 50,
  onRowClick,
  className = ""
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  
  const visibleItems = useMemo(() => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(height / itemHeight) + 1,
      data.length
    );
    
    return {
      startIndex,
      endIndex,
      items: data.slice(startIndex, endIndex)
    };
  }, [data, scrollTop, height, itemHeight]);

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  const totalHeight = data.length * itemHeight;
  const offsetY = visibleItems.startIndex * itemHeight;

  return (
    <div 
      className={`overflow-auto ${className}`}
      style={{ height }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-800 z-10">
              <tr>
                {columns.map((column, index) => (
                  <th 
                    key={index}
                    className="p-4 text-left text-slate-300 font-semibold border-b border-slate-700"
                    style={{ width: column.width }}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleItems.items.map((item, index) => (
                <tr 
                  key={visibleItems.startIndex + index}
                  className="border-b border-slate-700 hover:bg-slate-700 transition-colors cursor-pointer"
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map((column, colIndex) => (
                    <td 
                      key={colIndex}
                      className="p-4 text-slate-200"
                      style={{ width: column.width }}
                    >
                      {column.render ? column.render(item) : item[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default VirtualizedTable;
