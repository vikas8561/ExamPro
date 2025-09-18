import React, { useMemo, useCallback, useState, useRef } from 'react';
import { useVirtualization } from '../hooks/useVirtualization';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

const AdvancedVirtualizedTable = ({ 
  data, 
  columns, 
  height = 400, 
  itemHeight = 50,
  onRowClick,
  onRowSelect,
  selectable = false,
  searchable = false,
  sortable = false,
  className = "",
  loading = false,
  emptyMessage = "No data available"
}) => {
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [searchTerm, setSearchTerm] = useState('');
  const tableRef = useRef(null);

  // Memoized filtered and sorted data
  const processedData = useMemo(() => {
    let result = [...data];

    // Apply search filter
    if (searchTerm && searchable) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(item => 
        columns.some(col => {
          const value = col.render ? col.render(item) : item[col.key];
          return String(value).toLowerCase().includes(searchLower);
        })
      );
    }

    // Apply sorting
    if (sortConfig.key && sortable) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data, searchTerm, sortConfig, columns, searchable, sortable]);

  // Virtualization hook
  const {
    visibleItems,
    visibleRange,
    totalHeight,
    offsetY,
    handleScroll,
    scrollToIndex,
    containerRef
  } = useVirtualization({
    items: processedData,
    itemHeight,
    containerHeight: height
  });

  // Handle row selection
  const handleRowSelect = useCallback((item, index) => {
    if (!selectable) return;
    
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
    onRowSelect?.(Array.from(newSelected).map(i => processedData[i]));
  }, [selectedRows, selectable, onRowSelect, processedData]);

  // Handle sorting
  const handleSort = useCallback((key) => {
    if (!sortable) return;
    
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, [sortable]);

  // Handle search
  const handleSearch = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  // Lazy loading for images in cells
  const LazyImage = ({ src, alt, className }) => {
    const [imageRef, imageSrc] = useIntersectionObserver({
      threshold: 0,
      rootMargin: '50px'
    });

    return (
      <img
        ref={imageRef}
        src={imageSrc || src}
        alt={alt}
        className={className}
        loading="lazy"
      />
    );
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-${height} ${className}`}>
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Search and controls */}
      {(searchable || sortable) && (
        <div className="mb-4 flex items-center gap-4">
          {searchable && (
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={handleSearch}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          {selectable && selectedRows.size > 0 && (
            <div className="text-sm text-slate-400">
              {selectedRows.size} selected
            </div>
          )}
        </div>
      )}

      {/* Table container */}
      <div 
        ref={containerRef}
        className="overflow-auto border border-slate-700 rounded-lg"
        style={{ height }}
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-800 z-10">
                <tr>
                  {selectable && (
                    <th className="p-4 text-left border-b border-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedRows.size === processedData.length && processedData.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRows(new Set(processedData.map((_, i) => i)));
                          } else {
                            setSelectedRows(new Set());
                          }
                        }}
                        className="rounded border-slate-600"
                      />
                    </th>
                  )}
                  {columns.map((column, index) => (
                    <th 
                      key={index}
                      className={`p-4 text-left text-slate-300 font-semibold border-b border-slate-700 ${
                        sortable ? 'cursor-pointer hover:bg-slate-700' : ''
                      }`}
                      style={{ width: column.width }}
                      onClick={() => sortable && handleSort(column.key)}
                    >
                      <div className="flex items-center gap-2">
                        {column.header}
                        {sortable && sortConfig.key === column.key && (
                          <span className="text-blue-400">
                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleItems.length === 0 ? (
                  <tr>
                    <td 
                      colSpan={columns.length + (selectable ? 1 : 0)}
                      className="p-8 text-center text-slate-400"
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  visibleItems.map((item, index) => {
                    const actualIndex = visibleRange.startIndex + index;
                    const isSelected = selectedRows.has(actualIndex);
                    
                    return (
                      <tr 
                        key={actualIndex}
                        className={`border-b border-slate-700 hover:bg-slate-700 transition-colors ${
                          isSelected ? 'bg-blue-900/20' : ''
                        } ${onRowClick ? 'cursor-pointer' : ''}`}
                        onClick={() => onRowClick?.(item)}
                      >
                        {selectable && (
                          <td className="p-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleRowSelect(item, actualIndex)}
                              className="rounded border-slate-600"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                        )}
                        {columns.map((column, colIndex) => (
                          <td 
                            key={colIndex}
                            className="p-4 text-slate-200"
                            style={{ width: column.width }}
                          >
                            {column.render ? column.render(item, actualIndex) : item[column.key]}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer with stats */}
      <div className="mt-2 flex justify-between items-center text-sm text-slate-400">
        <div>
          Showing {visibleRange.startIndex + 1} to {Math.min(visibleRange.endIndex + 1, processedData.length)} of {processedData.length} results
        </div>
        {searchTerm && (
          <div>
            Filtered from {data.length} total items
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvancedVirtualizedTable;
